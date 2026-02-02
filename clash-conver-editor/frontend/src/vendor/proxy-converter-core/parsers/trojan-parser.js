/**
 * Trojan 协议解析器：将 trojan:// 分享链接解析为标准化 ProxyNode。
 *
 * 格式：
 * - trojan://password@server:port?security=tls&sni=...&type=ws|grpc&path=...&host=...#name
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/trojan-parser
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
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export class TrojanParser {
  /**
   * 解析 trojan:// URL 为标准化的 ProxyNode 对象。
   *
   * @param {string} url - trojan://...
   * @returns {ProxyNode}
   *
   * @example
   * const parser = new TrojanParser();
   * const node = parser.parse("trojan://password@example.com:443?security=tls#节点");
   */
  parse(url) {
    /** @type {string[]} */
    const warnings = [];

    try {
      const rawUrl = asString(url).trim();
      if (!rawUrl) {
        warnings.push("输入为空，无法解析 Trojan");
        return {
          source: "trojan",
          type: "trojan",
          name: "trojan",
          server: "",
          port: 0,
          password: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, query, fragment } = splitUrlLoosely(rawUrl);
      if (lower(scheme) && lower(scheme) !== "trojan") {
        warnings.push(`scheme 不是 trojan（当前为 ${asString(scheme)}），仍尝试按 Trojan 解析`);
      }

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";
      const queryObj = parseQuery(query);

      const a = parseAuthority(authority);
      const password = safeDecodeURIComponent(asString(a.userinfo)).trim();
      const server = safeDecodeURIComponent(asString(a.host)).trim();
      const portNum = isPort(a.port) ? a.port : 0;

      if (!password) warnings.push("缺少密码：password（userinfo）");
      if (!server) warnings.push("缺少服务器地址：server");
      if (!portNum) warnings.push(`端口不合法：port=${asString(a.port)}`);

      const name = nameFromFrag || server || "trojan";

      const securityRaw = getFirstParam(queryObj, "security");
      const security = lower(securityRaw);
      const sni = asString(getFirstParam(queryObj, "sni") ?? getFirstParam(queryObj, "peer")).trim() || null;
      const alpn = parseAlpn(queryObj ? queryObj.alpn : null);
      const allowInsecure = parseBooleanish(getFirstParam(queryObj, "allowInsecure") ?? getFirstParam(queryObj, "insecure"));

      let tlsEnabled = true;
      if (security === "none" || security === "false" || security === "0" || security === "off") {
        tlsEnabled = false;
        warnings.push("security 指定为 none/false：Trojan 通常要求 TLS，已按输入禁用 tls");
      }

      /** @type {any} */
      const tls = {
        enabled: Boolean(tlsEnabled),
        security: tlsEnabled ? "tls" : null,
        sni: sni || null,
        alpn: alpn.length ? alpn : undefined,
        insecure: allowInsecure || undefined,
      };

      const typeRaw = getFirstParam(queryObj, "type");
      const network0 = lower(typeRaw) || "tcp";
      const supported = new Set(["tcp", "ws", "grpc"]);
      const network = supported.has(network0) ? network0 : "tcp";
      if (!supported.has(network0) && network0) warnings.push(`未支持的传输层 type=${typeRaw}，已降级为 tcp`);

      /** @type {any} */
      const transport = {
        network,
        ws: undefined,
        grpc: undefined,
      };

      if (network === "ws") {
        const path = asString(getFirstParam(queryObj, "path")).trim() || "/";
        const hostHeader = asString(getFirstParam(queryObj, "host")).trim() || null;
        transport.ws = { path, host: hostHeader || undefined };
      } else if (network === "grpc") {
        const serviceName = asString(getFirstParam(queryObj, "serviceName")).trim() || null;
        const mode = asString(getFirstParam(queryObj, "mode")).trim() || null;
        transport.grpc = { serviceName: serviceName || undefined, mode: mode || undefined };
      }

      /** @type {any} */
      const extras = {
        query: queryObj,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "trojan",
        type: "trojan",
        name,
        server,
        port: portNum,
        password,
        tls,
        transport,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "trojan",
        type: "trojan",
        name: "trojan",
        server: "",
        port: 0,
        password: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default TrojanParser;
