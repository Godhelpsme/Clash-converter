/**
 * Hysteria2 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（hysteria2）
 *
 * @module converters/hysteria2-converter
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

export class Hysteria2Converter {
  /**
   * @param {ProxyNode} node
   * @returns {ClashProxy}
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "hysteria2";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;
      const password = asString(pick(node, "password")).trim() || "";

      /** @type {any} */
      const out = {
        name,
        type: "hysteria2",
        server,
        port,
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

      const obfs = asString(pick(node, "obfs")).trim();
      if (obfs) out.obfs = obfs;

      const obfsPassword = asString(pick(node, "obfsPassword")).trim();
      if (obfsPassword) out["obfs-password"] = obfsPassword;

      const fastOpen = pick(node, "fastOpen");
      if (fastOpen === true) out["fast-open"] = true;

      const recvWindowConn = Number(pick(node, "recvWindowConn"));
      if (Number.isFinite(recvWindowConn) && recvWindowConn > 0) out["recv-window-conn"] = recvWindowConn;

      const recvWindow = Number(pick(node, "recvWindow"));
      if (Number.isFinite(recvWindow) && recvWindow > 0) out["recv-window"] = recvWindow;

      const maxConn = Number(pick(node, "maxConn"));
      if (Number.isFinite(maxConn) && maxConn > 0) out["max-conn"] = maxConn;

      const smux = pick(node, "smux");
      if (isPlainObject(smux) && Object.keys(smux).length) out.smux = smux;

      return out;
    } catch (_) {
      return {
        name: "hysteria2",
        type: "hysteria2",
        server: "",
        port: 0,
        password: "",
        udp: true,
      };
    }
  }
}

export default Hysteria2Converter;
