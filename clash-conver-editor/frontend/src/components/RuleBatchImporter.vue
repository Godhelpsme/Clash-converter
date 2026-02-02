<template>
  <el-dialog
    v-model="visible"
    title="批量导入规则"
    width="600px"
    :close-on-click-modal="false"
  >
    <div class="importer">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="每行一条规则，例如：DOMAIN-SUFFIX,google.com,Proxy"
      />

      <el-input
        v-model="rawText"
        type="textarea"
        :rows="12"
        placeholder="粘贴规则，每行一条"
      />

      <div class="importer-tips">
        <span>当前解析：{{ parsedLines.length }} 条规则</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleImport">导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['update:visible', 'import'])

const rawText = ref('')

const visible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
})

const parsedLines = computed(() => {
  return String(rawText.value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
})

const handleImport = () => {
  emit('import', parsedLines.value)
  rawText.value = ''
  visible.value = false
}

const handleCancel = () => {
  rawText.value = ''
  visible.value = false
}

watch(visible, (value) => {
  if (!value) rawText.value = ''
})
</script>

<style scoped>
.importer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.importer-tips {
  color: #909399;
  font-size: 12px;
}
</style>
