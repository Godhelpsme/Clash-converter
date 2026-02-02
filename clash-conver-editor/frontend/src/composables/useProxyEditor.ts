import { ref, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ClashProxy, ClashProxyGroup } from '@/types/clash-config'
import type { ProtocolDefinition } from '@/types/config-metadata'
import type { UpdateEmitter } from './useProxyBatchActions'

type ProxyFormData = Partial<ClashProxy> & Record<string, unknown>

interface UseProxyEditorOptions {
  protocols: Ref<ProtocolDefinition[]>
  proxies: Ref<ClashProxy[]>
  proxyGroups: Ref<ClashProxyGroup[]>
  emit: UpdateEmitter
  onAfterDelete?: (name?: string) => void
  onAfterRename?: (oldName?: string, newName?: string) => void
}

export const useProxyEditor = (options: UseProxyEditorOptions) => {
  const { protocols, proxies, proxyGroups, emit, onAfterDelete, onAfterRename } = options

  const dialogVisible = ref(false)
  const isEdit = ref(false)
  const currentProxy = ref<ProxyFormData>({})
  const editIndex = ref(-1)
  const currentFields = ref<ProtocolDefinition['fields']>([])

  const buildProxyForProtocol = (type: string): ProxyFormData => {
    const protocol = protocols.value.find(p => p.type === type)
    const fields = protocol?.fields || []
    currentFields.value = fields

    const newProxy: ProxyFormData = { type: type as ClashProxy['type'] }
    fields.forEach(field => {
      if (field.default !== undefined) {
        (newProxy as Record<string, unknown>)[field.key] = field.default
      }
    })
    return newProxy
  }

  const handleProtocolChange = (type: string) => {
    currentProxy.value = buildProxyForProtocol(type)
  }

  const showAddDialog = () => {
    isEdit.value = false
    editIndex.value = -1
    currentProxy.value = buildProxyForProtocol('ss')
    dialogVisible.value = true
  }

  const editProxy = (proxy: ClashProxy) => {
    const index = proxies.value.indexOf(proxy)
    if (index < 0) return

    isEdit.value = true
    editIndex.value = index
    currentProxy.value = { ...proxy }
    const protocol = protocols.value.find(p => p.type === proxy.type)
    currentFields.value = protocol?.fields || []
    dialogVisible.value = true
  }

  const updateProxyGroupReferences = (oldName: string, newName: string) => {
    const updatedGroups = proxyGroups.value.map(group => {
      if (group.proxies && Array.isArray(group.proxies)) {
        return {
          ...group,
          proxies: group.proxies.map(proxy => (proxy === oldName ? newName : proxy))
        }
      }
      return group
    })
    emit('update', 'proxy-groups', updatedGroups)
  }

  const removeProxyFromGroups = (proxyName: string) => {
    const updatedGroups = proxyGroups.value.map(group => {
      if (group.proxies && Array.isArray(group.proxies)) {
        return {
          ...group,
          proxies: group.proxies.filter(proxy => proxy !== proxyName)
        }
      }
      return group
    })
    emit('update', 'proxy-groups', updatedGroups)
  }

  const saveProxy = () => {
    const newProxies = [...proxies.value]
    let oldName: string | undefined

    if (isEdit.value) {
      oldName = newProxies[editIndex.value]?.name
      newProxies[editIndex.value] = currentProxy.value as ClashProxy

      if (oldName && oldName !== currentProxy.value.name) {
        updateProxyGroupReferences(oldName, String(currentProxy.value.name || ''))
        onAfterRename?.(oldName, String(currentProxy.value.name || ''))
        ElMessage.success('修改成功，已同步更新代理组中的引用')
      } else {
        ElMessage.success('修改成功')
      }
    } else {
      newProxies.push(currentProxy.value as ClashProxy)
      ElMessage.success('添加成功')
    }

    emit('update', 'proxies', newProxies)
    dialogVisible.value = false
  }

  const deleteProxy = async (proxy: ClashProxy) => {
    const index = proxies.value.indexOf(proxy)
    if (index < 0) return

    const deletedProxyName = proxy?.name

    try {
      await ElMessageBox.confirm(
        `确定要删除代理 "${deletedProxyName}" 吗？该代理将从所有代理组中移除。`,
        '确认删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      const newProxies = proxies.value.filter((_, i) => i !== index)
      emit('update', 'proxies', newProxies)

      if (deletedProxyName) {
        removeProxyFromGroups(deletedProxyName)
        onAfterDelete?.(deletedProxyName)
      }

      ElMessage.success('删除成功')
    } catch {
      // 用户取消删除
    }
  }

  return {
    dialogVisible,
    isEdit,
    currentProxy,
    currentFields,
    editIndex,
    showAddDialog,
    editProxy,
    saveProxy,
    deleteProxy,
    handleProtocolChange
  }
}
