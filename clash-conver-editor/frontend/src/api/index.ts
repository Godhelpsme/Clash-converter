import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse
} from 'axios'
import type { ClashConfig } from '@/types/clash-config'
import type {
  APIResponseBase,
  ConfigParseResponse,
  FileListResponse,
  FileReadResponse,
  FileUploadResponse,
  ValidationResult
} from '@/types/api'

const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000
})

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    console.error('API Error:', error)
    return Promise.reject(error)
  }
)

const request = <T>(config: AxiosRequestConfig): Promise<T> =>
  api.request<T>(config).then((response: AxiosResponse<T>) => response.data)

export const fileAPI = {
  list: (): Promise<FileListResponse> =>
    request<FileListResponse>({ method: 'GET', url: '/files/list' }),
  read: (filename: string): Promise<FileReadResponse> =>
    request<FileReadResponse>({ method: 'GET', url: `/files/read/${filename}` }),
  save: (filename: string, config: ClashConfig): Promise<APIResponseBase> =>
    request<APIResponseBase>({
      method: 'POST',
      url: '/files/save',
      data: { filename, config }
    }),
  upload: (file: File, options: AxiosRequestConfig = {}): Promise<FileUploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    return request<FileUploadResponse>({
      ...options,
      method: 'POST',
      url: '/files/upload',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data', ...(options.headers || {}) }
    })
  },
  delete: (filename: string): Promise<APIResponseBase> =>
    request<APIResponseBase>({ method: 'DELETE', url: `/files/${filename}` })
}

export const configAPI = {
  parse: (content: string): Promise<ConfigParseResponse> =>
    request<ConfigParseResponse>({ method: 'POST', url: '/config/parse', data: { content } }),
  validate: (config: ClashConfig): Promise<ValidationResult> =>
    request<ValidationResult>({ method: 'POST', url: '/config/validate', data: { config } })
}

export default api
