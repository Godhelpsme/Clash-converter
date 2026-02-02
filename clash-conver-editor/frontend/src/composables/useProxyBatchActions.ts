import { ref, computed, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ClashProxy, ClashProxyGroup } from '@/types/clash-config'

export type UpdateEmitter = (event: 'update', field: string, value: unknown) => void

interface UseProxyBatchActionsOptions {
  proxies: Ref<ClashProxy[]>
  proxyGroups: Ref<ClashProxyGroup[]>
  emit: UpdateEmitter
}

export const useProxyBatchActions = (options: UseProxyBatchActionsOptions) => {
  const { proxies, proxyGroups, emit } = options

  const selectedProxyNames = ref<string[]>([])
  const batchAddDialogVisible = ref(false)
  const batchTargetGroups = ref<string[]>([])

  const selectedSet = computed(() => new Set(selectedProxyNames.value.filter(Boolean)))

  const isSelected = (name: string | undefined) => {
    if (!name) return false
    return selectedSet.value.has(name)
  }

  const toggleSelection = (name: string | undefined, checked: boolean) => {
    if (!name) return
    const set = new Set(selectedSet.value)
    if (checked) set.add(name)
    else set.delete(name)
    selectedProxyNames.value = Array.from(set)
  }

  const toggleSelectAll = (names: string[], checked: boolean) => {
    const set = new Set(selectedSet.value)
    if (checked) {
      names.forEach(name => set.add(name))
    } else {
      names.forEach(name => set.delete(name))
    }
    selectedProxyNames.value = Array.from(set)
  }

  const clearSelection = () => {
    selectedProxyNames.value = []
  }

  const renameSelection = (oldName?: string, newName?: string) => {
    if (!oldName || !newName) return
    if (!selectedSet.value.has(oldName)) return
    const set = new Set(selectedSet.value)
    set.delete(oldName)
    set.add(newName)
    selectedProxyNames.value = Array.from(set)
  }

  const removeSelection = (name?: string) => {
    if (!name || !selectedSet.value.has(name)) return
    const set = new Set(selectedSet.value)
    set.delete(name)
    selectedProxyNames.value = Array.from(set)
  }

  const batchDelete = async () => {
    const names = selectedProxyNames.value.filter(Boolean)
    if (names.length === 0) return

    const deletedSet = new Set(names)

    try {
      await ElMessageBox.confirm(
        `确定要批量删除 ${names.length} 个代理吗？删除后将同步从所有代理组中移除引用。`,
        '批量删除',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )

      const nextProxies = proxies.value.filter(proxy => !deletedSet.has(proxy?.name))
      emit('update', 'proxies', nextProxies)

      const nextGroups = proxyGroups.value.map(group => {
        const list = Array.isArray(group?.proxies) ? group.proxies : []
        return {
          ...group,
          proxies: list.filter(proxy => !deletedSet.has(proxy))
        }
      })
      emit('update', 'proxy-groups', nextGroups)

      clearSelection()
      ElMessage.success(`已删除 ${names.length} 个代理`)
    } catch {
      // 用户取消
    }
  }

  const openBatchAddDialog = () => {
    if (selectedProxyNames.value.length === 0) return
    batchTargetGroups.value = []
    batchAddDialogVisible.value = true
  }

  const closeBatchAddDialog = () => {
    batchAddDialogVisible.value = false
    batchTargetGroups.value = []
  }

  const confirmBatchAdd = () => {
    const names = selectedProxyNames.value.filter(Boolean)
    if (names.length === 0) return

    const targets = batchTargetGroups.value.filter(Boolean)
    if (targets.length === 0) {
      ElMessage.warning('请选择至少一个代理组')
      return
    }

    const nextGroups = proxyGroups.value.map(group => {
      if (!targets.includes(group?.name)) return group
      const list = Array.isArray(group?.proxies) ? group.proxies : []
      return {
        ...group,
        proxies: [...new Set([...list, ...names])]
      }
    })

    emit('update', 'proxy-groups', nextGroups)
    closeBatchAddDialog()
    clearSelection()
    ElMessage.success(`已将 ${names.length} 个代理添加到 ${targets.length} 个代理组`)
  }

  return {
    selectedProxyNames,
    batchAddDialogVisible,
    batchTargetGroups,
    selectedSet,
    isSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    renameSelection,
    removeSelection,
    batchDelete,
    openBatchAddDialog,
    closeBatchAddDialog,
    confirmBatchAdd
  }
}
