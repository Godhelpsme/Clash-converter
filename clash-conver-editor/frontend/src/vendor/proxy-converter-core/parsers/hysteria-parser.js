/**
 * Hysteria v1 协议解析器：将 hysteria:// 分享链接解析为标准化 ProxyNode。
 *
 * 常见格式（示例，实际参数可能更多）：
 * - hysteria://server:port?auth=xxx&peer=example.com&insecure=1&alpn=h3#节点名
 * - hysteria://auth@server:port?peer=example.com#节点名（兼容：auth 在 userinfo）
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/hysteria-parser
 */

import {
  splitUrlLoosely,
  parseAuthority,
  parseQuery,
  safeDecodeURIComponent,
  isPort,
} from "../core/utils.js";

/** @typedef {import("../core/types.js").ProxyNode} ProxyNode */

function asString(v) {
  if (v == null) return "";
  try {
    return String(v);
  } catch (_) {
    return "";
  }
}

function lower(v) {
  return asString(v).trim().toLowerCase();
}

function getFirstParam(queryObj, key) {
  const v = queryObj ? queryObj[key] : undefined;
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? asString(v[0]) : null;
  return asString(v);
}

function parseBooleanish(v) {
  const s = lower(v);
  if (!s) return false;
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function parseAlpn(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => asString(x).trim()).filter(Boolean);
  const s = asString(v).trim();
  if (!s) return [];
  return s
    .split(/[,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parsePositiveInt(v) {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  const s = asString(v).trim();
  if (!s) return NaN;
  if (!/^[+]?\d+$/.test(s)) return NaN;
  const n = Number.parseInt(s, 10);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

function tryParseJsonObject(text) {
  const s = asString(text).trim();
  if (!s) return null;
  if (!(s.startsWith("{") && s.endsWith("}"))) return null;
  try {
    const obj = JSON.parse(s);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
  } catch (_) {
    return null;
  }
}

export class HysteriaParser {
  /**
   * 解析 hysteria:// URL 为标准化 ProxyNode。
   *
   * @param {string} url
   * @returns {ProxyNode}
   */
  parse(url) {
    /** @type {string[]} */
    const warnings = [];

    try {
      const rawUrl = asString(url).trim();
      if (!rawUrl) {
        warnings.push("输入为空，无法解析 Hysteria");
        return {
          source: "hysteria",
          type: "hysteria",
          name: "hysteria",
          server: "",
          port: 0,
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, path, query, fragment } = splitUrlLoosely(rawUrl);
      if (lower(scheme) && lower(scheme) !== "hysteria") {
        warnings.push(`scheme 不是 hysteria（当前为 ${asString(scheme)}），仍尝试按 Hysteria 解析`);
      }

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";
      const queryObj = parseQuery(query);

      const authorityText = authority != null ? asString(authority) : asString(path);
      const a = parseAuthority(authorityText);

      const server = safeDecodeURIComponent(asString(a.host)).trim();
      const portNum = isPort(a.port) ? a.port : 0;

      if (!server) warnings.push("缺少服务器地址：server");
      if (!portNum) warnings.push(`端口不合法：port=${asString(a.port)}`);

      const authFromUserinfo = safeDecodeURIComponent(asString(a.userinfo)).trim();
      const authRaw =
        asString(getFirstParam(queryObj, "auth-str") ?? getFirstParam(queryObj, "auth_str") ?? getFirstParam(queryObj, "auth")).trim() ||
        authFromUserinfo;

      let authStr = "";
      /** @type {any} */
      let authObj = undefined;

      if (authRaw) {
        const maybeObj = tryParseJsonObject(authRaw);
        if (maybeObj) {
          authObj = maybeObj;
          warnings.push("检测到 auth 为 JSON 对象：将输出到 Clash 的 auth 字段");
        } else {
          authStr = authRaw;
        }
      } else {
        warnings.push("缺少认证信息：auth-str/auth（query 或 userinfo）");
      }

      const sni =
        asString(getFirstParam(queryObj, "sni") ?? getFirstParam(queryObj, "peer") ?? getFirstParam(queryObj, "servername")).trim() || null;
      const alpn = parseAlpn(getFirstParam(queryObj, "alpn"));
      const allowInsecure = parseBooleanish(
        getFirstParam(queryObj, "allowInsecure") ?? getFirstParam(queryObj, "insecure") ?? getFirstParam(queryObj, "skip-cert-verify"),
      );

      /** @type {any} */
      const tls = {
        enabled: true,
        security: "tls",
        sni: sni || null,
        alpn: alpn.length ? alpn : undefined,
        insecure: allowInsecure || undefined,
      };

      const obfs = asString(getFirstParam(queryObj, "obfs")).trim() || "";

      const recvWindowConn0 = parsePositiveInt(
        getFirstParam(queryObj, "recv-window-conn") ?? getFirstParam(queryObj, "recvWindowConn") ?? getFirstParam(queryObj, "recv_window_conn"),
      );
      const recvWindow0 = parsePositiveInt(
        getFirstParam(queryObj, "recv-window") ?? getFirstParam(queryObj, "recvWindow") ?? getFirstParam(queryObj, "recv_window"),
      );
      const recvWindowConn = Number.isFinite(recvWindowConn0) ? recvWindowConn0 : undefined;
      const recvWindow = Number.isFinite(recvWindow0) ? recvWindow0 : undefined;

      const disableMtuDiscovery = parseBooleanish(
        getFirstParam(queryObj, "disable-mtu-discovery") ??
          getFirstParam(queryObj, "disableMtuDiscovery") ??
          getFirstParam(queryObj, "disable_mtu_discovery"),
      );

      const fastOpen = parseBooleanish(
        getFirstParam(queryObj, "fast-open") ?? getFirstParam(queryObj, "fastOpen") ?? getFirstParam(queryObj, "fastopen"),
      );

      const smuxEnabled = parseBooleanish(getFirstParam(queryObj, "smux"));
      const smux = smuxEnabled ? { enabled: true } : undefined;

      const name = nameFromFrag || server || "hysteria";

      /** @type {any} */
      const extras = {
        query: queryObj,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "hysteria",
        type: "hysteria",
        name,
        server,
        port: portNum,
        tls,
        authStr: authStr || undefined,
        auth: authObj,
        obfs: obfs || undefined,
        recvWindowConn,
        recvWindow,
        disableMtuDiscovery: disableMtuDiscovery || undefined,
        fastOpen: fastOpen || undefined,
        smux,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "hysteria",
        type: "hysteria",
        name: "hysteria",
        server: "",
        port: 0,
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default HysteriaParser;
