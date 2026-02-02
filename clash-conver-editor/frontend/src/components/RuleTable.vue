<template>
  <div class="rule-table">
    <div class="table-header">
      <div class="header-left">
        <el-button type="primary" :icon="Plus" @click="showAddDialog">添加规则</el-button>
        <el-button @click="batchImportVisible = true">批量导入</el-button>
      </div>

      <el-input
        v-model="searchText"
        placeholder="搜索规则（支持正则：/^DOMAIN.*/ 或 /DIRECT$/i）"
        clearable
        style="width: 360px"
        :prefix-icon="Search"
      />
    </div>

    <div v-if="regexError" class="search-error">{{ regexError }}</div>

    <el-table
      ref="tableRef"
      :data="filteredRules"
      style="width: 100%"
      :row-class-name="rowClassName"
    >
      <el-table-column type="index" label="#" width="60" />
      <el-table-column label="规则" min-width="450">
        <template #default="{ row }">
          <el-tag>{{ row.type }}</el-tag>
          <span v-if="row.value" style="margin: 0 8px">{{ row.value }}</span>
          <el-tag type="success">{{ row.policy }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="290" fixed="right">
        <template #default="{ row }">
          <div class="action-buttons">
            <el-button size="small" @click="openEditDialog(row.index)">编辑</el-button>
            <el-button size="small" @click="moveUp(row.index)" :disabled="row.index === 0">
              上移
            </el-button>
            <el-button
              size="small"
              @click="moveDown(row.index)"
              :disabled="row.index === rawRules.length - 1"
            >
              下移
            </el-button>
            <el-button size="small" type="danger" @click="deleteRule(row.index)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      title="添加规则"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="currentRule" :rules="formRules" label-width="100px" status-icon>
        <el-form-item label="规则类型" prop="type">
          <el-select
            v-model="currentRule.type"
            @change="onRuleTypeChange"
            style="width: 100%"
          >
            <el-option
              v-for="ruleType in ruleTypes"
              :key="ruleType.type"
              :label="ruleType.label"
              :value="ruleType.type"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="匹配值" prop="value" v-if="needsValue">
          <el-input
            v-model="currentRule.value"
            placeholder="输入匹配值"
            @blur="() => formRef?.validateField('value')"
          />
        </el-form-item>

        <el-form-item label="策略" prop="policy">
          <el-select
            v-model="currentRule.policy"
            placeholder="选择策略"
            style="width: 100%"
            @change="() => formRef?.validateField('policy')"
          >
            <el-option label="DIRECT" value="DIRECT" />
            <el-option label="REJECT" value="REJECT" />
            <el-option
              v-for="group in proxyGroups"
              :key="group.name"
              :label="group.name"
              :value="group.name"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="editDialogVisible"
      title="编辑规则"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="editFormRef" :model="editingRule" :rules="editFormRules" label-width="100px" status-icon>
        <el-form-item label="规则类型" prop="type">
          <el-select
            v-model="editingRule.type"
            @change="onEditRuleTypeChange"
            style="width: 100%"
          >
            <el-option
              v-for="ruleType in ruleTypes"
              :key="ruleType.type"
              :label="ruleType.label"
              :value="ruleType.type"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="匹配值" prop="value" v-if="editNeedsValue">
          <el-input
            v-model="editingRule.value"
            placeholder="输入匹配值"
            @blur="() => editFormRef?.validateField('value')"
          />
        </el-form-item>

        <el-form-item label="策略" prop="policy">
          <el-select
            v-model="editingRule.policy"
            placeholder="选择策略"
            style="width: 100%"
            @change="() => editFormRef?.validateField('policy')"
          >
            <el-option label="DIRECT" value="DIRECT" />
            <el-option label="REJECT" value="REJECT" />
            <el-option
              v-for="group in proxyGroups"
              :key="group.name"
              :label="group.name"
              :value="group.name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="额外参数">
          <el-input
            v-model="editingExtrasText"
            placeholder="可选：多个用逗号分隔，例如：no-resolve"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="closeEditDialog">取消</el-button>
        <el-button type="primary" @click="saveEditedRule">保存</el-button>
      </template>
    </el-dialog>

    <RuleBatchImporter v-model:visible="batchImportVisible" @import="handleBatchImport" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { EventBus } from '@/utils/event-bus'
import { ValidationRules } from '@/utils/validation-rules'
import RuleBatchImporter from './RuleBatchImporter.vue'

const props = defineProps({
  category: Object,
  config: Object
})

const emit = defineEmits(['update'])

const ruleTypes = computed(() => props.category.ruleTypes || [])
const searchText = ref('')

const dialogVisible = ref(false)
const currentRule = ref({
  type: 'DOMAIN-SUFFIX',
  value: '',
  policy: 'DIRECT'
})

const editDialogVisible = ref(false)
const editingIndex = ref(-1)
const editingRule = ref({
  type: 'DOMAIN-SUFFIX',
  value: '',
  policy: 'DIRECT'
})
const editingExtrasText = ref('')

const batchImportVisible = ref(false)

const formRef = ref(null)
const editFormRef = ref(null)
const tableRef = ref(null)

const rawRules = computed(() => props.config.rules || [])
const proxyGroups = computed(() => props.config['proxy-groups'] || [])

const getRuleTypeMeta = (type) => {
  return ruleTypes.value.find(rt => rt.type === type)
}

const needsValue = computed(() => {
  const ruleType = getRuleTypeMeta(currentRule.value.type)
  return ruleType?.hasValue !== false
})

const editNeedsValue = computed(() => {
  const ruleType = getRuleTypeMeta(editingRule.value.type)
  return ruleType?.hasValue !== false
})

const parseRuleDetailed = (ruleStr) => {
  const str = String(ruleStr || '')
  const parts = str.split(',')
  const type = parts[0] || ''

  const ruleType = getRuleTypeMeta(type)
  const hasValue = ruleType?.hasValue !== false

  if (!hasValue) {
    return {
      type,
      value: '',
      policy: parts[1] || 'DIRECT',
      extras: parts.slice(2)
    }
  }

  return {
    type,
    value: parts[1] || '',
    policy: parts[2] || 'DIRECT',
    extras: parts.slice(3)
  }
}

const formatRuleDetailed = ({ type, value, policy, extras }) => {
  const ruleType = getRuleTypeMeta(type)
  const hasValue = ruleType?.hasValue !== false

  const parts = []
  parts.push(type)

  if (hasValue) parts.push(value)
  parts.push(policy)

  const extraParts = (extras || []).map(x => String(x).trim()).filter(Boolean)
  parts.push(...extraParts)

  return parts.join(',')
}

const parseExtrasText = (text) => {
  return String(text || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

const rules = computed(() => {
  return rawRules.value.map((ruleStr, index) => {
    const parsed = parseRuleDetailed(ruleStr)
    const ruleType = getRuleTypeMeta(parsed.type)
    const hasValue = ruleType?.hasValue !== false

    return {
      index,
      type: parsed.type,
      value: hasValue ? parsed.value : null,
      policy: parsed.policy,
      extras: parsed.extras || []
    }
  })
})

const parseRegexSearch = (input) => {
  const raw = (input || '').trim()
  if (!raw) return { mode: 'none', regex: null, error: '' }

  if (!raw.startsWith('/') || raw.lastIndexOf('/') === 0) {
    return { mode: 'fuzzy', regex: null, error: '' }
  }

  const lastSlash = raw.lastIndexOf('/')
  const pattern = raw.slice(1, lastSlash)
  const flags = raw.slice(lastSlash + 1) || 'i'

  if (!pattern) return { mode: 'fuzzy', regex: null, error: '' }

  try {
    return { mode: 'regex', regex: new RegExp(pattern, flags), error: '' }
  } catch {
    return { mode: 'regex', regex: null, error: '正则表达式无效，将按模糊搜索处理' }
  }
}

const searchInfo = computed(() => parseRegexSearch(searchText.value))
const regexError = computed(() => searchInfo.value.error)

const filteredRules = computed(() => {
  const all = rules.value
  const query = searchText.value.trim()
  if (!query) return all

  const info = searchInfo.value
  if (info.mode === 'regex' && info.regex) {
    const r = info.regex
    return all.filter(rule => {
      const text = `${rule.type},${rule.value || ''},${rule.policy}${rule.extras?.length ? ',' + rule.extras.join(',') : ''}`
      return r.test(text)
    })
  }

  const search = query.toLowerCase()
  return all.filter(rule =>
    rule.type.toLowerCase().includes(search) ||
    rule.value?.toLowerCase().includes(search) ||
    rule.policy.toLowerCase().includes(search)
  )
})

const onRuleTypeChange = async () => {
  const ruleType = getRuleTypeMeta(currentRule.value.type)
  if (ruleType?.hasValue === false) {
    currentRule.value.value = ''
  }

  await nextTick()
  formRef.value?.clearValidate()
}

const onEditRuleTypeChange = async () => {
  const ruleType = getRuleTypeMeta(editingRule.value.type)
  if (ruleType?.hasValue === false) {
    editingRule.value.value = ''
  }

  await nextTick()
  editFormRef.value?.clearValidate()
}

const showAddDialog = async () => {
  currentRule.value = {
    type: 'DOMAIN-SUFFIX',
    value: '',
    policy: 'DIRECT'
  }
  dialogVisible.value = true

  await nextTick()
  formRef.value?.clearValidate()
}

const formRules = computed(() => {
  const rules = {
    type: [ValidationRules.required('规则类型')],
    policy: [ValidationRules.required('策略')]
  }
  if (needsValue.value) {
    rules.value = [ValidationRules.required('匹配值')]
  }
  return rules
})

const editFormRules = computed(() => {
  const rules = {
    type: [ValidationRules.required('规则类型')],
    policy: [ValidationRules.required('策略')]
  }
  if (editNeedsValue.value) {
    rules.value = [ValidationRules.required('匹配值')]
  }
  return rules
})

const saveRule = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  const ruleStr = formatRuleDetailed({
    type: currentRule.value.type,
    value: currentRule.value.value,
    policy: currentRule.value.policy,
    extras: []
  })

  const newRules = [...rawRules.value, ruleStr]
  emit('update', 'rules', newRules)
  dialogVisible.value = false
  ElMessage.success('添加成功')
}

const openEditDialog = (index) => {
  if (index < 0 || index >= rawRules.value.length) return

  const parsed = parseRuleDetailed(rawRules.value[index])

  editingIndex.value = index
  editingRule.value = {
    type: parsed.type,
    value: parsed.value,
    policy: parsed.policy
  }
  editingExtrasText.value = (parsed.extras || []).join(',')
  editDialogVisible.value = true
}

const closeEditDialog = () => {
  editDialogVisible.value = false
  editingIndex.value = -1
  editingExtrasText.value = ''
}

const saveEditedRule = async () => {
  const index = editingIndex.value
  if (index < 0 || index >= rawRules.value.length) return

  try {
    await editFormRef.value?.validate()
  } catch {
    return
  }

  const ruleStr = formatRuleDetailed({
    type: editingRule.value.type,
    value: editingRule.value.value,
    policy: editingRule.value.policy,
    extras: parseExtrasText(editingExtrasText.value)
  })

  const newRules = [...rawRules.value]
  newRules[index] = ruleStr

  emit('update', 'rules', newRules)

  closeEditDialog()
  ElMessage.success('规则已更新')
}

const handleBatchImport = (importedRules) => {
  const incoming = Array.isArray(importedRules) ? importedRules : []
  const cleaned = incoming.map(r => String(r || '').trim()).filter(Boolean)

  if (cleaned.length === 0) {
    ElMessage.warning('未解析到可导入的规则')
    return
  }

  const newRules = [...rawRules.value, ...cleaned]
  emit('update', 'rules', newRules)
}

const deleteRule = (index) => {
  const newRules = rawRules.value.filter((_, i) => i !== index)
  emit('update', 'rules', newRules)
  ElMessage.success('删除成功')
}

const moveUp = (index) => {
  if (index === 0) return
  const newRules = [...rawRules.value]
  ;[newRules[index - 1], newRules[index]] = [newRules[index], newRules[index - 1]]
  emit('update', 'rules', newRules)
}

const moveDown = (index) => {
  if (index === rawRules.value.length - 1) return
  const newRules = [...rawRules.value]
  ;[newRules[index], newRules[index + 1]] = [newRules[index + 1], newRules[index]]
  emit('update', 'rules', newRules)
}

const highlightedRuleIndex = ref(null)
let highlightTimer = null

const rowClassName = ({ row }) => {
  if (highlightedRuleIndex.value == null) return ''
  return row.index === highlightedRuleIndex.value ? 'error-highlight-row' : ''
}

const scrollToHighlightedRow = async () => {
  await nextTick()
  const el = tableRef.value?.$el?.querySelector('.el-table__body-wrapper .error-highlight-row')
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const onHighlightRuleError = async ({ index }) => {
  if (typeof index !== 'number' || !Number.isFinite(index)) return
  if (index < 0 || index >= rawRules.value.length) return

  searchText.value = ''
  highlightedRuleIndex.value = index

  await scrollToHighlightedRow()

  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightedRuleIndex.value = null
  }, 5000)
}

onMounted(() => {
  EventBus.on('highlight-rule-error', onHighlightRuleError)
})

onUnmounted(() => {
  EventBus.off('highlight-rule-error', onHighlightRuleError)
  if (highlightTimer) clearTimeout(highlightTimer)
})
</script>

<style scoped>
.rule-table {
  width: 100%;
}

.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.header-left {
  display: flex;
  gap: 8px;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: nowrap;
}

.search-error {
  margin: -8px 0 12px;
  color: #f56c6c;
  font-size: 12px;
}

:deep(.error-highlight-row) {
  background-color: #fef0f0 !important;
}

:deep(.error-highlight-row td) {
  border-top: 1px solid #f56c6c;
  border-bottom: 1px solid #f56c6c;
}
</style>
