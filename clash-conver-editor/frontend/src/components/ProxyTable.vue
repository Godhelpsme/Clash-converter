<template>
  <div class="proxy-table">
    <ProxyFilterBar v-model:searchQuery="searchQuery" v-model:selectedProtocol="selectedProtocol" :protocols="protocols" @add="showAddDialog" @import="openImporter" />
    <div v-if="regexError" class="search-error">{{ regexError }}</div>
    <BatchActionsBar v-if="selectedProxyNames.length > 0" :count="selectedProxyNames.length" @batch-delete="batchDelete" @batch-add="openBatchAddDialog" @clear="clearSelection" />
    <ProxyVirtualTable ref="tableRef" :items="filteredProxies" :selected-names="selectedProxyNames" :all-selected="allSelected" :some-selected="someSelected" :highlighted-name="highlightedName" @toggle-select-all="handleToggleSelectAll" @toggle-selection="toggleSelection" @edit="editProxy" @delete="deleteProxy" />
    <ProxyEditDialog v-model:visible="dialogVisible" v-model:proxy="currentProxy" :is-edit="isEdit" :protocols="protocols" :fields="currentFields" :existing-names="existingNames" :exclude-name="excludeName" @protocol-change="handleProtocolChange" @save="saveProxy" />
    <BatchAddToGroupDialog v-model:visible="batchAddDialogVisible" v-model:targets="batchTargetGroups" :groups="proxyGroups" :count="selectedProxyNames.length" @confirm="confirmBatchAdd" @cancel="closeBatchAddDialog" />
    <ProxyImporter v-model:visible="importerVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import ProxyImporter from './ProxyImporter.vue'
import ProxyFilterBar from './ProxyTable/ProxyFilterBar.vue'
import BatchActionsBar from './ProxyTable/BatchActionsBar.vue'
import ProxyEditDialog from './ProxyTable/ProxyEditDialog.vue'
import BatchAddToGroupDialog from './ProxyTable/BatchAddToGroupDialog.vue'
import ProxyVirtualTable from './ProxyTable/ProxyVirtualTable.vue'
import { useProxyFilters } from '@/composables/useProxyFilters'
import { useProxyBatchActions } from '@/composables/useProxyBatchActions'
import { useProxyEditor } from '@/composables/useProxyEditor'
import { EventBus } from '@/utils/event-bus'
import type { ClashConfig } from '@/types/clash-config'
import type { ConfigCategory } from '@/types/config-metadata'

interface Props {
  category: ConfigCategory
  config: ClashConfig
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update', field: string, value: unknown): void }>()
const protocols = computed(() => props.category.protocols || [])
const proxies = computed(() => props.config.proxies || [])
const proxyGroups = computed(() => props.config['proxy-groups'] || [])
const { searchQuery, selectedProtocol, regexError, filteredProxies } = useProxyFilters(proxies)
const {
  selectedProxyNames,
  batchAddDialogVisible,
  batchTargetGroups,
  selectedSet,
  toggleSelection,
  toggleSelectAll,
  clearSelection,
  renameSelection,
  removeSelection,
  batchDelete,
  openBatchAddDialog,
  closeBatchAddDialog,
  confirmBatchAdd
} = useProxyBatchActions({ proxies, proxyGroups, emit })
const {
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
} = useProxyEditor({ protocols, proxies, proxyGroups, emit, onAfterDelete: removeSelection, onAfterRename: renameSelection })
const importerVisible = ref(false)
const tableRef = ref<{ scrollToIndex?: (index: number) => void } | null>(null)
const filteredNames = computed(() => filteredProxies.value.map(proxy => proxy?.name).filter(Boolean) as string[])
const allSelected = computed(() => filteredNames.value.length > 0 && filteredNames.value.every(name => selectedSet.value.has(name)))
const someSelected = computed(() => filteredNames.value.some(name => selectedSet.value.has(name)) && !allSelected.value)
const existingNames = computed(() => proxies.value.map(proxy => proxy?.name).filter(Boolean) as string[])
const excludeName = computed(() => (!isEdit.value || editIndex.value < 0 ? null : proxies.value[editIndex.value]?.name ?? null))
const highlightedName = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
const scrollToHighlighted = async () => {
  await nextTick()
  if (!highlightedName.value) return
  const index = filteredProxies.value.findIndex(proxy => proxy?.name === highlightedName.value)
  if (index >= 0) tableRef.value?.scrollToIndex?.(index)
}
const onHighlightProxyError = async ({ index }: { index?: number }) => {
  if (typeof index !== 'number' || !Number.isFinite(index)) return
  if (index < 0 || index >= proxies.value.length) return
  selectedProtocol.value = ''
  searchQuery.value = ''
  highlightedName.value = proxies.value[index]?.name ?? null
  await scrollToHighlighted()
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => (highlightedName.value = null), 5000)
}
const handleToggleSelectAll = (checked: boolean) => toggleSelectAll(filteredNames.value, checked)
const openImporter = () => (importerVisible.value = true)
onMounted(() => EventBus.on('highlight-proxy-error', onHighlightProxyError))
onUnmounted(() => {
  EventBus.off('highlight-proxy-error', onHighlightProxyError)
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<style scoped>
.proxy-table {
  width: 100%;
}

.search-error {
  margin: -8px 0 12px;
  color: #f56c6c;
  font-size: 12px;
}
</style>
