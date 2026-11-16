import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../App'
import { AuthProvider } from './AuthContext'

const publicUser = {
  id: 'b723628a-c4cc-4fc7-9a67-269ca8b67f45',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function renderRoutes(initialEntry = '/login') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  )
}

function mockFetch(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const item of responses) fetchMock.mockResolvedValueOnce(item)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fluxo de autenticação do GeoIA', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('valida o formulário de login antes de chamar a API', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoutes()

    await user.type(screen.getByLabelText('E-mail'), 'email-invalido')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))

    expect(await screen.findByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('faz login válido, consulta /me e mantém o token somente em memória', async () => {
    const fetchMock = mockFetch(
      response(200, { access_token: 'access-token-test', token_type: 'bearer', expires_in: 900 }),
      response(200, publicUser),
    )
    const user = userEvent.setup()
    renderRoutes()

    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))

    expect(await screen.findByRole('heading', { name: /Olá, Ada/ })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/login')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/users/me')
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: { Authorization: 'Bearer access-token-test' },
    })
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('mostra erro de credenciais inválidas sem avançar', async () => {
    mockFetch(response(401, { detail: 'E-mail ou senha inválidos.' }))
    const user = userEvent.setup()
    renderRoutes()

    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-incorreta')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha não conferem.')
    expect(screen.queryByRole('heading', { name: /Olá, Ada/ })).not.toBeInTheDocument()
  })

  it('valida senha mínima e confirmação no cadastro', async () => {
    const fetchMock = mockFetch()
    const user = userEvent.setup()
    renderRoutes('/register')

    await user.type(screen.getByLabelText('Nome'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha', { selector: 'input' }), 'curta')
    await user.type(screen.getByLabelText('Confirmar senha'), 'diferente')
    await user.click(screen.getByRole('button', { name: /^criar conta$/i }))

    expect(await screen.findByText('Use pelo menos 12 caracteres.')).toBeInTheDocument()
    expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cadastra e direciona para login após HTTP 201', async () => {
    const fetchMock = mockFetch(response(201, publicUser))
    const user = userEvent.setup()
    renderRoutes('/register')

    await user.type(screen.getByLabelText('Nome'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha', { selector: 'input' }), 'senha-segura-123')
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-segura-123')
    await user.click(screen.getByRole('button', { name: /^criar conta$/i }))

    expect(await screen.findByText('Conta criada. Agora você já pode entrar.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/auth/register')
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha-segura-123' })
    expect(requestBody).not.toHaveProperty('confirmPassword')
  })

  it('mostra o conflito de e-mail duplicado sem detalhes internos', async () => {
    mockFetch(response(409, { detail: 'Este e-mail já está cadastrado.' }))
    const user = userEvent.setup()
    renderRoutes('/register')

    await user.type(screen.getByLabelText('Nome'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha', { selector: 'input' }), 'senha-segura-123')
    await user.type(screen.getByLabelText('Confirmar senha'), 'senha-segura-123')
    await user.click(screen.getByRole('button', { name: /^criar conta$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Este e-mail já está cadastrado.')
    expect(screen.queryByText('Conta criada. Agora você já pode entrar.')).not.toBeInTheDocument()
  })

  it('protege a página inicial quando não existe sessão em memória', async () => {
    renderRoutes('/app')

    expect(await screen.findByRole('heading', { name: /bom ter você/i })).toBeInTheDocument()
    expect(screen.queryByText('ada@example.com')).not.toBeInTheDocument()
  })

  it('faz logout e redireciona para login sem persistir token', async () => {
    mockFetch(
      response(200, { access_token: 'access-token-test', token_type: 'bearer', expires_in: 900 }),
      response(200, publicUser),
    )
    const user = userEvent.setup()
    renderRoutes()

    await user.type(screen.getByLabelText('E-mail'), 'ada@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))
    await screen.findByRole('heading', { name: /Olá, Ada/ })
    await user.click(screen.getByRole('button', { name: /sair/i }))

    expect(await screen.findByRole('heading', { name: /bom ter você/i })).toBeInTheDocument()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
