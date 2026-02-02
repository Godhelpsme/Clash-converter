// 简易事件总线（施工包C）
// 用于跨组件广播“错误定位高亮”等纯 UI 事件，避免 props 链路过深。

const listeners = new Map()

export const EventBus = {
  on(eventName, handler) {
    if (!eventName || typeof handler !== 'function') return
    const set = listeners.get(eventName) || new Set()
    set.add(handler)
    listeners.set(eventName, set)
  },

  off(eventName, handler) {
    if (!eventName) return
    if (!handler) {
      listeners.delete(eventName)
      return
    }
    const set = listeners.get(eventName)
    if (!set) return
    set.delete(handler)
    if (set.size === 0) listeners.delete(eventName)
  },

  emit(eventName, payload) {
    const set = listeners.get(eventName)
    if (!set) return
    for (const handler of Array.from(set)) {
      try {
        handler(payload)
      } catch (e) {
        // UI 事件不应阻断主流程
        console.error('[EventBus] handler error:', e)
      }
    }
  }
}
