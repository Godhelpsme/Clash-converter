export type ClashProxyType =
  | 'ss'
  | 'ssr'
  | 'vmess'
  | 'vless'
  | 'trojan'
  | 'hysteria'
  | 'hysteria2'
  | 'tuic'

export interface ClashProxy {
  name: string
  type: ClashProxyType
  server: string
  port: number
  password?: string
  uuid?: string
  cipher?: string
  network?: string
  tls?: boolean
  'skip-cert-verify'?: boolean
  'plugin-opts'?: {
    mode?: string
    host?: string
    path?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface ClashProxyGroup {
  name: string
  type: 'select' | 'url-test' | 'fallback' | 'load-balance' | 'relay'
  proxies: string[]
  url?: string
  interval?: number
  tolerance?: number
  strategy?: string
}

export interface ClashConfig {
  mode?: 'rule' | 'global' | 'direct'
  port?: number
  'socks-port'?: number
  'mixed-port'?: number
  'allow-lan'?: boolean
  'log-level'?: 'info' | 'warning' | 'error' | 'debug' | 'silent'
  'external-controller'?: string
  proxies?: ClashProxy[]
  'proxy-groups'?: ClashProxyGroup[]
  rules?: string[]
  dns?: {
    enable?: boolean
    ipv6?: boolean
    nameserver?: string[]
    fallback?: string[]
    'fallback-filter'?: {
      geoip?: boolean
      ipcidr?: string[]
    }
  }
  [key: string]: unknown
}
