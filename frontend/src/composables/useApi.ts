import axios from 'axios'

/**
 * Axios instance for our backend API (auth, profiles, proxy).
 * Automatically attaches JWT token from localStorage.
 */
export const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cs_access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401 → try refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const refreshToken = localStorage.getItem('cs_refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/auth/refresh', {
            refresh_token: refreshToken,
          })
          localStorage.setItem('cs_access_token', data.access_token)
          localStorage.setItem('cs_refresh_token', data.refresh_token)
          original.headers.Authorization = `Bearer ${data.access_token}`
          return api(original)
        } catch {
          localStorage.removeItem('cs_access_token')
          localStorage.removeItem('cs_refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

/**
 * ChirpStack API client that goes through our proxy.
 * All calls are: /api/proxy/{serverUrl}/{chirpstackEndpoint}
 */
export function useChirpstack(serverUrl: string, apiToken: string) {
  async function request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string | number>,
    body?: unknown
  ): Promise<T> {
    const url = `/api/proxy/${serverUrl}${endpoint}`
    const response = await api.request<T>({
      method,
      url,
      params,
      data: body,
      headers: {
        'Grpc-Metadata-Authorization': `Bearer ${apiToken}`,
      },
    })
    return response.data
  }

  return {
    get: <T>(endpoint: string, params?: Record<string, string | number>) =>
      request<T>('GET', endpoint, params),

    post: <T>(endpoint: string, body: unknown) =>
      request<T>('POST', endpoint, undefined, body),

    put: <T>(endpoint: string, body: unknown) =>
      request<T>('PUT', endpoint, undefined, body),

    del: <T>(endpoint: string) => request<T>('DELETE', endpoint),
  }
}

/**
 * Parse ChirpStack API errors into user-friendly French messages.
 */
export function parseApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data

    if (status === 401) return 'Erreur d\'authentification (token invalide ou expire)'
    if (status === 403) return 'Acces refuse (permissions insuffisantes)'
    if (status === 429) return 'Trop de requetes, veuillez patienter'
    if (status === 404) return 'Ressource non trouvee'

    if (data?.message) {
      const msg = data.message as string
      if (msg.includes('already exists') || msg.includes('name')) {
        return 'Un device avec ce nom existe deja'
      }
      if (msg.includes('found 0') && msg.includes('length 32')) {
        return 'Device Profile non selectionne ou invalide'
      }
      return msg.length > 200 ? msg.substring(0, 200) + '...' : msg
    }

    if (!error.response) return 'Erreur reseau: serveur inaccessible'
  }
  return String(error)
}
