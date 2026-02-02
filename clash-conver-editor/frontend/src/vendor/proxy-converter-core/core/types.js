/**
 * 本文件仅用于提供 TypeScript 风格的 JSDoc 类型声明，便于编辑器获得更好的智能提示。
 * 注意：这些类型不会在运行时生效。
 *
 * @module core/types
 */

/**
 * 标准化后的内部节点对象（统一中间表示）。
 *
 * @typedef {Object} ProxyNode
 * @property {string} source
 *   节点来源（例如：`"vless"`, `"vmess"`, `"ss"`, `"sub"` 等），用于追踪解析路径与调试。
 * @property {string} type
 *   协议类型（例如：`"vless"`, `"vmess"`, `"trojan"`, `"ss"`, `"hysteria2"` 等）。
 * @property {string} name
 *   节点名称（通常来自 URL fragment `#name`，或由转换器生成的可读名称）。
 * @property {string} server
 *   服务器地址（域名、IPv4、或 IPv6 字面量；IPv6 建议使用不带 `[]` 的纯地址存储）。
 * @property {number} port
 *   端口号（1-65535）。
 * @property {boolean} tls
 *   是否启用 TLS（若协议本身不使用 TLS，可为 `false`）。
 * @property {string} transport
 *   传输层/网络类型（例如：`"tcp"`, `"ws"`, `"grpc"`, `"quic"`, `"h2"` 等；未知时可为空字符串）。
 * @property {Record<string, any>} extras
 *   额外字段容器：存放协议特有参数与转换过程保留信息（例如：`uuid`、`flow`、`sni`、`alpn`、`ws-opts` 等）。
 * @property {string[]} warnings
 *   解析与转换过程中产生的非致命告警（例如：字段缺失、值不合法但已降级处理等）。
 *
 * @example
 * /** @type {ProxyNode} *\/
 * const node = {
 *   source: "vless",
 *   type: "vless",
 *   name: "示例节点",
 *   server: "example.com",
 *   port: 443,
 *   tls: true,
 *   transport: "ws",
 *   extras: { uuid: "11111111-2222-3333-4444-555555555555", sni: "example.com" },
 *   warnings: []
 * };
 */

/**
 * Clash Meta 的单条代理节点对象（输出 YAML 中 `proxies:` 列表的元素）。
 * 不同 `type` 的字段差异很大，本类型使用"最小必需 + 宽松扩展"方式定义。
 *
 * @typedef {Object} ClashProxy
 * @property {string} name
 *   Clash 节点名称（必须唯一且可读）。
 * @property {string} type
 *   Clash 代理类型（例如：`"vless"`, `"vmess"`, `"trojan"`, `"ss"`, `"hysteria2"` 等）。
 * @property {string} [server]
 * @property {number} [port]
 * @property {boolean} [udp]
 * @property {boolean} [tls]
 * @property {string} [sni]
 * @property {string[]} [alpn]
 * @property {string} [network]
 * @property {Record<string, any>} [ws-opts]
 * @property {Record<string, any>} [grpc-opts]
 * @property {Record<string, any>} [smux]
 * @property {Record<string, any>} [reality-opts]
 * @property {Record<string, any>} [obfs]
 * @property {Record<string, any>} [extras]
 *   允许保留未显式列出的 Clash 字段（实际实现中通常会直接展开到顶层）。
 *
 * @example
 * /** @type {ClashProxy} *\/
 * const clash = {
 *   name: "示例节点",
 *   type: "vless",
 *   server: "example.com",
 *   port: 443,
 *   tls: true,
 *   network: "ws",
 *   "ws-opts": { path: "/", headers: { Host: "example.com" } }
 * };
 */

export {};
