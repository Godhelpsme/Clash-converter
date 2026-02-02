export type ConfigFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'array'
  | 'object'

export interface ConfigField {
  key: string
  label: string
  type: ConfigFieldType
  required?: boolean
  default?: unknown
  description?: string
  example?: unknown
  options?: string[]
}

export interface ProtocolDefinition {
  type: string
  label: string
  fields: ConfigField[]
}

export interface RuleTypeDefinition {
  type: string
  label: string
  hasValue: boolean
}

export interface ConfigCategory {
  id: string
  name: string
  icon?: string
  fields?: ConfigField[]
  protocols?: ProtocolDefinition[]
  types?: ProtocolDefinition[]
  ruleTypes?: RuleTypeDefinition[]
  isTable?: boolean
  description?: string
}

export interface ConfigMetadata {
  categories: ConfigCategory[]
}
