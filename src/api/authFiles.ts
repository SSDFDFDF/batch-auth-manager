import { request } from '../lib/request'

export interface AuthFile {
  id: string
  auth_index: string
  name: string
  size: number
  type: string
  disabled: boolean
  provider: string
  status: string
  status_message?: string
  unavailable: boolean
  runtime_only?: boolean
  email?: string
  account_type?: string
  account?: string
  created_at?: string
  updated_at?: string
  last_refresh?: string
  modtime?: string
  runtimeOnly?: boolean
  id_token?: {
    chatgpt_account_id?: string
    plan_type?: string
    [key: string]: any
  }
}

export interface AuthFilesResponse {
  files: AuthFile[]
}

/**
 * Authentication File API
 */
export const authFilesApi = {
  /**
   * List authentication files
   */
  list(): Promise<AuthFilesResponse> {
    return request.get<AuthFilesResponse>('/v0/management/auth-files')
  },

  /**
   * Upload authentication file
   */
  upload(file: File): Promise<any> {
    const formData = new FormData()
    formData.append('file', file, file.name)
    return request.postForm('/v0/management/auth-files', formData)
  },

  /**
   * Download authentication file
   */
  async download(name: string): Promise<Blob> {
    const response = await request.get(`/v0/management/auth-files/download?name=${encodeURIComponent(name)}`, {
      responseType: 'blob'
    })
    return response as unknown as Blob
  },

  /**
   * Delete authentication file
   */
  delete(name: string): Promise<void> {
    return request.delete(`/v0/management/auth-files?name=${encodeURIComponent(name)}`)
  },

  /**
   * Delete all authentication files
   */
  deleteAll(): Promise<void> {
    return request.delete('/v0/management/auth-files?all=true')
  },

  /**
   * Set authentication file status (enable/disable)
   */
  setStatus(name: string, disabled: boolean): Promise<void> {
    return request.patch('/v0/management/auth-files/status', {
      name,
      disabled
    })
  },

  /**
   * Get supported models for an authentication file
   */
  getModels(name: string): Promise<{ models: any[] }> {
    return request.get<{ models: any[] }>(`/v0/management/auth-files/models?name=${encodeURIComponent(name)}`)
  },

  /**
   * Batch set status
   */
  async batchSetStatus(names: string[], disabled: boolean): Promise<{ name: string; success: boolean; error?: string }[]> {
    const results = []
    for (const name of names) {
      try {
        await this.setStatus(name, disabled)
        results.push({ name, success: true })
      } catch (error: any) {
        results.push({ name, success: false, error: error.message })
      }
    }
    return results
  },

  /**
   * Batch delete
   */
  async batchDelete(names: string[]): Promise<{ name: string; success: boolean; error?: string }[]> {
    const results = []
    for (const name of names) {
      try {
        await this.delete(name)
        results.push({ name, success: true })
      } catch (error: any) {
        results.push({ name, success: false, error: error.message })
      }
    }
    return results
  }
}
