<template>
  <div class="batch-actions-bar">
    <span>已选择 {{ count }} 个代理</span>
    <div class="batch-actions">
      <el-button size="small" type="danger" @click="$emit('batch-delete')">批量删除</el-button>
      <el-button size="small" type="primary" @click="$emit('batch-add')">添加到代理组</el-button>
      <el-button size="small" @click="$emit('clear')">取消选择</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number }>()

defineEmits<{
  (e: 'batch-delete'): void
  (e: 'batch-add'): void
  (e: 'clear'): void
}>()
</script>

<style scoped>
.batch-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 12px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.batch-actions {
  display: flex;
  gap: 8px;
}
</style>
