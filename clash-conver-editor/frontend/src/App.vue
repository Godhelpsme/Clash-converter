<template>
  <div
    id="app"
    v-loading.fullscreen.lock="loadingStore.isLoading"
    :element-loading-text="loadingText"
    element-loading-background="rgba(255, 255, 255, 0.75)"
  >
    <el-container style="height: 100vh">
      <el-header style="padding: 0" v-if="$route.path !== '/login'">
        <div class="header">
          <h1 class="title">
            <el-icon style="margin-right: 8px"><Connection /></el-icon>
            Clash配置编辑器
          </h1>
          <el-button 
            v-if="showLogout" 
            :icon="SwitchButton" 
            @click="handleLogout"
            class="logout-button"
          >
            退出登录
          </el-button>
        </div>
      </el-header>
      <el-main style="padding: 0">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SwitchButton } from '@element-plus/icons-vue'
import axios from 'axios'
import { useLoadingStore } from '@/stores/loading'

const router = useRouter()
const authEnabled = ref(false)

const loadingStore = useLoadingStore()
const loadingText = computed(() => {
  const base = loadingStore.message || '处理中...'
  if (typeof loadingStore.progress === 'number') return `${base}（${loadingStore.progress}%）`
  return base
})

const showLogout = computed(() => {
  return authEnabled.value
})

const checkAuthStatus = async () => {
  try {
    const response = await axios.get('/api/auth/status')
    authEnabled.value = response.data.authEnabled
  } catch {
    authEnabled.value = false
  }
}

const handleLogout = async () => {
  try {
    await axios.post('/api/auth/logout')
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch (error) {
    router.push('/login')
  }
}

onMounted(() => {
  checkAuthStatus()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

#app {
  height: 100vh;
  overflow: hidden;
}

.header {
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.title {
  color: white;
  font-size: 24px;
  font-weight: 600;
  display: flex;
  align-items: center;
  margin: 0;
}

.el-header {
  padding: 0 !important;
}

.el-main {
  background: #f5f7fa;
}

.logout-button {
  background: rgba(255, 255, 255, 0.15);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s;
}

.logout-button:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.5);
  color: white;
}
</style>
