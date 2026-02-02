let yamlWorker = null
let nextRequestId = 1
const pending = new Map()

const resetWorker = (error) => {
  for (const { reject } of pending.values()) {
    reject(error)
  }
  pending.clear()

  try {
    yamlWorker?.terminate()
  } catch {
    // 忽略 terminate 失败
  }
  yamlWorker = null
}

const ensureWorker = () => {
  if (yamlWorker) return yamlWorker
  if (typeof Worker === 'undefined') {
    throw new Error('当前环境不支持 Web Worker')
  }

  yamlWorker = new Worker(new URL('../workers/yaml.worker.js', import.meta.url), {
    type: 'module'
  })

  yamlWorker.addEventListener('message', (e) => {
    const { id, success, result, error } = e.data || {}
    if (!pending.has(id)) return

    const { resolve, reject } = pending.get(id)
    pending.delete(id)

    if (success) resolve(result)
    else reject(new Error(error || 'YAML Worker 执行失败'))
  })

  yamlWorker.addEventListener('error', (e) => {
    resetWorker(e)
  })

  yamlWorker.addEventListener('messageerror', (e) => {
    resetWorker(e)
  })

  return yamlWorker
}

const callWorker = (action, data, options) => {
  const worker = ensureWorker()
  const id = nextRequestId++

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, action, data, options })
  })
}

export const dumpYAMLAsync = (config, options = {}) => {
  return callWorker('dump', config, options)
}

export const loadYAMLAsync = (content) => {
  return callWorker('load', content)
}

export const terminateYAMLWorker = () => {
  resetWorker(new Error('YAML Worker 已终止'))
}
