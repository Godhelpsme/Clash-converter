<template>
  <div class="config-editor">
    <div class="editor-header">
      <el-button :icon="ArrowLeft" @click="goBack">返回</el-button>
      <span class="current-file">
        <el-icon><Document /></el-icon>
        {{ configStore.currentFile }}
      </span>
      <div class="actions">
        <el-button :icon="View" :loading="previewing" @click="previewYAML">预览YAML</el-button>
        <el-button type="primary" :icon="Check" @click="saveConfig" :loading="saving">
          保存配置
        </el-button>
      </div>
    </div>

    <div class="editor-content" v-loading="!metadata">
      <el-tabs v-model="activeTab" v-if="metadata">
        <el-tab-pane
          v-for="category in metadata.categories"
          :key="category.id"
          :label="category.name"
          :name="category.id"
          lazy
        >
          <component
            :is="getComponentForCategory(category)"
            :category="category"
            :config="configStore.config"
            @update="updateConfig"
          />
        </el-tab-pane>
      </el-tabs>
    </div>

    <el-dialog
      v-model="previewVisible"
      title="YAML预览"
      width="70%"
      :close-on-click-modal="false"
    >
      <el-input
        v-model="yamlPreview"
        type="textarea"
        :rows="20"
        readonly
        style="font-family: 'Consolas', 'Monaco', monospace"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, View, Check } from '@element-plus/icons-vue'
import yaml from 'js-yaml'
import { fileAPI, configAPI } from '@/api'
import { useConfigStore } from '@/stores/config'
import { useLoadingStore } from '@/stores/loading'
import { EventBus } from '@/utils/event-bus'
import { dumpYAMLAsync } from '@/utils/yaml-async'
import BasicConfigForm from '@/components/BasicConfigForm.vue'
import ProxyTable from '@/components/ProxyTable.vue'
import ProxyGroupTable from '@/components/ProxyGroupTable.vue'
import RuleTable from '@/components/RuleTable.vue'

const router = useRouter()
const configStore = useConfigStore()
const loadingStore = useLoadingStore()

const activeTab = ref('basic')
const metadata = ref(null)
const saving = ref(false)
const previewing = ref(false)
const previewVisible = ref(false)
const yamlPreview = ref('')

const goBack = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要返回吗？未保存的更改将丢失。',
      '确认返回',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    router.push('/')
  } catch {
  }
}

const getComponentForCategory = (category) => {
  if (category.id === 'proxies') return ProxyTable
  if (category.id === 'proxy-groups') return ProxyGroupTable
  if (category.id === 'rules') return RuleTable
  return BasicConfigForm
}

const updateConfig = (key, value) => {
  const config = { ...configStore.config }
  if (key.includes('.')) {
    const keys = key.split('.')
    let obj = config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {}
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
  } else {
    config[key] = value
  }
  configStore.setConfig(config)
}

const normalizeIndex = (index, length) => {
  if (typeof index !== 'number' || !Number.isFinite(index)) return null
  const i = Math.trunc(index)
  if (i >= 0 && i < length) return i
  // 兼容部分结构化错误使用 1-based 下标
  if (i >= 1 && i <= length) return i - 1
  return null
}

