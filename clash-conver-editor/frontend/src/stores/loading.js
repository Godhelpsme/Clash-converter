import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// 全局加载状态（施工包C）
// - 目标：在上传/读取/保存/预览等关键操作中提供一致的加载反馈
// - 说明：使用 token 计数避免嵌套/并发场景下提前关闭 Loading
export const useLoadingStore = defineStore('loading', () => {
  const activeCount = ref(0)
  const message = ref('')
  const progress = ref(null) // number | null（null 表示未知进度）

  const isLoading = computed(() => activeCount.value > 0)

  let seq = 0
  const tokens = new Set()

  const start = (msg = '加载中...') => {
    const token = ++seq
    tokens.add(token)
    activeCount.value = tokens.size
    message.value = msg
    progress.value = null
    return token
  }

  const update = ({ token, msg, percent } = {}) => {
    if (token != null && !tokens.has(token)) return
    if (typeof msg === 'string') message.value = msg
    if (percent === null) {
      progress.value = null
    } else if (typeof percent === 'number' && Number.isFinite(percent)) {
      progress.value = Math.max(0, Math.min(100, Math.round(percent)))
    }
  }

  const finish = (token) => {
    if (token == null) {
      tokens.clear()
      activeCount.value = 0
      message.value = ''
      progress.value = null
      return
    }
    if (!tokens.has(token)) return
    tokens.delete(token)
    activeCount.value = tokens.size
    if (tokens.size === 0) {
      message.value = ''
      progress.value = null
    }
  }

  return {
    isLoading,
    message,
    progress,
    start,
    update,
    finish
  }
})
