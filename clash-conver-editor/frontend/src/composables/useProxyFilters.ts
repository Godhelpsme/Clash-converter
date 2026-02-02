import { computed, ref, type Ref } from 'vue'
import type { ClashProxy } from '@/types/clash-config'

const parseRegexSearch = (input: string) => {
  const raw = input.trim()
  if (!raw) return { mode: 'none', regex: null as RegExp | null, error: '' }

  if (!raw.startsWith('/') || raw.lastIndexOf('/') === 0) {
    return { mode: 'fuzzy', regex: null, error: '' }
  }

  const lastSlash = raw.lastIndexOf('/')
  const pattern = raw.slice(1, lastSlash)
  const flags = raw.slice(lastSlash + 1) || 'i'

  if (!pattern) return { mode: 'fuzzy', regex: null, error: '' }

  try {
    return { mode: 'regex', regex: new RegExp(pattern, flags), error: '' }
  } catch {
    return { mode: 'regex', regex: null, error: '正则表达式无效，将按模糊搜索处理' }
  }
}

export const useProxyFilters = (proxies: Ref<ClashProxy[]>) => {
  const searchQuery = ref('')
  const selectedProtocol = ref('')

  const searchInfo = computed(() => parseRegexSearch(searchQuery.value))
  const regexError = computed(() => searchInfo.value.error)

  const filteredProxies = computed(() => {
    let result = proxies.value

    if (selectedProtocol.value) {
      result = result.filter(proxy => proxy?.type === selectedProtocol.value)
    }

    const query = searchQuery.value.trim()
    if (!query) return result

    const info = searchInfo.value
    if (info.mode === 'regex' && info.regex) {
      const r = info.regex
      const test = (value: string) => {
        r.lastIndex = 0
        return r.test(value)
      }
      return result.filter(proxy => {
        const name = String(proxy?.name || '')
        const server = String(proxy?.server || '')
        const type = String(proxy?.type || '')
        return test(name) || test(server) || test(type)
      })
    }

    const q = query.toLowerCase()
    return result.filter(proxy => {
      const name = String(proxy?.name || '').toLowerCase()
      const server = String(proxy?.server || '').toLowerCase()
      const type = String(proxy?.type || '').toLowerCase()
      return name.includes(q) || server.includes(q) || type.includes(q)
    })
  })

  return {
    searchQuery,
    selectedProtocol,
    regexError,
    filteredProxies
  }
}
