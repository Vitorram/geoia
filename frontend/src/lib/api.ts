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
  source?: string | null
  name: string | null
  category: PlaceCategory
  latitude: number
  longitude: number
  distance_m: number
  address: string | null
}

export interface NearbyPlacesResponse {
  results: NearbyPlace[]
  attribution?: string | null
}

export interface AISearchResult {
  interpretation: { intent: 'find_places' | 'clarify'; category: PlaceCategory | null; radius_m: number; needs_location: boolean }
  results: NearbyPlace[]
  message: string
  attribution?: string | null
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

interface SafeErrorMessages {
  allowedDetails?: ReadonlyMap<string, string>
  unauthorized?: string
  serverError?: string
}

const aiSearchErrorDetails = new Map<string, string>([
  [
    'O serviço de interpretação não está configurado ou está indisponível.',
    'O serviço de IA está indisponível no momento. Tente novamente mais tarde.',
  ],
  [
    'O provedor de interpretação excedeu o tempo limite.',
    'A interpretação pela IA demorou demais. Tente novamente.',
  ],
  [
    'O provedor retornou uma interpretação inválida.',
    'A IA não conseguiu interpretar a solicitação. Tente reformular.',
  ],
  [
    'O serviço de estabelecimentos está indisponível.',
    'O provedor de lugares está indisponível no momento. Tente novamente mais tarde.',
  ],
  [
    'A busca de estabelecimentos excedeu o tempo limite.',
    'A busca de lugares demorou demais. Tente novamente mais tarde.',
  ],
  [
    'A busca está temporariamente limitada.',
    'A busca de lugares está temporariamente limitada. Aguarde um pouco e tente novamente.',
  ],
  [
    'A base local de estabelecimentos ainda não foi importada.',
    'A base local de lugares ainda não está disponível.',
  ],
])

const aiSearchSafeErrors: SafeErrorMessages = {
  allowedDetails: aiSearchErrorDetails,
  unauthorized: 'Sua sessão expirou ou é inválida. Entre novamente para continuar.',
  serverError: 'Não foi possível concluir a busca por IA agora. Tente novamente.',
}

async function request<T>(path: string, init?: RequestInit, safeErrors?: SafeErrorMessages): Promise<T> {
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
    let allowlistedDetail: string | undefined
    if (safeErrors?.allowedDetails) {
      try {
        const errorBody: unknown = await response.json()
        if (
          typeof errorBody === 'object' &&
          errorBody !== null &&
          'detail' in errorBody &&
          typeof errorBody.detail === 'string'
        ) {
          allowlistedDetail = safeErrors.allowedDetails.get(errorBody.detail)
        }
      } catch {
        // Ignore malformed or non-JSON error bodies and use a safe fallback.
      }
    }

    const message = allowlistedDetail ?? (
      response.status === 401 && safeErrors?.unauthorized
        ? safeErrors.unauthorized
        : response.status === 409
          ? 'Este e-mail já está cadastrado.'
          : response.status === 422
            ? 'Confira os dados informados.'
            : response.status >= 500
              ? safeErrors?.serverError ?? 'O serviço está indisponível no momento. Tente novamente.'
              : response.status === 401
                ? 'E-mail ou senha não conferem.'
                : 'Não foi possível concluir a solicitação.'
    )
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
    return request<NearbyPlacesResponse>(`/v1/places/nearby?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  },

  aiSearch(message: string, location: { latitude: number; longitude: number } | null, accessToken: string) {
    return request<AISearchResult>('/v1/ai/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ message, location }),
    }, aiSearchSafeErrors)
  },
}
