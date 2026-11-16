export interface PublicUser {
  id: string
  name: string
  email: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface GeocodeResult {
  name: string
  formatted_address: string
  latitude: number
  longitude: number
}

export type PlaceCategory = 'pizzaria' | 'restaurante' | 'cafeteria' | 'farmácia' | 'supermercado'

export interface NearbyPlace {
  osm_id: string
  name: string | null
  category: PlaceCategory
  latitude: number
  longitude: number
  distance_m: number
  address: string | null
}

interface LoginResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError('Não foi possível conectar à API. Tente novamente.', 0)
  }

  if (!response.ok) {
    const message =
      response.status === 401
        ? 'E-mail ou senha não conferem.'
        : response.status === 409
          ? 'Este e-mail já está cadastrado.'
          : response.status === 422
            ? 'Confira os dados informados.'
            : response.status >= 500
              ? 'O serviço está indisponível no momento. Tente novamente.'
              : 'Não foi possível concluir a solicitação.'
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

export const authApi = {
  login(credentials: LoginCredentials) {
    return request<LoginResponse>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  },

  register(payload: RegisterPayload) {
    return request<PublicUser>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  me(accessToken: string) {
    return request<PublicUser>('/v1/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  },

  geocode(query: string, accessToken: string) {
    const params = new URLSearchParams({ q: query })
    return request<{ results: GeocodeResult[] }>(`/v1/locations/geocode?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  },

  nearby(latitude: number, longitude: number, category: PlaceCategory, radius_m: number, accessToken: string) {
    const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), category, radius_m: String(radius_m) })
    return request<{ results: NearbyPlace[] }>(`/v1/places/nearby?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  },
}
