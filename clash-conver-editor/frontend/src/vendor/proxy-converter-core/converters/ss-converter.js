/**
 * SS 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（ss）
 * - SS 字段：cipher/password/plugin/plugin-opts
 *
 * @module converters/ss-converter
 */

/** @typedef {import("../core/types.js").ProxyNode} ProxyNode */
/** @typedef {import("../core/types.js").ClashProxy} ClashProxy */

function asString(v) {
  if (v == null) return "";
  try {
    return String(v);
  } catch (_) {
    return "";
  }
}

function pick(obj, key) {
  try {
    return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  } catch (_) {
    return undefined;
  }
}

function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseBooleanish(v) {
  const s = asString(v).trim().toLowerCase();
  if (!s) return false;
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function normalizePluginName(raw) {
  const p = asString(raw).trim();
  const pl = p.toLowerCase();
  if (!p) return "";
  if (pl === "obfs-local" || pl === "simple-obfs" || pl === "obfs") return "obfs";
  if (pl === "v2ray-plugin") return "v2ray-plugin";
  return p;
}

function buildPluginOpts(plugin, pluginOptsRaw) {
  const p = normalizePluginName(plugin);
  const opts = isPlainObject(pluginOptsRaw) ? pluginOptsRaw : null;
  if (!p || !opts) return null;

  if (p === "obfs") {
    const mode = asString(pick(opts, "obfs") ?? pick(opts, "mode")).trim();
    const host = asString(pick(opts, "obfs-host") ?? pick(opts, "host")).trim();
    /** @type {any} */
    const out = {};
    if (mode) out.mode = mode;
    if (host) out.host = host;
    return Object.keys(out).length ? out : null;
  }

  if (p === "v2ray-plugin") {
    const mode = asString(pick(opts, "mode")).trim();
    const host = asString(pick(opts, "host")).trim();
    const path = asString(pick(opts, "path")).trim();
    const tlsRaw = pick(opts, "tls");
    const tls = tlsRaw === true || parseBooleanish(tlsRaw);

    /** @type {any} */
    const out = {};
    if (mode) out.mode = mode;
    if (tls) out.tls = true;
    if (host) out.host = host;
    if (path) out.path = path;
    return Object.keys(out).length ? out : null;
  }

  return opts;
}

export class SSConverter {
  /**
   * 将 ProxyNode 转换为 Clash Meta SS 配置对象。
   *
   * @param {ProxyNode} node - 标准化的节点对象
   * @returns {ClashProxy} Clash Meta 配置对象
   *
   * @example
   * const converter = new SSConverter();
   * const clash = converter.convert(node);
   * // {
   * //   name: "节点1",
   * //   type: "ss",
   * //   server: "example.com",
   * //   port: 8388,
   * //   cipher: "aes-256-gcm",
   * //   password: "password",
   * //   udp: true,
   * //   plugin: "obfs",
   * //   "plugin-opts": { mode: "http", host: "example.com" }
   * // }
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "ss";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const cipher = asString(pick(node, "cipher") ?? pick(node, "method")).trim() || "";
      const password = asString(pick(node, "password")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "ss",
        server,
        port,
        cipher,
        password,
        udp: true,
      };

      const pluginRaw = asString(pick(node, "plugin")).trim();
      const plugin = normalizePluginName(pluginRaw);
      const pluginOpts = buildPluginOpts(pluginRaw, pick(node, "pluginOpts"));

      if (plugin) out.plugin = plugin;
      if (plugin && pluginOpts && typeof pluginOpts === "object" && Object.keys(pluginOpts).length) {
        out["plugin-opts"] = pluginOpts;
      }

      return out;
    } catch (_) {
      return {
        name: "ss",
        type: "ss",
        server: "",
        port: 0,
        cipher: "",
        password: "",
        udp: true,
      };
    }
  }
}

export default SSConverter;
