<template>
  <el-dialog
    :model-value="visible"
    :title="isEdit ? '编辑代理' : '添加代理'"
    width="600px"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="proxy" :rules="formRules" label-width="120px" status-icon>
      <el-form-item label="协议类型" prop="type">
        <el-select
          :model-value="String(proxy.type || '')"
          :disabled="isEdit"
          @update:model-value="handleProtocolChange"
        >
          <el-option
            v-for="protocol in protocols"
            :key="protocol.type"
            :label="protocol.label"
            :value="protocol.type"
          />
        </el-select>
      </el-form-item>

      <el-form-item
        v-for="field in fields"
        :key="field.key"
        :label="field.label"
        :required="field.required"
        :prop="field.key"
      >
        <el-input
          v-if="field.type === 'string'"
          :model-value="String(proxy[field.key] ?? '')"
          :placeholder="field.label"
          @update:model-value="handleStringUpdate(field.key)"
          @blur="() => formRef?.validateField(field.key)"
        />
        <el-input-number
          v-else-if="field.type === 'number'"
          :model-value="proxy[field.key] as number | undefined"
          :placeholder="field.label"
          style="width: 100%"
          @update:model-value="handleNumberUpdate(field.key)"
          @blur="() => formRef?.validateField(field.key)"
        />
        <el-switch
          v-else-if="field.type === 'boolean'"
          :model-value="Boolean(proxy[field.key])"
          @update:model-value="handleBooleanUpdate(field.key)"
        />
        <el-select
          v-else-if="field.type === 'select'"
          :model-value="proxy[field.key] as string | undefined"
          :placeholder="'请选择' + field.label"
          @update:model-value="handleSelectUpdate(field.key)"
          @change="() => formRef?.validateField(field.key)"
        >
          <el-option
            v-for="option in field.options || []"
            :key="option"
            :label="option"
            :value="option"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import { ValidationRules } from '@/utils/validation-rules'
import { useFormValidation } from '@/composables/useFormValidation'
import type { ConfigField, ProtocolDefinition } from '@/types/config-metadata'
import type { ClashProxy } from '@/types/clash-config'

type ProxyFormData = Partial<ClashProxy> & Record<string, unknown>

const props = defineProps<{
  visible: boolean
  isEdit: boolean
  proxy: ProxyFormData
  fields: ConfigField[]
  protocols: ProtocolDefinition[]
  existingNames: string[]
  excludeName?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:proxy', value: ProxyFormData): void
  (e: 'protocol-change', value: string): void
  (e: 'save'): void
}>()

const formRef = ref()

const fieldsRef = computed(() => props.fields) as Ref<ConfigField[]>
const existingNamesRef = computed(() => props.existingNames) as Ref<string[]>
const excludeNameRef = computed(() => props.excludeName ?? null) as Ref<string | null>

const dynamicRules = useFormValidation(fieldsRef, {
  existingNames: existingNamesRef,
  excludeName: excludeNameRef
})

const formRules = computed(() => {
  return {
    type: [ValidationRules.required('协议类型')],
    ...dynamicRules.value
  }
})

const updateField = (key: string, value: unknown) => {
  emit('update:proxy', { ...props.proxy, [key]: value })
}

const handleStringUpdate = (key: string) => (value: string) => {
  updateField(key, value)
}

const handleNumberUpdate = (key: string) => (value: number | null | undefined) => {
  updateField(key, value ?? undefined)
}

const handleBooleanUpdate = (key: string) => (value: boolean) => {
  updateField(key, value)
}

const handleSelectUpdate = (key: string) => (value: string) => {
  updateField(key, value)
}

const handleProtocolChange = (value: string) => {
  emit('update:proxy', { ...props.proxy, type: value as ClashProxy['type'] })
  emit('protocol-change', value)
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  emit('save')
}
</script>
