import { createRouter, createWebHistory } from 'vue-router'
import FileSelector from '../views/FileSelector.vue'
import ConfigEditor from '../views/ConfigEditor.vue'
import Login from '../views/Login.vue'
import axios from 'axios'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'FileSelector',
    component: FileSelector,
    meta: { requiresAuth: true }
  },
  {
    path: '/editor',
    name: 'ConfigEditor',
    component: ConfigEditor,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

let authEnabled = null

const checkAuthEnabled = async () => {
  if (authEnabled !== null) return authEnabled
  
  try {
    const response = await axios.get('/api/auth/status')
    authEnabled = response.data.authEnabled
    return authEnabled
  } catch {
    authEnabled = false
    return false
  }
}

router.beforeEach(async (to, from, next) => {
  const isAuthEnabled = await checkAuthEnabled()
  
  if (!isAuthEnabled) {
    if (to.path === '/login') {
      next('/')
    } else {
      next()
    }
    return
  }

  const verifyWithCookie = async () => {
    await axios.get('/api/auth/verify')
  }

  if (to.meta.requiresAuth) {
    try {
      await verifyWithCookie()
      next()
    } catch {
      next('/login')
    }
    return
  }

  if (to.path === '/login') {
    try {
      await verifyWithCookie()
      next('/')
    } catch {
      next()
    }
    return
  }

  next()
})

export default router
