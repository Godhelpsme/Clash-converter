/**
 * VMess 协议解析器：将 vmess://Base64(JSON) 分享链接解析为标准化 ProxyNode。
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 * - 兼容常见畸形输入：缺失 padding、base64url、URL 编码、JSON 非严格等
 *
 * @module parsers/vmess-parser
 */

import { safeDecodeURIComponent, base64DecodeUtf8, isUuid, isPort, parseQuery } from "../core/utils.js";

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

function asObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function parseNumberish(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = asString(v).trim();
  if (!s) return NaN;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseAlpn(v) {
  if (v == null) return [];
  if (Array.isArray(v)) {
    return v.map((x) => asString(x).trim()).filter(Boolean);
  }
  const s = asString(v).trim();
  if (!s) return [];
  return s
    .split(/[,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 判断字符串是否为 TLS 相关 token（而非 cipher）。
 * VMess JSON 的 security 字段有两个含义：
 * - TLS 开关：tls/reality/xtls/none/true/false/0/1/on/off
 * - Cipher：auto/aes-128-gcm/chacha20-poly1305/zero 等
 */
const TLS_TOKEN_SET = new Set(["tls", "xtls", "reality", "none", "true", "false", "1", "0", "on", "off"]);

function isTlsToken(s) {
  const t = lower(s);
  if (!t) return false;
  return TLS_TOKEN_SET.has(t);
}

function parseTlsMode(v) {
  const s = lower(v);
  if (!s || s === "none" || s === "false" || s === "0" || s === "off") return { enabled: false, security: null };
  if (s === "tls" || s === "xtls" || s === "1" || s === "true" || s === "on") return { enabled: true, security: "tls" };
  if (s === "reality") return { enabled: true, security: "reality" };
  return { enabled: false, security: null, unknown: s };
}

function normalizeUuid(uuidRaw, warnings) {
  const raw = asString(uuidRaw).trim();
  if (!raw) {
    warnings.push("缺少 id/uuid（VMess 用户 ID）");
    return "";
  }
  if (isUuid(raw)) return raw;

  const decoded = base64DecodeUtf8(raw);
  const decodedTrim = asString(decoded).trim();
  if (decodedTrim && isUuid(decodedTrim)) {
    warnings.push("检测到非标准 Base64 UUID（id），已成功解码为标准 UUID");
    return decodedTrim;
  }

  warnings.push("id（uuid）不合法（既不是标准 UUID，也无法作为 Base64 UUID 解码）");
  return raw;
}

function parseJsonLoosely(text, warnings) {
  const raw = asString(text);
  const s0 = raw.replace(/^\uFEFF/, "").trim();
  if (!s0) {
    warnings.push("VMess JSON 为空（Base64 解码后内容为空）");
    return { obj: null, raw: s0 };
  }

  try {
    const parsed = JSON.parse(s0);
    const obj = asObject(parsed);
    if (!obj) {
      warnings.push("VMess JSON 不是对象（期望 {...}，实际为数组或其他类型）");
    }
    return { obj, raw: s0 };
  } catch (_) {
    // 继续容错
  }

  try {
    const i = s0.indexOf("{");
    const j = s0.lastIndexOf("}");
    if (i >= 0 && j > i) {
      const sub = s0.slice(i, j + 1);
      try {
        const parsed = JSON.parse(sub);
        const obj = asObject(parsed);
        if (!obj) {
          warnings.push("VMess JSON 不是对象（期望 {...}，实际为数组或其他类型）");
        }
        warnings.push("VMess JSON 不是严格格式：已截取 {...} 子串后解析");
        return { obj, raw: sub };
      } catch (_) {
        // 继续容错
      }
    }
  } catch (_) {
    // 忽略
  }

  try {
    const fixed = s0.replace(/,\s*([}\]])/g, "$1");
    if (fixed !== s0) {
      try {
        const parsed = JSON.parse(fixed);
        const obj = asObject(parsed);
        if (!obj) {
          warnings.push("VMess JSON 不是对象（期望 {...}，实际为数组或其他类型）");
        }
        warnings.push("VMess JSON 不是严格格式：已尝试移除尾随逗号后解析");
        return { obj, raw: fixed };
      } catch (_) {
        // 继续兜底
      }
    }
  } catch (_) {
    // 忽略
  }

  warnings.push("VMess JSON 解析失败（无法从 Base64 解码内容中获得有效对象）");
  return { obj: null, raw: s0 };
}

export class VMessParser {
  /**
   * 解析 vmess:// URL 为标准化的 ProxyNode 对象。
   *
   * @param {string} url - vmess://Base64(JSON)
   * @returns {ProxyNode}
   *
   * @example
   * const parser = new VMessParser();
   * const node = parser.parse("vmess://eyJhZGQiOiJleGFtcGxlLmNvbSIsInBvcnQiOjQ0MywiYWlkIjowLCJpZCI6IjEyMzQifQ==");
   */
  parse(url) {
    /** @type {string[]} */
    const warnings = [];

    try {
      const rawUrl = asString(url).trim();
      if (!rawUrl) {
        warnings.push("输入为空，无法解析 VMess");
        return {
          source: "vmess",
          type: "vmess",
          name: "vmess",
          server: "",
          port: 0,
          uuid: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const m = /^([A-Za-z][A-Za-z0-9+.-]*):\/{2}/.exec(rawUrl);
      const scheme = m ? m[1] : null;
      if (scheme && lower(scheme) !== "vmess") {
        warnings.push(`scheme 不是 vmess（当前为 ${asString(scheme)}），仍尝试按 VMess 解析`);
      }

      const afterScheme = m ? rawUrl.slice(m[0].length) : rawUrl.replace(/^vmess:/i, "").replace(/^\/{2}/, "");

      const hashIndex = afterScheme.indexOf("#");
      const beforeHash = hashIndex >= 0 ? afterScheme.slice(0, hashIndex) : afterScheme;
      const fragmentRaw = hashIndex >= 0 ? afterScheme.slice(hashIndex + 1) : null;

      const qIndex = beforeHash.indexOf("?");
      const payloadRaw0 = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
      const queryRaw = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : null;

      const fragmentName = fragmentRaw != null ? safeDecodeURIComponent(fragmentRaw) : "";

      const payloadRaw = safeDecodeURIComponent(payloadRaw0);
      const decoded = base64DecodeUtf8(payloadRaw);

      /** @type {string} */
      let jsonText = "";
      if (decoded == null) {
        const maybeJson = payloadRaw.trim();
        if (maybeJson.startsWith("{") && maybeJson.endsWith("}")) {
          warnings.push("vmess:// 内容不是 Base64：检测到直接 JSON，已按 JSON 解析");
          jsonText = maybeJson;
        } else {
          warnings.push("Base64 解码失败：vmess:// payload 非法");
          jsonText = "";
        }
      } else {
        jsonText = asString(decoded).trim();
      }

      const { obj: vm, raw: jsonRawUsed } = parseJsonLoosely(jsonText, warnings);
      const vmObj = vm || {};

      const ps = asString(vmObj.ps).trim();
      const add = asString(vmObj.add ?? vmObj.server ?? vmObj.addr).trim();
      const portRaw = vmObj.port;
      const portNum0 = parseNumberish(portRaw);
      const portNum = Number.isInteger(portNum0) && isPort(portNum0) ? portNum0 : 0;
      if (!portNum) warnings.push(`端口不合法：port=${asString(portRaw)}`);

      const uuid = normalizeUuid(vmObj.id ?? vmObj.uuid, warnings);
      const alterIdRaw = vmObj.aid ?? vmObj.alterId ?? vmObj.alterID;
      const alterId0 = parseNumberish(alterIdRaw);
      const alterId = Number.isInteger(alterId0) && alterId0 >= 0 ? alterId0 : 0;
      if (alterIdRaw != null && !Number.isInteger(alterId0))
        warnings.push(`alterId 不合法：aid=${asString(alterIdRaw)}（已降级为 0）`);

      // security 字段有歧义：可能是 cipher，也可能是 TLS 开关
      // 根据值判断：如果是 TLS token（tls/reality/xtls/none/true/false/0/1），作为 TLS 字段
      // 否则作为 cipher 字段
      const securityRaw = vmObj.security;
      const securityStr = asString(securityRaw).trim();
      const isSecurityTls = isTlsToken(securityStr);

      const cipherRaw = vmObj.scy ?? vmObj.cipher ?? (!isSecurityTls && securityStr ? securityRaw : undefined);
      const cipher = asString(cipherRaw).trim() || "auto";

      if (!add) warnings.push("缺少服务器地址：add/server");
      if (uuid && !isUuid(uuid)) warnings.push("UUID 校验失败：id 不是标准 UUID（已保留原值）");

      const name = (fragmentName.trim() || ps || add || "vmess").trim();

      const tlsRaw = vmObj.tls ?? (isSecurityTls ? securityRaw : undefined) ?? vmObj.tlsMode;
      const tlsMode = parseTlsMode(tlsRaw);
      if (tlsMode.unknown) {
        warnings.push(`未知 tls 值：${asString(tlsMode.unknown)}（已按 tls=false 处理）`);
      }
      const sni = asString(vmObj.sni ?? vmObj.servername ?? vmObj.serverName).trim() || null;
      const alpn = parseAlpn(vmObj.alpn);

      const hasTlsHints = Boolean(sni || alpn.length);

      /** @type {any} */
      const tls = {
        enabled: Boolean(tlsMode.enabled),
        security: tlsMode.security,
        sni: sni || null,
        alpn: alpn.length ? alpn : undefined,
      };

      if (!tls.enabled && hasTlsHints) {
        tls.enabled = true;
        tls.security = "tls";
        warnings.push("缺少或无法识别 tls/security，已根据 TLS 参数（sni/alpn）推断为 tls=true");
      }

      if (tls.enabled && tls.security === "reality") {
        warnings.push(
          "检测到 security=reality（VMess 通常不使用 Reality）：将按 tls=true 输出，Reality 细节仅保留在 extras",
        );
      }

      const netRaw = vmObj.net ?? vmObj.network;
      const net0 = lower(netRaw) || "tcp";
      const headerType = lower(vmObj.type);

      const net1 = net0 === "tcp" && headerType === "http" ? "http" : net0;

      const supported = new Set(["tcp", "ws", "grpc", "http", "h2"]);
      const finalNetwork = supported.has(net1) ? net1 : "tcp";
      if (!supported.has(net1) && net1)
        warnings.push(
          `未支持的传输层 net=${asString(netRaw)}（Clash Meta 不支持 ${net1}，已降级为 tcp，原值保留在 extras）`,
        );

      const hostRaw = asString(vmObj.host).trim();
      const pathRaw = asString(vmObj.path).trim();

      const hostFirst = hostRaw
        ? hostRaw
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)[0] || ""
        : "";

      /** @type {any} */
      const transport = {
        network: finalNetwork,
        ws: undefined,
        grpc: undefined,
        http: undefined,
        h2: undefined,
      };

      if (finalNetwork === "ws") {
        const path = pathRaw || "/";
        transport.ws = { path, host: hostFirst || undefined };
      } else if (finalNetwork === "grpc") {
        const serviceName =
          asString(vmObj.serviceName ?? vmObj.servicename ?? vmObj["service-name"]).trim() || pathRaw || "";
        const mode = headerType || "";
        transport.grpc = { serviceName: serviceName || undefined, mode: mode || undefined };
      } else if (finalNetwork === "http") {
        const path = pathRaw || "/";
        transport.http = { path, host: hostFirst || undefined };
      } else if (finalNetwork === "h2") {
        const path = pathRaw || "/";
        transport.h2 = { path, host: hostRaw || undefined };
      }

      /** @type {any} */
      const extras = {
        v: asString(vmObj.v).trim() || undefined,
        ps: ps || undefined,
        addRaw: asString(vmObj.add ?? vmObj.server ?? vmObj.addr).trim() || undefined,
        portRaw: portRaw != null ? asString(portRaw) : undefined,
        idRaw: vmObj.id != null ? asString(vmObj.id) : undefined,
        aidRaw: alterIdRaw != null ? asString(alterIdRaw) : undefined,
        netRaw: netRaw != null ? asString(netRaw) : undefined,
        typeRaw: vmObj.type != null ? asString(vmObj.type) : undefined,
        hostRaw: hostRaw || undefined,
        pathRaw: pathRaw || undefined,
        tlsRaw: tlsRaw != null ? asString(tlsRaw) : undefined,
        query: queryRaw ? parseQuery(queryRaw) : undefined,
        rawBase64: payloadRaw || undefined,
        rawJsonText: jsonRawUsed || undefined,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "vmess",
        type: "vmess",
        name,
        server: add,
        port: portNum,
        uuid,
        alterId,
        cipher,
        tls,
        transport,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "vmess",
        type: "vmess",
        name: "vmess",
        server: "",
        port: 0,
        uuid: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default VMessParser;
