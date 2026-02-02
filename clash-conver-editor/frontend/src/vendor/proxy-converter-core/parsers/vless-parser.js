/**
 * VLESS 协议解析器：将 vless:// 分享链接解析为标准化 ProxyNode。
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 * - 兼容常见畸形输入：Base64 UUID、错误编码、缺失字段
 *
 * @module parsers/vless-parser
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

function getFirstParam(queryObj, key) {
  const v = queryObj ? queryObj[key] : undefined;
  if (v == null) return null;
  if (Array.isArray(v)) return v.length ? asString(v[0]) : null;
  return asString(v);
}

/**
 * 从原始 query 字符串中提取首个参数值（不把 '+' 当空格）。
 * 用于 Base64 场景（如 Reality pbk），避免 parseQuery() 的空格转换。
 *
 * @param {any} query - 原始 query 字符串
 * @param {string} key - 参数名
 * @returns {string|null}
 */
function getRawQueryFirstParam(query, key) {
  const raw = query == null ? "" : String(query);
  const s = raw.startsWith("?") ? raw.slice(1) : raw;
  if (!s) return null;

  try {
    const parts = s.split(/[&;]/g);
    for (const part of parts) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const kRaw = eq >= 0 ? part.slice(0, eq) : part;
      const vRaw = eq >= 0 ? part.slice(eq + 1) : "";
      const k = safeDecodeURIComponent(kRaw);
      if (k !== key) continue;
      return safeDecodeURIComponent(vRaw);
    }
  } catch (_) {
    // 忽略，返回 null 走降级逻辑
  }

  return null;
}

function lower(v) {
  return asString(v).trim().toLowerCase();
}

