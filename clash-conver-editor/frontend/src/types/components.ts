import type { ClashConfig } from './clash-config'
import type { ConfigCategory } from './config-metadata'

export interface ProxyTableProps {
  category: ConfigCategory
  config: ClashConfig
}
