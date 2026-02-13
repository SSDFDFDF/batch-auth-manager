import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'

type UnauthorizedHandler = () => void

class RequestClient {
  private client: AxiosInstance | null = null
  private baseURL: string = ''
  private managementKey: string = ''
  private onUnauthorized: UnauthorizedHandler | null = null

  setUnauthorizedHandler(handler: UnauthorizedHandler) {
    this.onUnauthorized = handler
  }

  initialize(baseURL: string, managementKey: string) {
    this.baseURL = baseURL.replace(/\/$/, '')
    this.managementKey = managementKey

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    })

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.managementKey) {
          config.headers.Authorization = `Bearer ${this.managementKey}`
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401 && this.onUnauthorized) {
          this.onUnauthorized()
        }
        const message = error.response?.data?.error || error.message || 'Request failed'
        return Promise.reject(new Error(message))
      }
    )
  }

  private getClient(): AxiosInstance {
    if (!this.client) {
      throw new Error('API client not initialized. Please connect first.')
    }
    return this.client
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().get(url, config) as Promise<T>
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().post(url, data, config) as Promise<T>
  }

  async postForm<T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().post(url, formData, {
      ...config,
      headers: {
        ...(config?.headers || {}),
        'Content-Type': 'multipart/form-data'
      }
    }) as Promise<T>
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().put(url, data, config) as Promise<T>
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().patch(url, data, config) as Promise<T>
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.getClient().delete(url, config) as Promise<T>
  }
}

export const request = new RequestClient()