function parseBooleanish(v) {
  const s = lower(v);
  if (!s) return false;
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function parseAlpn(v) {
  if (v == null) return [];
  const raw = Array.isArray(v) ? v.join(",") : asString(v);
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 规范化 UUID，支持容错处理。
 *
 * 容错策略：
 * 1. 某些实现将 userinfo 写成 "uuid:xxx"（非标准），优先取 ':' 前面
 * 2. Base64 编码的 UUID（非标准，但部分工具使用）
 *
 * @param {any} uuidRaw
 * @param {string[]} warnings
 * @returns {string}
 */
function normalizeUuid(uuidRaw, warnings) {
  const raw = asString(uuidRaw).trim();
  if (!raw) {
    warnings.push("缺少 uuid（userinfo）");
    return "";
  }

  // 非标准格式：uuid:xxx（取 ':' 后面的部分）
  if (/^uuid:/i.test(raw)) {
    const tail = raw.slice(raw.indexOf(":") + 1).trim();
    if (isUuid(tail)) {
      warnings.push("检测到非标准 userinfo（uuid:xxx），已取 ':' 后的 UUID");
      return tail;
    }
    const decodedTail = base64DecodeUtf8(tail);
    const decodedTailTrim = asString(decodedTail).trim();
    if (decodedTailTrim && isUuid(decodedTailTrim)) {
      warnings.push("检测到非标准 userinfo（uuid:Base64），已成功解码为标准 UUID");
      return decodedTailTrim;
    }
  }

  if (isUuid(raw)) return raw;

  // 容错：Base64 UUID
  const decoded = base64DecodeUtf8(raw);
  const decodedTrim = asString(decoded).trim();
  if (decodedTrim && isUuid(decodedTrim)) {
    warnings.push("检测到非标准 Base64 UUID，已成功解码为标准 UUID");
    return decodedTrim;
  }

  warnings.push("UUID 非法（既不是标准 UUID，也无法作为 Base64 UUID 解码）");
  return raw;
}

export class VLESSParser {
  /**
   * 解析 vless:// URL 为标准化的 ProxyNode 对象。
   *
   * @param {string} url - vless:// URL
   * @returns {ProxyNode} 标准化节点对象
   *
   * @example
   * const parser = new VLESSParser();
   * const node = parser.parse("vless://uuid@example.com:443?security=tls&type=ws#节点");
   */
  parse(url) {
    /** @type {string[]} */
    const warnings = [];

    try {
      const rawUrl = asString(url).trim();
      const { scheme, authority, query, fragment } = splitUrlLoosely(rawUrl);

      if (lower(scheme) && lower(scheme) !== "vless") {
        warnings.push(`scheme 不是 vless（当前为 ${asString(scheme)}），仍尝试按 VLESS 解析`);
      }

      const { userinfo, host, port } = parseAuthority(authority || "");

      const uuidDecoded = safeDecodeURIComponent(userinfo || "");
      const uuid = normalizeUuid(uuidDecoded, warnings);

      const server = asString(host).trim();
      if (!server) warnings.push("缺少服务器地址（host）");

      const portNum = typeof port === "number" ? port : null;
      if (portNum == null) {
        if (server && server.includes(":") && !String(authority || "").includes("]")) {
          warnings.push("疑似 IPv6 地址未使用 [] 包裹，导致端口无法解析");
        }
        warnings.push("缺少端口（port）");
      } else if (!isPort(portNum)) {
        warnings.push(`端口非法（${portNum}），期望范围 1-65535`);
      }

      const queryObj = parseQuery(query || "");

      const decodedName = safeDecodeURIComponent(fragment == null ? "" : fragment);
      const name = decodedName.trim() || server || "vless";
      if (!decodedName || !decodedName.trim()) {
        warnings.push("缺少节点名称（fragment），已使用 host 或默认值代替");
      }

      // ---------- TLS / Reality ----------
      const securityRaw = getFirstParam(queryObj, "security");
      const security = lower(securityRaw);

      const sni = asString(getFirstParam(queryObj, "sni")).trim() || null;
      const fp = asString(getFirstParam(queryObj, "fp")).trim() || null;
      const allowInsecure = parseBooleanish(getFirstParam(queryObj, "allowInsecure"));
      const alpn = parseAlpn(queryObj ? queryObj.alpn : null);

      // 注意：utils.parseQuery 会把 '+' 还原为空格；pbk 是 Base64 时可能包含 '+'
      const pbkFromRaw = getRawQueryFirstParam(query, "pbk");
      const pbk = asString(pbkFromRaw != null ? pbkFromRaw : getFirstParam(queryObj, "pbk")).trim() || null;
      const sid = asString(getFirstParam(queryObj, "sid")).trim() || null;

      const hasTlsHints = Boolean(sni || fp || allowInsecure || alpn.length || pbk || sid);

      /** @type {any} */
      const tls = {
        enabled: false,
        security: null,
        sni: sni || null,
        alpn: alpn.length ? alpn : undefined,
        insecure: allowInsecure || undefined,
        fingerprint: fp || undefined,
        reality: undefined,
      };

      if (security === "tls" || security === "reality") {
        tls.enabled = true;
        tls.security = security;
      } else if (security) {
        warnings.push(
          `未知 security=${securityRaw}，将按"无 TLS"处理（如存在 TLS 相关参数则会尝试推断）`,
        );
      }

      if (!tls.enabled && hasTlsHints) {
        // 兼容：缺失 security 但带了 TLS/Reality 参数
        tls.enabled = true;
        tls.security = pbk || sid ? "reality" : "tls";
        warnings.push(`缺少或无法识别 security，已根据参数推断为 ${tls.security}`);
      }

      if (tls.enabled && tls.security === "reality") {
        /** @type {any} */
        const reality = {};
        if (pbk) reality.pbk = pbk;
        if (sid) reality.sid = sid;
        if (!pbk) warnings.push("security=reality 但缺少 pbk（Public Key）");
        if (sid && !/^[0-9a-fA-F]+$/.test(sid)) warnings.push("sid（Short ID）不是合法 Hex 字符串");
        tls.reality = reality;
      }

      // ---------- 传输层 ----------
      const typeRaw = getFirstParam(queryObj, "type");
      const network = lower(typeRaw) || "tcp";
      const supported = new Set(["tcp", "ws", "grpc", "http"]);
      const finalNetwork = supported.has(network) ? network : "tcp";
      if (!supported.has(network) && network) {
        warnings.push(`未知传输层 type=${typeRaw}，已降级为 tcp`);
      }

      /** @type {any} */
      const transport = {
        network: finalNetwork,
        ws: undefined,
        grpc: undefined,
        http: undefined,
      };

      if (finalNetwork === "ws") {
        const path = asString(getFirstParam(queryObj, "path")).trim() || "/";
        const hostHeader = asString(getFirstParam(queryObj, "host")).trim() || null;
        transport.ws = { path, host: hostHeader || undefined };
      } else if (finalNetwork === "grpc") {
        const serviceName = asString(getFirstParam(queryObj, "serviceName")).trim() || null;
        const mode = asString(getFirstParam(queryObj, "mode")).trim() || null;
        transport.grpc = { serviceName: serviceName || undefined, mode: mode || undefined };
      } else if (finalNetwork === "http") {
        const path = asString(getFirstParam(queryObj, "path")).trim() || "/";
        const hostHeader = asString(getFirstParam(queryObj, "host")).trim() || null;
        transport.http = { path, host: hostHeader || undefined };
      }

      // ---------- Flow（XTLS Vision） ----------
      const flow = asString(getFirstParam(queryObj, "flow")).trim() || null;

      /** @type {any} */
      const extras = {
        uuidRaw: uuidDecoded || undefined,
        flow: flow || undefined,
        query: queryObj,
        rawUrl: rawUrl || undefined,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "vless",
        type: "vless",
        name,
        server,
        port: typeof portNum === "number" ? portNum : 0,
        uuid,
        tls,
        transport,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "vless",
        type: "vless",
        name: "vless",
        server: "",
        port: 0,
        uuid: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default VLESSParser;
