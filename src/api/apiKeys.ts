import { request } from '../lib/request'

export const apiKeysApi = {
  async list(): Promise<string[]> {
    const data = await request.get('/v0/management/api-keys')
    const keys = data?.['api-keys'] ?? data?.apiKeys ?? data
    return Array.isArray(keys) ? keys.map((k: any) => String(k)) : []
  },

  replace(keys: string[]): Promise<void> {
    return request.put('/v0/management/api-keys', keys)
  },

  update(index: number, value: string): Promise<void> {
    return request.patch('/v0/management/api-keys', { index, value })
  },

  delete(index: number): Promise<void> {
    return request.delete(`/v0/management/api-keys?index=${index}`)
  }
}
