/**
 * VLESS 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（vless）
 * - 优先使用 Clash Meta 常见字段：sni、skip-cert-verify、reality-opts、ws-opts、grpc-opts
 *
 * @module converters/vless-converter
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

export class VLESSConverter {
  /**
   * 将 ProxyNode 转换为 Clash Meta VLESS 配置对象。
   *
   * @param {ProxyNode} node - 标准化的节点对象
   * @returns {ClashProxy} Clash Meta 配置对象
   *
   * @example
   * const converter = new VLESSConverter();
   * const clash = converter.convert(node);
   * // {
   * //   name: "节点1",
   * //   type: "vless",
   * //   server: "example.com",
   * //   port: 443,
   * //   uuid: "...",
   * //   udp: true,
   * //   tls: true,
   * //   sni: "example.com",
   * //   network: "ws",
   * //   "ws-opts": { path: "/", headers: { Host: "example.com" } }
   * // }
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "vless";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const uuid = asString(pick(node, "uuid")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "vless",
        server,
        port,
        uuid,
        udp: true,
      };

      const extras = pick(node, "extras") || {};
      const flow = asString(pick(extras, "flow")).trim();
      if (flow) out.flow = flow;

      // ---------- TLS ----------
      const tls = pick(node, "tls") || {};
      const tlsEnabled =
        Boolean(pick(tls, "enabled")) || asString(pick(tls, "security")).trim() === "reality";
      out.tls = Boolean(tlsEnabled);

      const sni = asString(pick(tls, "sni")).trim();
      if (sni) out.sni = sni;

      const alpn = pick(tls, "alpn");
      if (Array.isArray(alpn) && alpn.length) {
        out.alpn = alpn.map((x) => asString(x)).filter(Boolean);
      }

      const fingerprint = asString(pick(tls, "fingerprint")).trim();
      if (fingerprint) out.fingerprint = fingerprint;

      const clientFp = asString(pick(tls, "clientFingerprint")).trim();
      if (clientFp) out["client-fingerprint"] = clientFp;

      const insecure = Boolean(pick(tls, "insecure"));
      if (insecure) out["skip-cert-verify"] = true;

      // ---------- Reality ----------
      const reality = pick(tls, "reality") || {};
      const pbk = asString(pick(reality, "pbk")).trim();
      const sid = asString(pick(reality, "sid")).trim();
      if (pbk || sid) {
        /** @type {any} */
        const ro = {};
        if (pbk) ro["public-key"] = pbk;
        if (sid) ro["short-id"] = sid;
        out["reality-opts"] = ro;
        out.tls = true;
      }

      // ---------- 传输层 ----------
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
      }

      return out;
    } catch (_) {
      return {
        name: "vless",
        type: "vless",
        server: "",
        port: 0,
        uuid: "",
        udp: true,
        tls: false,
      };
    }
  }
}

export default VLESSConverter;