const locateValidationError = (err) => {
  const config = configStore.config || {}
  const proxies = Array.isArray(config.proxies) ? config.proxies : []
  const rules = Array.isArray(config.rules) ? config.rules : []

  // 结构化错误（兼容未来后端返回 type/index/field 的场景）
  if (err && typeof err === 'object') {
    const type = err.type
    if (type === 'proxy' || type === 'proxies') {
      const idx = normalizeIndex(err.index, proxies.length)
      if (idx == null) return null
      return {
        tab: 'proxies',
        event: 'highlight-proxy-error',
        payload: {
          index: idx,
          field: err.field,
          message: err.message || err.msg
        }
      }
    }

    if (type === 'rule' || type === 'rules') {
      const idx = normalizeIndex(err.index, rules.length)
      if (idx == null) return null
      return {
        tab: 'rules',
        event: 'highlight-rule-error',
        payload: {
          index: idx,
          field: err.field,
          message: err.message || err.msg
        }
      }
    }
  }

  // 兼容现有后端：errors 为字符串数组
  const text = String(err || '').trim()
  if (!text) return null

  if (text.startsWith('代理')) {
    let idx = null

    const mIndex = text.match(/^代理\s*#(\d+)\s*:/)
    if (mIndex) idx = Number(mIndex[1]) - 1

    if (idx == null) {
      const mName = text.match(/^代理\s*"([^"]+)"\s*:/)
      if (mName) {
        const nameOrIndex = mName[1]
        if (/^\d+$/.test(nameOrIndex)) {
          idx = Number(nameOrIndex) - 1
        } else {
          idx = proxies.findIndex(p => p?.name === nameOrIndex)
        }
      }
    }

    if (idx == null || idx < 0) return null

    let field = null
    if (text.includes('name')) field = 'name'
    else if (text.includes('type')) field = 'type'
    else if (text.includes('server')) field = 'server'
    else if (text.includes('port')) field = 'port'

    return {
      tab: 'proxies',
      event: 'highlight-proxy-error',
      payload: { index: idx, field, message: text }
    }
  }

  if (text.startsWith('规则')) {
    const mIndex = text.match(/^规则\s*#(\d+)/)
    if (!mIndex) return null
    const idx = Number(mIndex[1]) - 1
    if (idx < 0) return null

    return {
      tab: 'rules',
      event: 'highlight-rule-error',
      payload: { index: idx, field: 'rule', message: text }
    }
  }

  return null
}

const highlightByValidationError = async (err) => {
  const location = locateValidationError(err)
  if (!location) return

  activeTab.value = location.tab
  await nextTick()
  EventBus.emit(location.event, location.payload)
}

const saveConfig = async () => {
  saving.value = true
  const token = loadingStore.start('验证中...')
  loadingStore.update({ token, percent: 20 })

  try {
    const validateRes = await configAPI.validate(configStore.config)
    loadingStore.update({ token, msg: '验证中...', percent: 50 })

    const rawErrors =
      Array.isArray(validateRes?.errorDetails) && validateRes.errorDetails.length > 0
        ? validateRes.errorDetails
        : Array.isArray(validateRes?.errors)
          ? validateRes.errors
          : []

    const rawWarnings =
      Array.isArray(validateRes?.warningDetails) && validateRes.warningDetails.length > 0
        ? validateRes.warningDetails
        : Array.isArray(validateRes?.warnings)
          ? validateRes.warnings
          : []

    const errorMessages = rawErrors.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item.message === 'string') return item.message
      if (item && typeof item.msg === 'string') return item.msg
      return JSON.stringify(item)
    })

    const warningMessages = rawWarnings.map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item.message === 'string') return item.message
      if (item && typeof item.msg === 'string') return item.msg
      return JSON.stringify(item)
    })

    if (rawErrors.length > 0) {
      await highlightByValidationError(rawErrors[0])

      await ElMessageBox.confirm(
        `配置验证发现 ${rawErrors.length} 个错误：\n\n${errorMessages
          .slice(0, 5)
          .join('\n')}${rawErrors.length > 5 ? '\n...' : ''}\n\n是否仍要保存？`,
        '配置验证失败',
        {
          confirmButtonText: '仍要保存',
          cancelButtonText: '取消',
          type: 'error'
        }
      )
    } else if (rawWarnings.length > 0) {
      await ElMessageBox.confirm(
        `配置验证发现 ${rawWarnings.length} 个警告：\n\n${warningMessages
          .slice(0, 3)
          .join('\n')}${rawWarnings.length > 3 ? '\n...' : ''}\n\n是否继续保存？`,
        '配置验证警告',
        {
          confirmButtonText: '继续保存',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    }

    loadingStore.update({ token, msg: '保存中...', percent: 70 })
    const res = await fileAPI.save(configStore.currentFile, configStore.config)

    if (res.success) {
      loadingStore.update({ token, msg: '保存完成', percent: 100 })
      ElMessage.success('保存成功')
    } else {
      loadingStore.update({ token, msg: '保存失败', percent: null })
      ElMessage.error('保存失败: ' + (res.error || '未知错误'))
    }
  } catch (error) {
    if (error === 'cancel' || error === 'close') {
      // 用户取消
    } else {
      ElMessage.error('保存失败: ' + (error?.message || String(error)))
    }
  } finally {
    loadingStore.finish(token)
    saving.value = false
  }
}

const previewYAML = async () => {
  const token = loadingStore.start('生成YAML中...')
  loadingStore.update({ token, percent: 10 })
  previewing.value = true

  try {
    // 先让出一帧，确保 Loading 遮罩能渲染出来
    await nextTick()

    try {
      yamlPreview.value = await dumpYAMLAsync(configStore.config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      })
    } catch (error) {
      yamlPreview.value = yaml.dump(configStore.config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      })
    }

    loadingStore.update({ token, percent: 100 })
    previewVisible.value = true
  } catch (error) {
    ElMessage.error('生成YAML失败: ' + (error?.message || String(error)))
  } finally {
    loadingStore.finish(token)
    previewing.value = false
  }
}

const loadMetadata = async () => {
  try {
    const response = await fetch('/config-metadata.json')
    metadata.value = await response.json()
    configStore.setMetadata(metadata.value)
  } catch (error) {
    ElMessage.error('加载配置元数据失败')
  }
}

onMounted(() => {
  if (!configStore.currentFile) {
    router.push('/')
    return
  }
  loadMetadata()
})
</script>

<style scoped>
.config-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.editor-header {
  height: 64px;
  background: white;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 16px;
}

.current-file {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 500;
  color: #303133;
}

.actions {
  display: flex;
  gap: 12px;
}

.editor-content {
  flex: 1;
  overflow: auto;
  padding: 24px;
  background: #f5f7fa;
}

.editor-content :deep(.el-tabs) {
  background: white;
  border-radius: 4px;
  padding: 16px;
}

.editor-content :deep(.el-tabs__content) {
  padding: 16px 0;
}
</style>
