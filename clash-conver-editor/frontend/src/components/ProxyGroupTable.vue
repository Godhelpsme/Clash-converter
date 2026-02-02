<template>
  <div class="proxy-group-table">
    <div class="table-header">
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加代理组</el-button>
    </div>

    <el-table :data="proxyGroups" style="width: 100%">
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column label="代理列表" min-width="260">
        <template #default="{ row }">
          <span>共 {{ row.proxies?.length || 0 }} 个节点</span>
          <el-button
            v-if="row.proxies && row.proxies.length > 0"
            link
            type="primary"
            style="margin-left: 8px"
            @click="viewProxies(row)"
          >
            查看详情
          </el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row, $index }">
          <el-button size="small" @click="editGroup(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteGroup($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑代理组' : '添加代理组'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="currentGroup" label-width="120px">
        <el-form-item label="类型">
          <el-select v-model="currentGroup.type" @change="onTypeChange" :disabled="isEdit">
            <el-option
              v-for="type in groupTypes"
              :key="type.type"
              :label="type.label"
              :value="type.type"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-for="field in currentFields"
          :key="field.key"
          :label="field.label"
          :required="field.required"
        >
          <el-input
            v-if="field.type === 'string'"
            v-model="currentGroup[field.key]"
            :placeholder="field.default || field.label"
          />
          <el-input-number
            v-else-if="field.type === 'number'"
            v-model="currentGroup[field.key]"
            :placeholder="field.default"
            style="width: 100%"
          />
          <el-select v-else-if="field.type === 'select'" v-model="currentGroup[field.key]">
            <el-option
              v-for="option in field.options"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>
          <el-select
            v-else-if="field.type === 'array' && field.key === 'proxies'"
            v-model="currentGroup[field.key]"
            multiple
            placeholder="选择代理"
            style="width: 100%"
          >
            <el-option
              v-for="proxy in availableProxies"
              :key="proxy"
              :label="proxy"
              :value="proxy"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" :title="detailTitle" size="40%" :with-header="true">
      <div class="proxy-tags" v-if="detailProxies.length > 0">
        <el-tag v-for="proxy in detailProxies" :key="proxy" size="small" class="proxy-tag">
          {{ proxy }}
        </el-tag>
      </div>
      <el-empty v-else description="暂无代理" />
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  category: Object,
  config: Object
})

const emit = defineEmits(['update'])

const groupTypes = computed(() => props.category.types || [])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentGroup = ref({})
const editIndex = ref(-1)
const currentFields = ref([])

const detailVisible = ref(false)
const detailGroup = ref(null)

const proxyGroups = computed(() => props.config['proxy-groups'] || [])

const availableProxies = computed(() => {
  const builtIn = ['DIRECT', 'REJECT']
  const proxies = (props.config.proxies || []).map(p => p.name).filter(Boolean)
  const groups = (props.config['proxy-groups'] || [])
    .filter(g => g.name && g.name !== currentGroup.value.name)
    .map(g => g.name)

  return [...new Set([...builtIn, ...proxies, ...groups])]
})

const detailTitle = computed(() => {
  if (!detailGroup.value?.name) return '代理列表'
  return `${detailGroup.value.name} - 代理列表`
})

const detailProxies = computed(() => detailGroup.value?.proxies || [])

const viewProxies = (group) => {
  detailGroup.value = group
  detailVisible.value = true
}

const onTypeChange = () => {
  const type = groupTypes.value.find(t => t.type === currentGroup.value.type)
  currentFields.value = type?.fields || []

  const newGroup = { type: currentGroup.value.type }
  currentFields.value.forEach(field => {
    if (field.default !== undefined) {
      newGroup[field.key] = field.default
    } else if (field.type === 'array') {
      newGroup[field.key] = []
    }
  })
  currentGroup.value = newGroup
}

const showAddDialog = () => {
  isEdit.value = false
  editIndex.value = -1
  currentGroup.value = { type: 'select' }
  onTypeChange()
  dialogVisible.value = true
}

const editGroup = (row, index) => {
  isEdit.value = true
  editIndex.value = index
  currentGroup.value = { ...row }
  const type = groupTypes.value.find(t => t.type === row.type)
  currentFields.value = type?.fields || []
  dialogVisible.value = true
}

const replaceGroupNameInProxyGroups = (groups, oldName, newName) => {
  return (groups || []).map(group => {
    if (group.proxies && Array.isArray(group.proxies)) {
      return {
        ...group,
        proxies: group.proxies.map(p => (p === oldName ? newName : p))
      }
    }
    return group
  })
}

const replaceGroupNameInRules = (rules, oldName, newName) => {
  return (rules || []).map(rule => {
    if (typeof rule !== 'string') return rule

    const parts = rule.split(',')
    if (parts.length < 2) return rule

    const policyIndex = parts[0] === 'MATCH' ? 1 : (parts.length >= 3 ? 2 : 1)
    if (policyIndex >= parts.length) return rule

    if (parts[policyIndex] === oldName) {
      parts[policyIndex] = newName
      return parts.join(',')
    }

    return rule
  })
}

const saveGroup = () => {
  if (!currentGroup.value.name) {
    ElMessage.error('请填写代理组名称')
    return
  }

  if (!currentGroup.value.proxies || currentGroup.value.proxies.length === 0) {
    ElMessage.error('请选择至少一个代理')
    return
  }

  const dedupedProxies = [...new Set(currentGroup.value.proxies)]

  let newGroups = [...proxyGroups.value]

  if (isEdit.value) {
    const oldName = newGroups[editIndex.value]?.name
    const newName = currentGroup.value.name

    newGroups[editIndex.value] = {
      ...currentGroup.value,
      proxies: dedupedProxies
    }

    if (oldName && oldName !== newName) {
      newGroups = replaceGroupNameInProxyGroups(newGroups, oldName, newName)
      const newRules = replaceGroupNameInRules(props.config.rules || [], oldName, newName)
      emit('update', 'rules', newRules)

      emit('update', 'proxy-groups', newGroups)
      dialogVisible.value = false
      ElMessage.success('修改成功，已同步更新引用')
      return
    }
  } else {
    newGroups.push({
      ...currentGroup.value,
      proxies: dedupedProxies
    })
  }

  emit('update', 'proxy-groups', newGroups)
  dialogVisible.value = false
  ElMessage.success(isEdit.value ? '修改成功' : '添加成功')
}

const deleteGroup = (index) => {
  const newGroups = proxyGroups.value.filter((_, i) => i !== index)
  emit('update', 'proxy-groups', newGroups)
  ElMessage.success('删除成功')
}
</script>

<style scoped>
.proxy-group-table {
  width: 100%;
}

.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.proxy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
  max-height: calc(100vh - 180px);
  overflow: auto;
}

.proxy-tag {
  max-width: 100%;
}

.proxy-tag :deep(.el-tag__content) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
