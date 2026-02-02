<template>
  <div class="table-header">
    <div class="header-left">
      <el-button type="primary" :icon="Plus" @click="$emit('add')">添加代理</el-button>
      <el-button :icon="Upload" @click="$emit('import')">导入分享链接</el-button>
    </div>
    <div class="header-right">
      <el-input
        :model-value="searchQuery"
        @update:model-value="$emit('update:searchQuery', $event)"
        placeholder="搜索代理（支持正则：/^HK.*/ 或 /HK/i）"
        clearable
        :prefix-icon="Search"
        class="search-input"
      />
      <el-select
        :model-value="selectedProtocol"
        @update:model-value="$emit('update:selectedProtocol', $event)"
        placeholder="筛选协议"
        clearable
        class="protocol-select"
      >
        <el-option
          v-for="protocol in protocols"
          :key="protocol.type"
          :label="protocol.label"
          :value="protocol.type"
        />
      </el-select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Upload, Search } from '@element-plus/icons-vue'
import type { ProtocolDefinition } from '@/types/config-metadata'

defineProps<{
  searchQuery: string
  selectedProtocol: string
  protocols: ProtocolDefinition[]
}>()

defineEmits<{
  (e: 'update:searchQuery', value: string): void
  (e: 'update:selectedProtocol', value: string): void
  (e: 'add'): void
  (e: 'import'): void
}>()
</script>

<style scoped>
.table-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  gap: 8px;
}

.header-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-input {
  width: 260px;
}

.protocol-select {
  width: 200px;
}
</style>
