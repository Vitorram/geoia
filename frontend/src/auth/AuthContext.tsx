import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, authApi, type GeocodeResult, type LoginCredentials, type NearbyPlace, type PlaceCategory, type PublicUser } from '../lib/api'

interface AuthContextValue {
  user: PublicUser | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  searchLocations: (query: string) => Promise<GeocodeResult[]>
  searchNearby: (latitude: number, longitude: number, category: PlaceCategory, radius: number) => Promise<NearbyPlace[]>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [user, setUser] = useState<PublicUser | null>(null)

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokenResponse = await authApi.login(credentials)
    let authenticatedUser: PublicUser
    try {
      authenticatedUser = await authApi.me(tokenResponse.access_token)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new ApiError('Não foi possível validar sua sessão. Faça login novamente.', 401)
      }
      throw error
    }

    setAccessToken(tokenResponse.access_token)
    setUser(authenticatedUser)
  }, [])

  const logout = useCallback(() => {
    setAccessToken(null)
    setUser(null)
  }, [])

  const searchLocations = useCallback(async (query: string) => {
    if (!accessToken) throw new ApiError('Entre novamente para pesquisar locais.', 401)
    const response = await authApi.geocode(query, accessToken)
    return response.results
  }, [accessToken])

  const searchNearby = useCallback(async (latitude: number, longitude: number, category: PlaceCategory, radius: number) => {
    if (!accessToken) throw new ApiError('Entre novamente para buscar lugares.', 401)
    return (await authApi.nearby(latitude, longitude, category, radius, accessToken)).results
  }, [accessToken])

  const value = useMemo(
    () => ({ user: accessToken ? user : null, login, logout, searchLocations, searchNearby }),
    [accessToken, user, login, logout, searchLocations, searchNearby],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider.')
  }
  return context
}
