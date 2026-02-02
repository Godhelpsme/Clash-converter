/**
 * Trojan 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（trojan）
 * - 兼容常见传输层：tcp / ws / grpc
 *
 * @module converters/trojan-converter
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

export class TrojanConverter {
  /**
   * 将 ProxyNode 转换为 Clash Meta Trojan 配置对象。
   *
   * @param {ProxyNode} node
   * @returns {ClashProxy}
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "trojan";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const password = asString(pick(node, "password")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "trojan",
        server,
        port,
        password,
        udp: true,
      };

      const tls = pick(node, "tls") || {};
      const tlsEnabled = Boolean(pick(tls, "enabled"));
      out.tls = Boolean(tlsEnabled);

      const sni = asString(pick(tls, "sni")).trim();
      if (sni) out.sni = sni;

      const alpn = pick(tls, "alpn");
      if (Array.isArray(alpn) && alpn.length) {
        out.alpn = alpn.map((x) => asString(x)).filter(Boolean);
      }

      const insecure = Boolean(pick(tls, "insecure"));
      if (insecure) out["skip-cert-verify"] = true;

      const transport = pick(node, "transport") || {};
      const network = asString(pick(transport, "network")).trim();
      if (network && network !== "tcp") out.network = network;

      if (network === "ws") {
        const ws = pick(transport, "ws") || {};
        const path = asString(pick(ws, "path")).trim();
        const hostHeader = asString(pick(ws, "host")).trim();

        /** @type {any} */
        const wsOpts = {};
        if (path) wsOpts.path = path;
        if (hostHeader) wsOpts.headers = { Host: hostHeader };
        if (Object.keys(wsOpts).length) out["ws-opts"] = wsOpts;
      } else if (network === "grpc") {
        const grpc = pick(transport, "grpc") || {};
        const serviceName = asString(pick(grpc, "serviceName")).trim();
        const mode = asString(pick(grpc, "mode")).trim();

        /** @type {any} */
        const grpcOpts = {};
        if (serviceName) grpcOpts["grpc-service-name"] = serviceName;
        if (mode) grpcOpts.mode = mode;
        if (Object.keys(grpcOpts).length) out["grpc-opts"] = grpcOpts;
      }

      const smux = pick(node, "smux");
      if (smux && typeof smux === "object" && !Array.isArray(smux) && Object.keys(smux).length) {
        out.smux = smux;
      }

      return out;
    } catch (_) {
      return {
        name: "trojan",
        type: "trojan",
        server: "",
        port: 0,
        password: "",
        udp: true,
        tls: false,
      };
    }
  }
}

export default TrojanConverter;
