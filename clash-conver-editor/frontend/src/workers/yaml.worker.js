import yaml from 'js-yaml'

self.addEventListener('message', (e) => {
  const { id, action, data, options } = e.data || {}

  try {
    if (action === 'dump') {
      const result = yaml.dump(data, options || {})
      self.postMessage({ id, success: true, result })
      return
    }

    if (action === 'load') {
      const result = yaml.load(data)
      self.postMessage({ id, success: true, result })
      return
    }

    self.postMessage({ id, success: false, error: `不支持的 action: ${action}` })
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error?.message || String(error)
    })
  }
})
