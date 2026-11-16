import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, authApi } from './api'

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const aiFailures = [
  [503, 'O serviço de interpretação não está configurado ou está indisponível.', 'O serviço de IA está indisponível no momento. Tente novamente mais tarde.'],
  [504, 'O provedor de interpretação excedeu o tempo limite.', 'A interpretação pela IA demorou demais. Tente novamente.'],
  [502, 'O provedor retornou uma interpretação inválida.', 'A IA não conseguiu interpretar a solicitação. Tente reformular.'],
  [503, 'O serviço de estabelecimentos está indisponível.', 'O provedor de lugares está indisponível no momento. Tente novamente mais tarde.'],
  [504, 'A busca de estabelecimentos excedeu o tempo limite.', 'A busca de lugares demorou demais. Tente novamente mais tarde.'],
  [503, 'A busca está temporariamente limitada.', 'A busca de lugares está temporariamente limitada. Aguarde um pouco e tente novamente.'],
  [503, 'A base local de estabelecimentos ainda não foi importada.', 'A base local de lugares ainda não está disponível.'],
] as const

describe('authApi.aiSearch error messages', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

  it.each(aiFailures)('maps allowlisted detail for HTTP %i', async (status, detail, expected) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(status, { detail }))

    await expect(authApi.aiSearch('farmácia a 2 km', null, 'test-token'))
      .rejects.toMatchObject({ name: 'ApiError', status, message: expected })
  })

  it('uses a generic safe message for unknown or sensitive details', async () => {
    const secretLikeDetail = 'Internal host http://private.local and traceback with credential xyz'
    vi.mocked(fetch).mockResolvedValueOnce(response(504, { detail: secretLikeDetail }))

    const error = await authApi.aiSearch('pizza', null, 'test-token').catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 504,
      message: 'Não foi possível concluir a busca por IA agora. Tente novamente.',
    })
    expect((error as Error).message).not.toContain(secretLikeDetail)
  })

  it('uses a session message for authentication errors without exposing detail', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(401, { detail: 'JWT value or internal detail' }))

    await expect(authApi.aiSearch('pizza', null, 'test-token'))
      .rejects.toMatchObject({
        name: 'ApiError',
        status: 401,
        message: 'Sua sessão expirou ou é inválida. Entre novamente para continuar.',
      })
  })

  it('keeps the existing generic handling for other API calls', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(503, { detail: aiFailures[0][1] }))

    await expect(authApi.login({ email: 'user@example.com', password: 'unused-test-password' }))
      .rejects.toMatchObject({
        name: 'ApiError',
        status: 503,
        message: 'O serviço está indisponível no momento. Tente novamente.',
      })
  })
})
