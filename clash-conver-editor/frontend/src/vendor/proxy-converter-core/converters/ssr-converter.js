/**
 * SSR 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（ssr）
 *
 * @module converters/ssr-converter
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

export class SSRConverter {
  /**
   * @param {ProxyNode} node
   * @returns {ClashProxy}
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "ssr";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const cipher = asString(pick(node, "cipher") ?? pick(node, "method")).trim() || "";
      const password = asString(pick(node, "password")).trim() || "";
      const protocol = asString(pick(node, "protocol")).trim() || "";
      const obfs = asString(pick(node, "obfs")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "ssr",
        server,
        port,
        cipher,
        password,
        protocol,
        obfs,
        udp: true,
      };

      const protocolParam = asString(pick(node, "protocolParam")).trim();
      if (protocolParam) out["protocol-param"] = protocolParam;

      const obfsParam = asString(pick(node, "obfsParam")).trim();
      if (obfsParam) out["obfs-param"] = obfsParam;

      return out;
    } catch (_) {
      return {
        name: "ssr",
        type: "ssr",
        server: "",
        port: 0,
        cipher: "",
        password: "",
        protocol: "",
        obfs: "",
        udp: true,
      };
    }
  }
}

export default SSRConverter;
