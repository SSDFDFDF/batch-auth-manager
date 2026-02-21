import { request } from '../lib/request'

export const configYamlApi = {
  async getConfigYaml(): Promise<string> {
    const response = await request.get<string>('/v0/management/config.yaml', {
      responseType: 'text'
    })
    return response as unknown as string
  },

  async saveConfigYaml(content: string): Promise<void> {
    await request.put('/v0/management/config.yaml', content, {
      headers: {
        'Content-Type': 'text/yaml'
      }
    })
  }
}
