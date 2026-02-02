/**
 * VMess 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（vmess）
 * - 优先使用 Clash Meta 常见字段：sni、alpn、ws-opts、grpc-opts、http-opts、h2-opts
 *
 * @module converters/vmess-converter
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

export class VMessConverter {
  /**
   * 将 ProxyNode 转换为 Clash Meta VMess 配置对象。
   *
   * @param {ProxyNode} node - 标准化的节点对象
   * @returns {ClashProxy} Clash Meta 配置对象
   *
   * @example
   * const converter = new VMessConverter();
   * const clash = converter.convert(node);
   * // {
   * //   name: "节点1",
   * //   type: "vmess",
   * //   server: "example.com",
   * //   port: 443,
   * //   uuid: "...",
   * //   alterId: 0,
   * //   cipher: "auto",
   * //   udp: true,
   * //   tls: true,
   * //   sni: "example.com",
   * //   network: "ws",
   * //   "ws-opts": { path: "/", headers: { Host: "example.com" } }
   * // }
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "vmess";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const uuid = asString(pick(node, "uuid")).trim() || "";

      const alterId0 = Number(pick(node, "alterId"));
      const alterId = Number.isInteger(alterId0) && alterId0 >= 0 ? alterId0 : 0;

      const cipher = asString(pick(node, "cipher")).trim() || "auto";

      /** @type {any} */
      const out = {
        name,
        type: "vmess",
        server,
        port,
        uuid,
        alterId,
        cipher,
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
      } else if (network === "http") {
        const http = pick(transport, "http") || {};
        const path = asString(pick(http, "path")).trim();
        const hostHeader = asString(pick(http, "host")).trim();

        /** @type {any} */
        const httpOpts = {};
        if (path) httpOpts.path = path;
        if (hostHeader) httpOpts.headers = { Host: hostHeader };
        if (Object.keys(httpOpts).length) out["http-opts"] = httpOpts;
      } else if (network === "h2") {
        const h2 = pick(transport, "h2") || {};
        const path = asString(pick(h2, "path")).trim();
        const hostRaw = asString(pick(h2, "host")).trim();
        const hosts = hostRaw
          ? hostRaw
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
          : [];

        /** @type {any} */
        const h2Opts = {};
        if (path) h2Opts.path = path;
        if (hosts.length) h2Opts.host = hosts;
        if (Object.keys(h2Opts).length) out["h2-opts"] = h2Opts;
      }

      return out;
    } catch (_) {
      return {
        name: "vmess",
        type: "vmess",
        server: "",
        port: 0,
        uuid: "",
        alterId: 0,
        cipher: "auto",
        udp: true,
        tls: false,
      };
    }
  }
}

export default VMessConverter;
