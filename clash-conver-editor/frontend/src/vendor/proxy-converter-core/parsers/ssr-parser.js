/**
 * ShadowsocksR（SSR）协议解析器：将 ssr://Base64(...) 分享链接解析为标准化 ProxyNode。
 *
 * SSR Base64 解码后常见结构：
 * - server:port:protocol:method:obfs:Base64(password)/?obfsparam=Base64(...)&protoparam=Base64(...)&remarks=Base64(...)
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/ssr-parser
 */

import { splitUrlLoosely, parseQuery, safeDecodeURIComponent, base64DecodeUtf8, isPort } from "../core/utils.js";

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
    // 忽略
  }
  return null;
}

function parseQueryNoPlus(query) {
  const raw = query == null ? "" : String(query);
  const s = raw.startsWith("?") ? raw.slice(1) : raw;
  if (!s) return Object.create(null);

  const result = Object.create(null);
  try {
    const parts = s.split(/[&;]/g);
    for (const part of parts) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const kRaw = eq >= 0 ? part.slice(0, eq) : part;
      const vRaw = eq >= 0 ? part.slice(eq + 1) : "";
      const k = safeDecodeURIComponent(kRaw);
      const v = safeDecodeURIComponent(vRaw);
      if (!k) continue;
      const prev = result[k];
      if (prev == null) {
        result[k] = v;
      } else if (Array.isArray(prev)) {
        prev.push(v);
      } else {
        result[k] = [prev, v];
      }
    }
  } catch (_) {
    // 忽略
  }
  return result;
}

function decodeBase64ToTextMaybe(b64, warnings, label) {
  const raw = asString(b64).trim();
  if (!raw) return "";
  const decoded = base64DecodeUtf8(raw);
  if (decoded == null) {
    warnings.push(`${label} Base64 解码失败（已保留原值）`);
    return raw;
  }
  return asString(decoded);
}

function parseSsrMain(main, warnings) {
  const s0 = asString(main).trim();
  if (!s0) {
    warnings.push("SSR 主体为空（Base64 解码后无 server:port:...）");
    return {
      server: "",
      port: 0,
      protocol: "",
      method: "",
      obfs: "",
      password: "",
      passwordB64: "",
    };
  }

  try {
    let rest = s0;

    const i5 = rest.lastIndexOf(":");
    if (i5 < 0) throw new Error("缺少分隔符 ':'（无法定位 password）");
    const passwordB64 = rest.slice(i5 + 1);
    rest = rest.slice(0, i5);

    const i4 = rest.lastIndexOf(":");
    if (i4 < 0) throw new Error("缺少分隔符 ':'（无法定位 obfs）");
    const obfs = rest.slice(i4 + 1);
    rest = rest.slice(0, i4);

    const i3 = rest.lastIndexOf(":");
    if (i3 < 0) throw new Error("缺少分隔符 ':'（无法定位 method）");
    const method = rest.slice(i3 + 1);
    rest = rest.slice(0, i3);

    const i2 = rest.lastIndexOf(":");
    if (i2 < 0) throw new Error("缺少分隔符 ':'（无法定位 protocol）");
    const protocol = rest.slice(i2 + 1);
    rest = rest.slice(0, i2);

    const i1 = rest.lastIndexOf(":");
    if (i1 < 0) throw new Error("缺少分隔符 ':'（无法定位 port）");
    const portRaw = rest.slice(i1 + 1);
    const server = rest.slice(0, i1);

    const pn = Number.parseInt(asString(portRaw).trim(), 10);
    const port = isPort(pn) ? pn : 0;
    if (!port) warnings.push(`端口不合法：port=${asString(portRaw)}`);

    return {
      server: server.trim(),
      port,
      protocol: asString(protocol).trim(),
      method: asString(method).trim(),
      obfs: asString(obfs).trim(),
      password: "",
      passwordB64: asString(passwordB64).trim(),
    };
  } catch (err) {
    warnings.push(`SSR 主体解析失败（已降级处理）：${asString(err && err.message ? err.message : err)}`);
    return {
      server: "",
      port: 0,
      protocol: "",
      method: "",
      obfs: "",
      password: "",
      passwordB64: "",
    };
  }
}

