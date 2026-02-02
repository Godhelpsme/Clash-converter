import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ClashConfig, ClashProxy } from '@/types/clash-config'
import type { ConfigMetadata } from '@/types/config-metadata'

export const useConfigStore = defineStore('config', () => {
  const currentFile = ref<string | null>(null)
  const config = ref<ClashConfig | null>(null)
  const originalContent = ref<string>('')
  const metadata = ref<ConfigMetadata | null>(null)

  const setCurrentFile = (file: string | null) => {
    currentFile.value = file
  }

  const setConfig = (newConfig: ClashConfig | null) => {
    config.value = newConfig
  }

  const setOriginalContent = (content: string) => {
    originalContent.value = content
  }

  const setMetadata = (data: ConfigMetadata | null) => {
    metadata.value = data
  }

  const reset = () => {
    currentFile.value = null
    config.value = null
    originalContent.value = ''
    metadata.value = null
  }

  const addProxies = (newProxies: ClashProxy[]) => {
    if (!config.value) config.value = {}
    if (!Array.isArray(config.value.proxies)) config.value.proxies = []

    const existingNames = new Set(
      config.value.proxies.map(proxy => proxy?.name).filter(Boolean)
    )
    const incoming = (Array.isArray(newProxies) ? newProxies : []).map(proxy => ({
      ...proxy
    }))

    incoming.forEach(proxy => {
      const base = String(proxy?.name || proxy?.type || 'proxy').trim() || 'proxy'
      let name = base
      let counter = 1
      while (existingNames.has(name)) name = `${base}-${counter++}`
      proxy.name = name
      existingNames.add(name)
    })

    config.value.proxies.push(...incoming)
  }

  return {
    currentFile,
    config,
    originalContent,
    metadata,
    setCurrentFile,
    setConfig,
    setOriginalContent,
    setMetadata,
    reset,
    addProxies
  }
})
