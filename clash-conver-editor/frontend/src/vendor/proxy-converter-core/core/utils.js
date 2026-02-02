/**
 * 核心工具函数（纯函数优先），用于解析/容错/格式判断。
 *
 * @module core/utils
 */

/**
 * 安全版 `decodeURIComponent`：遇到畸形 `%` 编码不会抛异常。
 *
 * 策略：
 * 1) 直接 `decodeURIComponent`
 * 2) 将所有"不是两位十六进制"的 `%` 替换为字面 `%25` 后再解码
 * 3) 仍失败则原样返回
 *
 * @param {any} s
 * @returns {string}
 *
 * @example
 * safeDecodeURIComponent("%E4%BD%A0%E5%A5%BD") // "你好"
 * safeDecodeURIComponent("%E4%BD%A0%ZZ")      // "你%ZZ"（容错）
 * safeDecodeURIComponent("%")                 // "%"（不抛异常）
 */
export function safeDecodeURIComponent(s) {
  if (s == null) return "";
  const input = String(s);

  try {
    return decodeURIComponent(input);
  } catch (_) {
    // 继续容错
  }

  const fixed = input.replace(/%(?![0-9A-Fa-f]{2})/g, "%25");
  try {
    return decodeURIComponent(fixed);
  } catch (_) {
    // 放弃解码，原样返回
  }

  return input;
}

function _normalizeBase64Input(s) {
  if (s == null) return "";
  const raw = String(s).trim();
  if (!raw) return "";
  // 去掉常见的空白/换行
  const compact = raw.replace(/\s+/g, "");
  // base64url -> base64
  const normalized = compact.replace(/-/g, "+").replace(/_/g, "/");
  // 自动补齐 padding
  const mod = normalized.length % 4;
  if (mod === 0) return normalized;
  if (mod === 2) return normalized + "==";
  if (mod === 3) return normalized + "=";
  // mod === 1：理论上不可能是合法 base64，交给上层判错
  return normalized;
}

function _bytesToUtf8(bytes) {
  try {
    if (typeof TextDecoder !== "undefined") {
      // fatal=false：遇到非法字节序列用 U+FFFD 替换，不抛异常
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    }
  } catch (_) {
    // 忽略，尝试其他方案
  }

  // Node.js Buffer 路径（优先）
  try {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      return Buffer.from(bytes).toString("utf8");
    }
  } catch (_) {
    // 忽略，继续 fallback
  }

  // 最后的 fallback：尽量把字节转成 Latin1 字符串返回（不保证 UTF-8 正确）
  try {
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
    // 尝试用旧式技巧解码（可能抛异常）
    try {
      // eslint-disable-next-line no-undef
      return decodeURIComponent(escape(out));
    } catch (_) {
      return out;
    }
  } catch (_) {
    return "";
  }
}

/**
 * 容错 Base64 解码为 UTF-8 字符串。
 *
 * 支持：
 * - 标准 base64 与 base64url（`-`/`_`）
 * - 自动补齐 `=` padding
 * - Node.js（Buffer）与浏览器（atob）环境
 *
 * 失败时返回 `null`，而不是抛异常。
 *
 * @param {any} s
 * @returns {string|null}
 *
 * @example
 * base64DecodeUtf8("5L2g5aW9")               // "你好"
 * base64DecodeUtf8("5L2g5aW9")               // 标准 base64
 * base64DecodeUtf8("5L2g5aW9")               // 省略 padding 也可
 * base64DecodeUtf8("SGVsbG8td29ybGQ")        // base64url（自动补齐/替换）
 * base64DecodeUtf8("!!!")                    // null
 */
export function base64DecodeUtf8(s) {
  const normalized = _normalizeBase64Input(s);
  if (!normalized) return null;

  // 粗略过滤：若包含明显非法字符，直接失败（仍允许 '='）
  if (/[^0-9A-Za-z+/=]/.test(normalized)) return null;
  if (normalized.length % 4 === 1) return null;

  // Node.js：Buffer 最可靠
  try {
    if (typeof Buffer !== "undefined" && Buffer.from) {
      const buf = Buffer.from(normalized, "base64");
      return buf.toString("utf8");
    }
  } catch (_) {
    // 忽略，尝试浏览器路径
  }

  // 浏览器：atob + UTF-8 解码
  try {
    if (typeof atob === "function") {
      const bin = atob(normalized);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
      return _bytesToUtf8(bytes);
    }
  } catch (_) {
    // 忽略
  }

  return null;
}

