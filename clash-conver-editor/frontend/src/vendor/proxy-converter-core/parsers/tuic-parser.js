/**
 * TUIC 协议解析器：将 tuic:// 分享链接解析为标准化 ProxyNode。
 *
 * 常见格式（示例）：
 * - tuic://uuid:password@server:port?sni=example.com&alpn=h3&insecure=1#节点名
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/tuic-parser
 */

import {
  splitUrlLoosely,
  parseAuthority,
  parseQuery,
  safeDecodeURIComponent,
  base64DecodeUtf8,
  isUuid,
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

function normalizeUuid(uuidRaw, warnings) {
  const raw = asString(uuidRaw).trim();
  if (!raw) {
    warnings.push("缺少 uuid（userinfo 或 query）");
    return "";
  }
  if (isUuid(raw)) return raw;

  const decoded = base64DecodeUtf8(raw);
  const d = asString(decoded).trim();
  if (d && isUuid(d)) {
    warnings.push("检测到非标准 Base64 UUID：已成功解码为标准 UUID");
    return d;
  }

  warnings.push("uuid 不合法（已保留原值）");
  return raw;
}

export class TUICParser {
  /**
   * 解析 tuic:// URL 为标准化 ProxyNode。
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
        warnings.push("输入为空，无法解析 TUIC");
        return {
          source: "tuic",
          type: "tuic",
          name: "tuic",
          server: "",
          port: 0,
          uuid: "",
          password: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, path, query, fragment } = splitUrlLoosely(rawUrl);
      if (lower(scheme) && lower(scheme) !== "tuic") {
        warnings.push(`scheme 不是 tuic（当前为 ${asString(scheme)}），仍尝试按 TUIC 解析`);
      }

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";
      const queryObj = parseQuery(query);

      const authorityText = authority != null ? asString(authority) : asString(path);
      const a = parseAuthority(authorityText);

      const server = safeDecodeURIComponent(asString(a.host)).trim();
      const portNum = isPort(a.port) ? a.port : 0;

      const userinfo = safeDecodeURIComponent(asString(a.userinfo)).trim();
      let uuidRaw = "";
      let passwordRaw = "";
      if (userinfo) {
        const idx = userinfo.indexOf(":");
        if (idx >= 0) {
          uuidRaw = userinfo.slice(0, idx).trim();
          passwordRaw = userinfo.slice(idx + 1).trim();
        } else {
          warnings.push("TUIC userinfo 格式异常：期望 uuid:password");
          uuidRaw = userinfo.trim();
        }
      }

      const uuidFromQuery = asString(getFirstParam(queryObj, "uuid")).trim();
      const passwordFromQuery = asString(getFirstParam(queryObj, "password") ?? getFirstParam(queryObj, "pass")).trim();

      const uuid = normalizeUuid(uuidRaw || uuidFromQuery, warnings);
      const password = (passwordRaw || passwordFromQuery || "").trim();

      if (!server) warnings.push("缺少服务器地址：server");
      if (!portNum) warnings.push(`端口不合法：port=${asString(a.port)}`);
      if (!uuid) warnings.push("缺少或无效 uuid");
      if (!password) warnings.push("缺少 password");

      const name = nameFromFrag || server || "tuic";

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

      const congestionController =
        asString(
          getFirstParam(queryObj, "congestion-controller") ??
            getFirstParam(queryObj, "congestion_controller") ??
            getFirstParam(queryObj, "congestionController"),
        ).trim() || "";

      const reduceRtt = parseBooleanish(getFirstParam(queryObj, "reduce-rtt") ?? getFirstParam(queryObj, "reduce_rtt") ?? getFirstParam(queryObj, "reduceRtt"));

      const requestTimeout0 = parsePositiveInt(
        getFirstParam(queryObj, "request-timeout") ?? getFirstParam(queryObj, "request_timeout") ?? getFirstParam(queryObj, "requestTimeout"),
      );
      const requestTimeout = Number.isFinite(requestTimeout0) ? requestTimeout0 : undefined;

      const maxUdpRelayPacketSize0 = parsePositiveInt(
        getFirstParam(queryObj, "max-udp-relay-packet-size") ??
          getFirstParam(queryObj, "max_udp_relay_packet_size") ??
          getFirstParam(queryObj, "maxUdpRelayPacketSize"),
      );
      const maxUdpRelayPacketSize = Number.isFinite(maxUdpRelayPacketSize0) ? maxUdpRelayPacketSize0 : undefined;

      /** @type {any} */
      const extras = {
        query: queryObj,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "tuic",
        type: "tuic",
        name,
        server,
        port: portNum,
        uuid,
        password,
        tls,
        congestionController: congestionController || undefined,
        reduceRtt: reduceRtt || undefined,
        requestTimeout,
        maxUdpRelayPacketSize,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "tuic",
        type: "tuic",
        name: "tuic",
        server: "",
        port: 0,
        uuid: "",
        password: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default TUICParser;
