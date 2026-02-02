/**
 * Hysteria v1 转换器：将标准化 ProxyNode 转换为 Clash Meta 的 ClashProxy 对象。
 *
 * 设计原则：
 * - 永不抛异常：尽量返回可序列化对象
 * - 字段命名遵循 yaml-generator.js 的 ORDER_MAP（hysteria）
 *
 * @module converters/hysteria-converter
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

export class HysteriaConverter {
  /**
   * @param {ProxyNode} node
   * @returns {ClashProxy}
   */
  convert(node) {
    try {
      const name = asString(pick(node, "name")).trim() || "hysteria";
      const server = asString(pick(node, "server")).trim() || "";
      const port = Number(pick(node, "port")) || 0;

      /** @type {any} */
      const out = {
        name,
        type: "hysteria",
        server,
        port,
        udp: true,
      };

      const authStr = asString(pick(node, "authStr")).trim();
      const auth = pick(node, "auth");
      if (isPlainObject(auth) && Object.keys(auth).length) {
        out.auth = auth;
      } else if (authStr) {
        out["auth-str"] = authStr;
      }

      const tls = pick(node, "tls") || {};
      const sni = asString(pick(tls, "sni")).trim();
      if (sni) out.sni = sni;

      const alpn = pick(tls, "alpn");
      if (Array.isArray(alpn) && alpn.length) out.alpn = alpn.map((x) => asString(x)).filter(Boolean);

      const insecure = Boolean(pick(tls, "insecure"));
      if (insecure) out["skip-cert-verify"] = true;

      const obfs = asString(pick(node, "obfs")).trim();
      if (obfs) out.obfs = obfs;

      const recvWindowConn = Number(pick(node, "recvWindowConn"));
      if (Number.isFinite(recvWindowConn) && recvWindowConn > 0) out["recv-window-conn"] = recvWindowConn;

      const recvWindow = Number(pick(node, "recvWindow"));
      if (Number.isFinite(recvWindow) && recvWindow > 0) out["recv-window"] = recvWindow;

      const disableMtuDiscovery = pick(node, "disableMtuDiscovery");
      if (disableMtuDiscovery === true) out["disable-mtu-discovery"] = true;

      const fastOpen = pick(node, "fastOpen");
      if (fastOpen === true) out["fast-open"] = true;

      const smux = pick(node, "smux");
      if (isPlainObject(smux) && Object.keys(smux).length) out.smux = smux;

      return out;
    } catch (_) {
      return {
        name: "hysteria",
        type: "hysteria",
        server: "",
        port: 0,
        udp: true,
      };
    }
  }
}

export default HysteriaConverter;
