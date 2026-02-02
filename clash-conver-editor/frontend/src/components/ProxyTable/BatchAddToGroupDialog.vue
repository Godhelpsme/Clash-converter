<template>
  <el-dialog
    :model-value="visible"
    title="批量添加到代理组"
    width="520px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <div class="batch-add-tip">
      将已选择的 {{ count }} 个代理添加到以下代理组：
    </div>
    <el-select
      :model-value="targets"
      @update:model-value="$emit('update:targets', $event)"
      multiple
      filterable
      placeholder="选择代理组"
      style="width: 100%"
    >
      <el-option
        v-for="group in groups"
        :key="group.name"
        :label="group.name"
        :value="group.name"
      />
    </el-select>

    <template #footer>
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" :disabled="targets.length === 0" @click="$emit('confirm')">
        添加
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import type { ClashProxyGroup } from '@/types/clash-config'

defineProps<{
  visible: boolean
  targets: string[]
  groups: ClashProxyGroup[]
  count: number
}>()

defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:targets', value: string[]): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<style scoped>
.batch-add-tip {
  margin-bottom: 12px;
  color: #606266;
}
</style>
