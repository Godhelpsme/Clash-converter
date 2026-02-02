<template>
  <div class="table-wrapper">
    <div class="table-head">
      <div class="th col-select">
        <el-checkbox
          :model-value="allSelected"
          :indeterminate="someSelected"
          @change="$emit('toggle-select-all', $event)"
        />
      </div>
      <div class="th col-name">名称</div>
      <div class="th col-type">类型</div>
      <div class="th col-server">服务器</div>
      <div class="th col-port">端口</div>
      <div class="th col-actions">操作</div>
    </div>

    <RecycleScroller
      v-if="items.length > 0"
      ref="scrollerRef"
      class="scroller"
      :items="items"
      :item-size="54"
      key-field="name"
      v-slot="{ item, index }"
    >
        <div class="proxy-row" :class="{ 'is-even': index % 2 === 0, 'error-highlight-row': highlightedName && item.name === highlightedName }">
          <div class="td col-select">
            <el-checkbox
              :model-value="selectedNames.includes(item.name)"
              @change="$emit('toggle-selection', item.name, $event)"
            />
          </div>
          <div class="td col-name" :title="item.name">{{ item.name }}</div>
          <div class="td col-type">{{ item.type }}</div>
        <div class="td col-server" :title="item.server">{{ item.server || '-' }}</div>
        <div class="td col-port">{{ item.port ?? '-' }}</div>
        <div class="td col-actions">
          <el-button size="small" @click="$emit('edit', item)">编辑</el-button>
          <el-button size="small" type="danger" @click="$emit('delete', item)">删除</el-button>
        </div>
      </div>
    </RecycleScroller>

    <el-empty v-else description="暂无代理" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { RecycleScroller } from 'vue-virtual-scroller'
import type { ClashProxy } from '@/types/clash-config'

defineProps<{
  items: ClashProxy[]
  selectedNames: string[]
  allSelected: boolean
  someSelected: boolean
  highlightedName?: string | null
}>()

defineEmits<{
  (e: 'toggle-select-all', value: boolean): void
  (e: 'toggle-selection', name: string | undefined, checked: boolean): void
  (e: 'edit', proxy: ClashProxy): void
  (e: 'delete', proxy: ClashProxy): void
}>()

const scrollerRef = ref<{ scrollToItem?: (index: number) => void } | null>(null)

const scrollToIndex = (index: number) => {
  scrollerRef.value?.scrollToItem?.(index)
}

defineExpose({ scrollToIndex })
</script>

<style scoped>
.table-wrapper {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fff;
  overflow: hidden;
}

.table-head {
  display: flex;
  align-items: center;
  height: 54px;
  padding: 0 16px;
  background: #fafafa;
  border-bottom: 1px solid #ebeef5;
  box-sizing: border-box;
  color: #909399;
  font-size: 14px;
  font-weight: 500;
}

.scroller {
  height: 60vh;
  min-height: 360px;
}

.proxy-row {
  display: flex;
  align-items: center;
  height: 54px;
  padding: 0 16px;
  border-bottom: 1px solid #ebeef5;
  box-sizing: border-box;
}

.proxy-row:hover {
  background: #f5f7fa;
}

.proxy-row.is-even {
  background: #fcfcfd;
}

.th,
.td {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-select {
  flex: 0 0 42px;
  display: flex;
  justify-content: center;
}

.col-name {
  flex: 0 0 200px;
}

.col-type {
  flex: 0 0 120px;
}

.col-server {
  flex: 1 1 auto;
  min-width: 250px;
}

.col-port {
  flex: 0 0 100px;
}

.col-actions {
  flex: 0 0 180px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.table-wrapper :deep(.el-empty) {
  padding: 32px 0;
}

:deep(.error-highlight-row) {
  background-color: #fef0f0 !important;
}
</style>