/**
 * 对可能畸形的 URL 做"宽松切分"，用于 `new URL()` 失败时的后备解析。
 *
 * 返回字段均为字符串或 `null`：
 * - scheme：不含 `:`，例如 `"vless"`
 * - authority：不含 `//`，例如 `"user:pass@example.com:443"`
 * - path：以 `/` 开头或为空字符串
 * - query：不含 `?`
 * - fragment：不含 `#`
 *
 * @param {any} url
 * @returns {{scheme: (string|null), authority: (string|null), path: string, query: (string|null), fragment: (string|null)}}
 *
 * @example
 * splitUrlLoosely("vless://uuid@host:443?encryption=none#节点")
 * // { scheme:"vless", authority:"uuid@host:443", path:"", query:"encryption=none", fragment:"节点" }
 *
 * @example
 * splitUrlLoosely("not a url")
 * // { scheme:null, authority:null, path:"not a url", query:null, fragment:null }
 */
export function splitUrlLoosely(url) {
  const input = url == null ? "" : String(url);
  const s = input.trim();

  /** @type {string|null} */
  let scheme = null;
  /** @type {string|null} */
  let authority = null;
  let path = s;
  /** @type {string|null} */
  let query = null;
  /** @type {string|null} */
  let fragment = null;

  try {
    // 先拆 fragment
    const hashIndex = s.indexOf("#");
    const beforeHash = hashIndex >= 0 ? s.slice(0, hashIndex) : s;
    fragment = hashIndex >= 0 ? s.slice(hashIndex + 1) : null;

    // 再拆 query
    const qIndex = beforeHash.indexOf("?");
    const beforeQuery = qIndex >= 0 ? beforeHash.slice(0, qIndex) : beforeHash;
    query = qIndex >= 0 ? beforeHash.slice(qIndex + 1) : null;

    // 识别 scheme
    const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(beforeQuery);
    if (m) {
      scheme = m[1];
      let rest = beforeQuery.slice(m[0].length);
      path = rest;

      if (rest.startsWith("//")) {
        rest = rest.slice(2);
        // authority 到第一个 '/' 或字符串末尾
        const slashIndex = rest.indexOf("/");
        if (slashIndex >= 0) {
          authority = rest.slice(0, slashIndex);
          path = rest.slice(slashIndex);
        } else {
          authority = rest;
          path = "";
        }
      } else {
        authority = null;
        path = rest || "";
      }
    } else {
      // 无 scheme：把整个 beforeQuery 当作 path
      scheme = null;
      authority = null;
      path = beforeQuery || "";
    }
  } catch (_) {
    // 任何异常都降级为"尽量不丢数据"
    scheme = null;
    authority = null;
    path = s;
    query = null;
    fragment = null;
  }

  return { scheme, authority, path, query, fragment };
}

/**
 * 解析 authority（`userinfo@host:port`），支持 IPv6。
 *
 * **IPv6 规则**：
 * - 标准格式：`[2001:db8::1]:443` - 解析为 host="2001:db8::1", port=443
 * - 裸地址：`::1` 或 `2001:db8::1`（多个冒号）- 整体作为 host，port=null
 * - 单冒号：`example.com:443` - 尝试切分为 host:port
 *
 * 不会抛异常；无法解析的字段返回 `null`。
 *
 * @param {any} authority
 * @returns {{userinfo: (string|null), host: (string|null), port: (number|null)}}
 *
 * @example
 * parseAuthority("user:pass@example.com:443")
 * // { userinfo:"user:pass", host:"example.com", port:443 }
 *
 * @example
 * parseAuthority("[::1]:443")
 * // { userinfo:null, host:"::1", port:443 }
 *
 * @example
 * parseAuthority("::1")
 * // { userinfo:null, host:"::1", port:null }（IPv6 裸地址不切端口）
 */
