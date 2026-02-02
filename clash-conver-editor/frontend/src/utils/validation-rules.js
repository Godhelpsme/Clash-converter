// 统一校验规则（施工包C）
// - 目标：各表单复用一致的“必填/端口/服务器地址/唯一性”等规则

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

// 允许：单标签（localhost）/ 多标签域名 / 末尾可带点
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$/

const isEmpty = (value) => {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  return value === ''
}

export const ValidationRules = {
  required(label = '字段') {
    return {
      validator: (_, value, callback) => {
        if (isEmpty(value)) callback(new Error(`请填写 ${label}`))
        else callback()
      },
      trigger: 'blur'
    }
  },

  port(label = '端口') {
    return {
      validator: (_, value, callback) => {
        if (isEmpty(value)) return callback()
        const num = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(num)) return callback(new Error(`${label}必须是数字`))
        if (num < 1 || num > 65535) return callback(new Error(`${label}必须在 1-65535 之间`))
        callback()
      },
      trigger: 'blur'
    }
  },

  host(label = '服务器地址') {
    return {
      validator: (_, value, callback) => {
        if (isEmpty(value)) return callback()
        const text = String(value).trim()
        const ok = IPV4_REGEX.test(text) || DOMAIN_REGEX.test(text)
        if (!ok) return callback(new Error(`${label}格式不正确（需为域名或 IPv4）`))
        callback()
      },
      trigger: 'blur'
    }
  },

  uniqueName({ label = '名称', getExistingNames, exclude } = {}) {
    return {
      validator: (_, value, callback) => {
        if (isEmpty(value)) return callback()
        const name = String(value).trim()
        const existing = typeof getExistingNames === 'function' ? getExistingNames() : []
        const set = new Set((existing || []).map(v => (v == null ? '' : String(v).trim())).filter(Boolean))
        if (exclude) set.delete(String(exclude).trim())
        if (set.has(name)) return callback(new Error(`${label}已存在，请更换`))
        callback()
      },
      trigger: 'blur'
    }
  }
}