export class SSRParser {
  /**
   * 解析 ssr://Base64(...) URL 为标准化 ProxyNode。
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
        warnings.push("输入为空，无法解析 SSR");
        return {
          source: "ssr",
          type: "ssr",
          name: "ssr",
          server: "",
          port: 0,
          cipher: "",
          password: "",
          protocol: "",
          obfs: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, path, fragment } = splitUrlLoosely(rawUrl);
      if (lower(scheme) && lower(scheme) !== "ssr") {
        warnings.push(`scheme 不是 ssr（当前为 ${asString(scheme)}），仍尝试按 SSR 解析`);
      }

      const payloadRaw = safeDecodeURIComponent(asString(authority != null ? authority : path)).trim();
      if (!payloadRaw) {
        warnings.push("SSR payload 为空（缺少 Base64 主体）");
        return {
          source: "ssr",
          type: "ssr",
          name: "ssr",
          server: "",
          port: 0,
          cipher: "",
          password: "",
          protocol: "",
          obfs: "",
          extras: { rawUrl, rawBase64: "" },
          warnings,
        };
      }

      const decoded = base64DecodeUtf8(payloadRaw);
      if (decoded == null) {
        warnings.push("SSR Base64 解码失败：payload 非法");
        return {
          source: "ssr",
          type: "ssr",
          name: "ssr",
          server: "",
          port: 0,
          cipher: "",
          password: "",
          protocol: "",
          obfs: "",
          extras: { rawUrl, rawBase64: payloadRaw },
          warnings,
        };
      }

      const decodedText = asString(decoded).trim();
      if (!decodedText) {
        warnings.push("SSR Base64 解码后为空");
        return {
          source: "ssr",
          type: "ssr",
          name: "ssr",
          server: "",
          port: 0,
          cipher: "",
          password: "",
          protocol: "",
          obfs: "",
          extras: { rawUrl, rawBase64: payloadRaw, rawDecodedText: "" },
          warnings,
        };
      }

      let mainPart = decodedText;
      let queryPart = "";
      try {
        const idx = decodedText.indexOf("/?");
        if (idx >= 0) {
          mainPart = decodedText.slice(0, idx);
          queryPart = decodedText.slice(idx + 2);
        } else {
          const q2 = decodedText.indexOf("?");
          if (q2 >= 0) {
            mainPart = decodedText.slice(0, q2).replace(/\/+$/g, "");
            queryPart = decodedText.slice(q2 + 1);
          } else {
            mainPart = decodedText.replace(/\/+$/g, "");
            queryPart = "";
          }
        }
      } catch (_) {
        // 忽略
      }

      const mainParsed = parseSsrMain(mainPart, warnings);
      let server = safeDecodeURIComponent(asString(mainParsed.server)).trim();
      if (server.startsWith("[") && server.endsWith("]")) {
        server = server.slice(1, -1);
      }
      const port = mainParsed.port || 0;
      const protocol = asString(mainParsed.protocol).trim();
      const method = asString(mainParsed.method).trim();
      const obfs = asString(mainParsed.obfs).trim();

      const password = decodeBase64ToTextMaybe(mainParsed.passwordB64, warnings, "password").trim();

      if (!server) warnings.push("缺少服务器地址：server");
      if (!port) warnings.push("缺少或无效端口：port");
      if (!method) warnings.push("缺少加密方法：cipher/method");
      if (!password) warnings.push("缺少密码：password");
      if (!protocol) warnings.push("缺少 protocol");
      if (!obfs) warnings.push("缺少 obfs");

      const remarksB64 = getRawQueryFirstParam(queryPart, "remarks");
      const groupB64 = getRawQueryFirstParam(queryPart, "group");
      const protoparamB64 = getRawQueryFirstParam(queryPart, "protoparam");
      const obfsparamB64 = getRawQueryFirstParam(queryPart, "obfsparam");

      const remarks = remarksB64 ? decodeBase64ToTextMaybe(remarksB64, warnings, "remarks").trim() : "";
      const group = groupB64 ? decodeBase64ToTextMaybe(groupB64, warnings, "group").trim() : "";
      const protocolParam = protoparamB64 ? decodeBase64ToTextMaybe(protoparamB64, warnings, "protoparam").trim() : "";
      const obfsParam = obfsparamB64 ? decodeBase64ToTextMaybe(obfsparamB64, warnings, "obfsparam").trim() : "";

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";
      const name = nameFromFrag || remarks || server || "ssr";

      const queryObj = queryPart ? parseQueryNoPlus(queryPart) : {};

      /** @type {any} */
      const extras = {
        remarks: remarks || undefined,
        group: group || undefined,
        query: queryObj,
        rawUrl,
        rawBase64: payloadRaw,
        rawDecodedText: decodedText,
        rawInnerQuery: queryPart || undefined,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "ssr",
        type: "ssr",
        name,
        server,
        port,
        cipher: method,
        password,
        protocol,
        protocolParam: protocolParam || undefined,
        obfs,
        obfsParam: obfsParam || undefined,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "ssr",
        type: "ssr",
        name: "ssr",
        server: "",
        port: 0,
        cipher: "",
        password: "",
        protocol: "",
        obfs: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default SSRParser;
