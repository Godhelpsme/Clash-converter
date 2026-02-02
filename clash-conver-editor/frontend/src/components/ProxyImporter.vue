<template>
  <el-dialog v-model="visible" title="导入代理节点" width="600px" @open="resetForm">
    <el-input
      v-model="inputText"
      type="textarea"
      :rows="10"
      placeholder="粘贴代理分享链接（每行一个）&#10;&#10;支持协议:&#10;• vless://&#10;• vmess://&#10;• ss:// (Shadowsocks)&#10;• trojan://&#10;• hysteria2:// 或 hy2://&#10;• ssr:// (ShadowsocksR)&#10;• hysteria://&#10;• tuic://"
    />

    <div v-if="lastResult" class="result-info">
      <el-alert
        v-if="lastResult.proxies.length > 0"
        type="success"
        :closable="false"
        show-icon
      >
        成功解析 {{ lastResult.proxies.length }} 个代理节点
      </el-alert>
      <el-alert
        v-if="lastResult.errors.length > 0"
        type="warning"
        :closable="false"
        show-icon
        class="mt-2"
      >
        <template #default>
          <div>{{ lastResult.errors.length }} 个链接解析失败</div>
          <div class="error-list">
            <div v-for="err in lastResult.errors.slice(0, 3)" :key="err.line">
              第 {{ err.line }} 行: {{ err.error }}
            </div>
            <div v-if="lastResult.errors.length > 3">
              ...还有 {{ lastResult.errors.length - 3 }} 个错误
            </div>
          </div>
        </template>
      </el-alert>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="handleImport" :loading="loading">
        导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { parseBatchProxyLinks } from '@/vendor/proxy-converter-core/index.js';
import { useConfigStore } from '@/stores/config';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});
const emit = defineEmits(['update:visible']);
const visible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

const inputText = ref('');
const loading = ref(false);
const lastResult = ref(null);
const configStore = useConfigStore();

const resetForm = () => {
  inputText.value = '';
  lastResult.value = null;
  loading.value = false;
};

const handleImport = () => {
  const lines = inputText.value.split('\n');

  if (lines.filter(l => l.trim() && l.includes('://')).length === 0) {
    ElMessage.warning('请输入至少一个代理链接');
    return;
  }

  loading.value = true;
  try {
    // 直接在前端解析，零延迟
    const result = parseBatchProxyLinks(lines);
    lastResult.value = result;

    if (result.proxies.length > 0) {
      // 合并到当前配置（包含名称冲突处理）
      configStore.addProxies(result.proxies);
      ElMessage.success(`成功导入 ${result.proxies.length} 个代理节点`);
    }

    if (result.errors.length > 0) {
      ElMessage.warning(
        `${result.errors.length} 个链接解析失败，请检查格式`
      );
    }

    if (result.proxies.length > 0 && result.errors.length === 0) {
      visible.value = false;
    }
  } catch (error) {
    ElMessage.error('导入失败: ' + error.message);
    console.error('Import error:', error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.result-info {
  margin-top: 16px;
}

.mt-2 {
  margin-top: 8px;
}

.error-list {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}
</style>
