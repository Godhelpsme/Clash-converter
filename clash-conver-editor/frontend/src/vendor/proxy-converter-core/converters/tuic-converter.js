/**
 * TUIC 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（tuic）
 *
 * @module converters/tuic-converter
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

export class TUICConverter {
  /**
   * @param {ProxyNode} node
   * @returns {ClashProxy}
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "tuic";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const uuid = asString(pick(node, "uuid")).trim() || "";
      const password = asString(pick(node, "password")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "tuic",
        server,
        port,
        uuid,
        password,
        udp: true,
      };

      const tls = pick(node, "tls") || {};
      const sni = asString(pick(tls, "sni")).trim();
      if (sni) out.sni = sni;

      const alpn = pick(tls, "alpn");
      if (Array.isArray(alpn) && alpn.length) out.alpn = alpn.map((x) => asString(x)).filter(Boolean);

      const insecure = Boolean(pick(tls, "insecure"));
      if (insecure) out["skip-cert-verify"] = true;

      const cc = asString(pick(node, "congestionController")).trim();
      if (cc) out["congestion-controller"] = cc;

      const reduceRtt = pick(node, "reduceRtt");
      if (reduceRtt === true) out["reduce-rtt"] = true;

      const requestTimeout = Number(pick(node, "requestTimeout"));
      if (Number.isFinite(requestTimeout) && requestTimeout > 0) out["request-timeout"] = requestTimeout;

      const maxUdpRelayPacketSize = Number(pick(node, "maxUdpRelayPacketSize"));
      if (Number.isFinite(maxUdpRelayPacketSize) && maxUdpRelayPacketSize > 0) {
        out["max-udp-relay-packet-size"] = maxUdpRelayPacketSize;
      }

      return out;
    } catch (_) {
      return {
        name: "tuic",
        type: "tuic",
        server: "",
        port: 0,
        uuid: "",
        password: "",
        udp: true,
      };
    }
  }
}

export default TUICConverter;
