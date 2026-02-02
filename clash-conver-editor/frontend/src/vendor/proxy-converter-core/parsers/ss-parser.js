/**
 * Shadowsocks（SS）协议解析器：将 ss:// 分享链接解析为标准化 ProxyNode。
 *
 * 支持格式：
 * - 旧版：ss://Base64(method:password)@server:port#name
 * - SIP002（Base64 全量）：ss://Base64(method:password@server:port)#name
 * - SIP002（明文）：ss://method:password@server:port?plugin=...#name
 *
 * 设计原则：
 * - 永不抛异常：所有错误通过 warnings 返回
 * - 尽量不丢信息：无法确定的字段放入 extras
 *
 * @module parsers/ss-parser
 */

import {
  splitUrlLoosely,
  parseAuthority,
  parseQuery,
  safeDecodeURIComponent,
  base64DecodeUtf8,
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

/**
 * 从原始 query 字符串中提取首个参数值（不把 ';' 当分隔符）。
 * 说明：SS 的 `plugin=` 值内部大量使用 ';'，而 utils.parseQuery 会把 ';' 当分隔符，导致 plugin 被截断。
 */
function getRawQueryFirstParamNoSemicolon(query, key) {
  const raw = query == null ? "" : String(query);
  const s = raw.startsWith("?") ? raw.slice(1) : raw;
  if (!s) return null;

  try {
    const parts = s.split("&");
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
    // 忽略，走降级逻辑
  }

  return null;
}

function parseMethodPassword(text, warnings) {
  const s = asString(text).trim();
  if (!s) {
    warnings.push("缺少 method:password");
    return { method: "", password: "" };
  }

  const idx = s.indexOf(":");
  if (idx < 0) {
    warnings.push("method:password 格式不正确（缺少 ':'）");
    return { method: s.trim(), password: "" };
  }

  const method = s.slice(0, idx).trim();
  const password = s.slice(idx + 1).trim();
  if (!method) warnings.push("缺少加密方法（cipher/method）");
  if (!password) warnings.push("缺少密码（password）");
  return { method, password };
}

function parseUserinfoToCreds(userinfoRaw, warnings) {
  const userinfo = safeDecodeURIComponent(asString(userinfoRaw)).trim();
  if (!userinfo) {
    warnings.push("缺少 userinfo（method:password 或 Base64(method:password)）");
    return { method: "", password: "", userinfoDecoded: "" };
  }

  const decoded = base64DecodeUtf8(userinfo);
  if (decoded != null) {
    const d = asString(decoded).trim();
    if (d && d.includes(":")) {
      warnings.push("检测到 Base64(method:password) 的 userinfo，已成功解码");
      const mp = parseMethodPassword(d, warnings);
      return { ...mp, userinfoDecoded: d };
    }
  }

  const mp = parseMethodPassword(userinfo, warnings);
  return { ...mp, userinfoDecoded: "" };
}

function parsePlugin(pluginValue, warnings) {
  const raw = asString(pluginValue).trim();
  if (!raw) return { plugin: "", pluginOpts: undefined, pluginRaw: "" };

  const s = safeDecodeURIComponent(raw).trim();
  if (!s) return { plugin: "", pluginOpts: undefined, pluginRaw: raw };

  const parts = s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return { plugin: "", pluginOpts: undefined, pluginRaw: s };

  const plugin = parts[0] || "";

  /** @type {Record<string, any>} */
  const opts = Object.create(null);
  for (const seg of parts.slice(1)) {
    const p = seg.trim();
    if (!p) continue;
    const eq = p.indexOf("=");
    if (eq < 0) {
      opts[p] = true;
      continue;
    }
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (!k) continue;
    opts[k] = v;
  }

  if (!plugin) warnings.push("plugin 参数存在但插件名为空");

  return {
    plugin,
    pluginOpts: Object.keys(opts).length ? opts : undefined,
    pluginRaw: s,
  };
}

export class SSParser {
  /**
   * 解析 ss:// URL 为标准化的 ProxyNode 对象。
   *
   * @param {string} url - ss://...
   * @returns {ProxyNode}
   *
   * @example
   * const parser = new SSParser();
   * const node = parser.parse("ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@example.com:8388#节点");
   */
  parse(url) {
    /** @type {string[]} */
    const warnings = [];

    try {
      const rawUrl = asString(url).trim();
      if (!rawUrl) {
        warnings.push("输入为空，无法解析 SS");
        return {
          source: "ss",
          type: "ss",
          name: "ss",
          server: "",
          port: 0,
          cipher: "",
          password: "",
          extras: { rawUrl: "" },
          warnings,
        };
      }

      const { scheme, authority, path, query, fragment } = splitUrlLoosely(rawUrl);
      if (lower(scheme) && lower(scheme) !== "ss") {
        warnings.push(`scheme 不是 ss（当前为 ${asString(scheme)}），仍尝试按 SS 解析`);
      }

      const nameFromFrag = fragment != null ? safeDecodeURIComponent(fragment).trim() : "";

      const queryObj = parseQuery(query);
      const pluginFromRaw = getRawQueryFirstParamNoSemicolon(query, "plugin");
      const pluginValue = pluginFromRaw != null ? pluginFromRaw : getFirstParam(queryObj, "plugin");
      const pluginParsed = parsePlugin(pluginValue, warnings);

      const authorityText = authority != null ? asString(authority) : asString(path);
      const a1 = parseAuthority(authorityText);

      /** @type {string} */
      let server = "";
      /** @type {number} */
      let portNum = 0;
      /** @type {string} */
      let method = "";
      /** @type {string} */
      let password = "";

      /** @type {"legacy"|"sip002-base64"|"sip002-plain"|"unknown"} */
      let format = "unknown";

      const hasOuterHostPort = Boolean(a1.host) && typeof a1.port === "number";
      const hasUserinfo = a1.userinfo != null && asString(a1.userinfo).trim() !== "";

      if (hasOuterHostPort) {
        server = safeDecodeURIComponent(a1.host).trim();
        portNum = isPort(a1.port) ? a1.port : 0;
        if (!portNum) warnings.push(`端口不合法：port=${asString(a1.port)}`);

        const creds = parseUserinfoToCreds(a1.userinfo, warnings);
        method = creds.method;
        password = creds.password;

        format = creds.userinfoDecoded ? "legacy" : "sip002-plain";
      } else if (!hasUserinfo && a1.host) {
        const payloadB64 = safeDecodeURIComponent(a1.host).trim();
        const decoded = base64DecodeUtf8(payloadB64);
        if (decoded == null) {
          warnings.push("Base64 解码失败：ss:// payload 非法（无法解析 SIP002 base64 形式）");
        } else {
          const decodedText = asString(decoded).trim();
          const a2 = parseAuthority(decodedText);
          if (!a2.userinfo) warnings.push("SIP002 Base64 解码后缺少 userinfo（method:password）");
          const creds = parseUserinfoToCreds(a2.userinfo, warnings);
          method = creds.method;
          password = creds.password;

          server = safeDecodeURIComponent(asString(a2.host)).trim();
          portNum = isPort(a2.port) ? a2.port : 0;
          if (!server) warnings.push("缺少服务器地址（Base64 解码后 host 为空）");
          if (!portNum) warnings.push(`端口不合法：port=${asString(a2.port)}`);

          format = "sip002-base64";
        }
      } else {
        warnings.push("无法识别 SS URL 主体结构（缺少 authority/host/userinfo）");
      }

      if (!server) warnings.push("缺少服务器地址：server");
      if (!portNum) warnings.push("缺少或无效端口：port");
      if (!method) warnings.push("缺少加密方法：cipher/method");
      if (!password) warnings.push("缺少密码：password");

      const name = nameFromFrag || server || "ss";

      /** @type {any} */
      const extras = {
        format,
        pluginRaw: pluginParsed.pluginRaw || undefined,
        query: queryObj,
        rawUrl,
      };

      /** @type {ProxyNode} */
      const node = {
        source: "ss",
        type: "ss",
        name,
        server,
        port: portNum,
        cipher: method,
        password,
        plugin: pluginParsed.plugin || undefined,
        pluginOpts: pluginParsed.pluginOpts,
        extras,
        warnings,
      };

      return node;
    } catch (e) {
      warnings.push(`解析异常（已捕获）：${asString(e && e.message ? e.message : e)}`);
      return {
        source: "ss",
        type: "ss",
        name: "ss",
        server: "",
        port: 0,
        cipher: "",
        password: "",
        extras: { rawUrl: asString(url) },
        warnings,
      };
    }
  }
}

export default SSParser;
