import { request } from '../lib/request'

export interface VertexImportResponse {
  status?: 'ok'
  project_id?: string
  projectId?: string
  email?: string
  location?: string
  'auth-file'?: string
  auth_file?: string
}

export const vertexApi = {
  async importCredential(file: File, location?: string): Promise<VertexImportResponse> {
    const formData = new FormData()
    formData.append('file', file)
    if (location) {
      formData.append('location', location)
    }
    const response = await request.postForm('/v0/management/vertex/import', formData)
    return response as VertexImportResponse
  }
}