export function parseAuthority(authority) {
  const raw = authority == null ? "" : String(authority).trim();
  const input = raw.startsWith("//") ? raw.slice(2) : raw;

  /** @type {string|null} */
  let userinfo = null;
  /** @type {string|null} */
  let host = null;
  /** @type {number|null} */
  let port = null;

  try {
    // userinfo 取最后一个 '@' 之前（防止密码里出现 '@' 的极端情况）
    const at = input.lastIndexOf("@");
    const hostport = at >= 0 ? input.slice(at + 1) : input;
    userinfo = at >= 0 ? input.slice(0, at) : null;

    const hp = hostport.trim();
    if (!hp) return { userinfo, host: null, port: null };

    if (hp.startsWith("[")) {
      const close = hp.indexOf("]");
      if (close > 0) {
        host = hp.slice(1, close);
        const rest = hp.slice(close + 1);
        if (rest.startsWith(":")) {
          const p = rest.slice(1);
          const pn = Number.parseInt(p, 10);
          port = isPort(pn) ? pn : null;
        } else {
          port = null;
        }
        return { userinfo, host, port };
      }
      // '[' 没有闭合：降级处理
      host = hp;
      return { userinfo, host, port: null };
    }

    // 非 IPv6 bracket：需要判断是 IPv6 裸地址 还是 host:port
    const colonCount = (hp.match(/:/g) || []).length;

    // 如果包含多个 ':'，很可能是 IPv6 裸地址（不应拆 port）
    if (colonCount > 1) {
      // 保守策略：多个冒号 -> 整体当 IPv6 host，不解析端口
      // 例如：::1, 2001:db8::1, fe80::1
      host = hp;
      port = null;
      return { userinfo, host, port };
    }

    // 只有一个 ':'：尝试按 host:port 切分
    if (colonCount === 1) {
      const lastColon = hp.lastIndexOf(":");
      const left = hp.slice(0, lastColon);
      const right = hp.slice(lastColon + 1);

      // 右侧必须是纯数字且端口合法
      if (/^\d{1,5}$/.test(right)) {
        const pn = Number.parseInt(right, 10);
        if (isPort(pn)) {
          host = left || null;
          port = pn;
          return { userinfo, host, port };
        }
      }
    }

    // 无冒号 或 解析失败：整体当 host
    host = hp;
    port = null;
  } catch (_) {
    return { userinfo: null, host: null, port: null };
  }

  return { userinfo, host, port };
}

/**
 * 解析查询字符串为对象（支持重复 key -> 数组）。
 * - 允许输入包含/不包含前导 `?`
 * - 对 `+` 进行空格还原（query 常见语义）
 * - key/value 分别做 `safeDecodeURIComponent`
 *
 * @param {any} query
 * @returns {Record<string, string|string[]>}
 *
 * @example
 * parseQuery("?a=1&b=2") // { a:"1", b:"2" }
 * parseQuery("a=1&a=2")  // { a:["1","2"] }
 * parseQuery("flag")     // { flag:"" }
 */
export function parseQuery(query) {
  /** @type {Record<string, string|string[]>} */
  const out = Object.create(null);
  const raw = query == null ? "" : String(query);
  const s = raw.startsWith("?") ? raw.slice(1) : raw;
  if (!s) return out;

  try {
    const parts = s.split(/[&;]/g);
    for (const part of parts) {
      if (!part) continue;
      const eq = part.indexOf("=");
      const kRaw = eq >= 0 ? part.slice(0, eq) : part;
      const vRaw = eq >= 0 ? part.slice(eq + 1) : "";

      // query 中 '+' 通常代表空格
      const k = safeDecodeURIComponent(kRaw.replace(/\+/g, " "));
      const v = safeDecodeURIComponent(vRaw.replace(/\+/g, " "));
      if (!k) continue;

      const prev = out[k];
      if (prev == null) {
        out[k] = v;
      } else if (Array.isArray(prev)) {
        prev.push(v);
      } else {
        out[k] = [prev, v];
      }
    }
  } catch (_) {
    // 解析失败时返回当前已解析部分（不抛异常）
  }

  return out;
}

/**
 * 校验 UUID（标准 8-4-4-4-12，版本 1-5）。
 *
 * @param {any} s
 * @returns {boolean}
 *
 * @example
 * isUuid("11111111-2222-3333-4444-555555555555") // true
 * isUuid("not-a-uuid") // false
 */
