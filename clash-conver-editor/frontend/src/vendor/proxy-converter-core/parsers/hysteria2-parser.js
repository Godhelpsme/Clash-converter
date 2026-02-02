/**
 * Hysteria2（hy2）协议解析器：将 hysteria2:// 或 hy2:// 分享链接解析为标准化 ProxyNode。
 *
 * 常见格式（示例）：
 * - hysteria2://password@server:port?sni=example.com&insecure=1&alpn=h3#节点名
 * - hy2://server:port?password=xxx&sni=example.com#节点名（兼容：密码在 query）
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/hysteria2-parser
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

export class Hysteria2Parser {
  /**
   * 解析 hysteria2:// 或 hy2:// URL 为标准化 ProxyNode。
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
        warnings.push("输入为空，无法解析 Hysteria2");
        return {
          source: "hysteria2",
          type: "hysteria2",
          name: "hysteria2",
          server: "",
          port: 0,
          password: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, path, query, fragment } = splitUrlLoosely(rawUrl);
      const sc = lower(scheme);
      if (sc && sc !== "hysteria2" && sc !== "hy2") {
        warnings.push(`scheme 不是 hysteria2/hy2（当前为 ${asString(scheme)}），仍尝试按 Hysteria2 解析`);
      }

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";
      const queryObj = parseQuery(query);

      const authorityText = authority != null ? asString(authority) : asString(path);
      const a = parseAuthority(authorityText);

      const server = safeDecodeURIComponent(asString(a.host)).trim();
      const portNum = isPort(a.port) ? a.port : 0;

      const passwordFromUserinfo = safeDecodeURIComponent(asString(a.userinfo)).trim();
      const passwordFromQuery =
        asString(getFirstParam(queryObj, "password") ?? getFirstParam(queryObj, "auth") ?? getFirstParam(queryObj, "passwd")).trim();
      const password = (passwordFromUserinfo || passwordFromQuery || "").trim();

      if (!server) warnings.push("缺少服务器地址：server");
      if (!portNum) warnings.push(`端口不合法：port=${asString(a.port)}`);
      if (!password) warnings.push("缺少认证信息：password（userinfo 或 query:password/auth）");

      const name = nameFromFrag || server || "hysteria2";

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
      const obfsPassword =
        asString(getFirstParam(queryObj, "obfs-password") ?? getFirstParam(queryObj, "obfsPassword") ?? getFirstParam(queryObj, "obfs_passwd")).trim() || "";

      const fastOpen = parseBooleanish(
        getFirstParam(queryObj, "fast-open") ?? getFirstParam(queryObj, "fastOpen") ?? getFirstParam(queryObj, "fastopen"),
      );

      const recvWindowConn0 = parsePositiveInt(
        getFirstParam(queryObj, "recv-window-conn") ?? getFirstParam(queryObj, "recvWindowConn") ?? getFirstParam(queryObj, "recv_window_conn"),
      );
      const recvWindow0 = parsePositiveInt(
        getFirstParam(queryObj, "recv-window") ?? getFirstParam(queryObj, "recvWindow") ?? getFirstParam(queryObj, "recv_window"),
      );
      const maxConn0 = parsePositiveInt(
        getFirstParam(queryObj, "max-conn") ?? getFirstParam(queryObj, "maxConn") ?? getFirstParam(queryObj, "max_conn"),
      );

      const recvWindowConn = Number.isFinite(recvWindowConn0) ? recvWindowConn0 : undefined;
      const recvWindow = Number.isFinite(recvWindow0) ? recvWindow0 : undefined;
      const maxConn = Number.isFinite(maxConn0) ? maxConn0 : undefined;

      const smuxEnabled = parseBooleanish(getFirstParam(queryObj, "smux"));
      const smux = smuxEnabled ? { enabled: true } : undefined;

      /** @type {any} */
      const extras = {
        query: queryObj,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "hysteria2",
        type: "hysteria2",
        name,
        server,
        port: portNum,
        password,
        tls,
        obfs: obfs || undefined,
        obfsPassword: obfsPassword || undefined,
        fastOpen: fastOpen || undefined,
        recvWindowConn,
        recvWindow,
        maxConn,
        smux,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "hysteria2",
        type: "hysteria2",
        name: "hysteria2",
        server: "",
        port: 0,
        password: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default Hysteria2Parser;
