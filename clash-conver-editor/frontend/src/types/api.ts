import type { ClashConfig } from './clash-config'

export interface APIResponseBase {
  success: boolean
  message?: string
  error?: string
}

export interface FileInfo {
  name: string
  path: string
  size: number
  modified: string
}

export interface UploadedFileInfo {
  name: string
  path: string
  size: number
}

export interface FileListResponse extends APIResponseBase {
  files: FileInfo[]
}

export interface FileReadResponse extends APIResponseBase {
  filename: string
  content: string
  config: ClashConfig
}

export interface FileUploadResponse extends APIResponseBase {
  file: UploadedFileInfo
}

export interface ConfigParseResponse extends APIResponseBase {
  config: ClashConfig
}

export interface ValidationError {
  type?: string
  index?: number
  field?: string
  message?: string
  msg?: string
}

export interface ValidationResult {
  success: boolean
  valid: boolean
  errors: ValidationError[] | string[]
  warnings: ValidationError[] | string[]
  errorDetails?: ValidationError[]
  warningDetails?: ValidationError[]
}