export function isUuid(s) {
  if (s == null) return false;
  const v = String(s).trim();
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * 校验端口号：1-65535 的整数。
 *
 * @param {any} n
 * @returns {boolean}
 *
 * @example
 * isPort(443) // true
 * isPort("65536") // false
 * isPort("80abc") // false（修复：不接受部分数字）
 */
export function isPort(n) {
  try {
    // 字符串先验证纯数字格式
    if (typeof n === "string") {
      const trimmed = n.trim();
      if (!/^\d+$/.test(trimmed)) return false;
      const num = Number.parseInt(trimmed, 10);
      return Number.isInteger(num) && num >= 1 && num <= 65535;
    }

    // 数字类型直接验证
    if (typeof n === "number") {
      return Number.isInteger(n) && n >= 1 && n <= 65535;
    }

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * 判断 YAML 字符串是否"需要加引号"才能安全表示为标量。
 * 目标：宁可多引号，也避免被 YAML 误解析为数字/布尔/null 或触发语法歧义。
 *
 * 常见需要引号的情况：
 * - 空字符串
 * - 前后空白
 * - 包含换行、制表符
 * - 包含 `:` 且可能被解析为映射键，或包含 `#` 注释符
 * - 以 `-`、`?`、`:`、`*`、`&`、`!`、`@`、`` ` ``、`{`、`}`、`[`、`]`、`,` 开头
 * - 看起来像数字/科学计数/十六进制/布尔/null/Infinity/NaN
 *
 * @param {any} s
 * @returns {boolean}
 *
 * @example
 * needsQuote("hello") // false
 * needsQuote("a: b")  // true
 * needsQuote("001")   // true（避免被当数字）
 * needsQuote("true")  // true（避免被当布尔）
 */
export function needsQuote(s) {
  if (s == null) return true;
  const v = String(s);

  // 空字符串：建议显式引号
  if (v.length === 0) return true;

  // 前后空白、控制字符、换行
  if (v !== v.trim()) return true;
  if (/[\r\n\t]/.test(v)) return true;
  // 其余控制字符：在 YAML 中属于高风险字符（可能导致解析失败或不可见差异）
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(v)) return true;

  // YAML 结构/注释敏感字符（保守策略）
  // - '#': 注释
  // - ':': 映射分隔（尤其是 ": "）
  // - '{ } [ ] ,': flow 风格结构
  // - '& * ! | > \' " % @ `': 锚点/别名/标签/块标量/引号/指令等
  if (/[#{}[\],&*!|>'"% @`]/.test(v)) return true;
  if (v.includes(":")) {
    // 只要含 ':' 就保守处理（可显著减少歧义）
    return true;
  }

  // 以可能触发 YAML 语法的字符开头
  if (/^[-?:,[\]{}#&*!|>'"% @`]/.test(v)) return true;

  // 以特殊序列开头（文档边界/指令）
  if (/^(---|\.\.\..)$/.test(v)) return true;

  // YAML 可能自动类型推断的标量：null/bool/inf/nan
  if (/^(?:null|Null|NULL|~)$/.test(v)) return true;
  if (/^(?:true|True|TRUE|false|False|FALSE)$/.test(v)) return true;
  if (/^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/.test(v)) return true;
  if (/^(?:\.inf|\.Inf|\.INF|\.nan|\.NaN|\.NAN|[+-]?(?:inf|Inf|INF|nan|NaN|NAN))$/.test(v)) return true;

  // 数字样式（整数/小数/科学计数/前导零/十六进制）
  // 说明：前导零会被当作数字（甚至八进制语义在不同解析器中差异），因此也建议加引号。
  if (/^[+-]?\d+$/.test(v)) return true;
  if (/^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)) return true;
  if (/^[+-]?\d+(?:[eE][+-]?\d+)$/.test(v)) return true;
  if (/^0\d+$/.test(v)) return true;
  if (/^0x[0-9a-fA-F]+$/.test(v)) return true;
  // YAML 解析器常见的"可读数字"写法：下划线分隔（如 1_000）
  if (v.includes("_") && /^[+-]?[0-9][0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?$/.test(v)) return true;
  // YAML 1.1/部分实现会把 YYYY-MM-DD 当作时间戳类型（与"普通字符串"语义冲突）
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;

  return false;
}

export default {
  safeDecodeURIComponent,
  base64DecodeUtf8,
  splitUrlLoosely,
  parseAuthority,
  parseQuery,
  isUuid,
  isPort,
  needsQuote,
};
