import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LocationExplorer } from './LocationExplorer'
import { AuthProvider } from '../auth/AuthContext'
import { AppRoutes } from '../App'

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  Marker: ({ position, icon }: { position: [number, number]; icon?: { options: { className: string } } }) => <div data-testid="marker" data-position={position.join(',')} data-icon-class={icon?.options.className} />,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn() }),
}))

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('Explorar localização', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

  it('exibe erro quando o usuário nega acesso ao GPS', async () => {
    const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError))
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
    render(<AuthProvider><LocationExplorer /></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /usar minha localização/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permissão.*negada/i)
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('seleciona categoria, mostra estabelecimentos reais retornados e destaca o marcador escolhido', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(response(200, { access_token: 'test-token', token_type: 'bearer', expires_in: 900 }))
    fetchMock.mockResolvedValueOnce(response(200, { id: 'user-id', name: 'Geo User', email: 'geo@example.com', is_active: true, created_at: '', updated_at: '' }))
    fetchMock.mockResolvedValueOnce(response(200, { results: [{ name: 'Caraguatatuba', formatted_address: 'Caraguatatuba, SP, Brasil', latitude: -23.6203, longitude: -45.4132 }] }))
    fetchMock.mockResolvedValueOnce(response(200, { results: [{ osm_id: 'node/123', name: 'Café Central', category: 'cafeteria', latitude: -23.735, longitude: -45.42, distance_m: 520, address: 'Rua Exemplo, 10' }] }))

    render(<AuthProvider><MemoryRouter initialEntries={['/login']}><AppRoutes /></MemoryRouter></AuthProvider>)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'geo@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))
    await user.click((await screen.findAllByRole('link', { name: /explorar localização/i }))[0])
    await user.type(await screen.findByLabelText('Endereço, hotel ou ponto de referência'), 'Caraguatatuba')
    await user.click(screen.getByRole('button', { name: /pesquisar/i }))
    await user.click(await screen.findByRole('button', { name: /Caraguatatuba, SP, Brasil/i }))
    await user.selectOptions(screen.getByLabelText('Categoria'), 'cafeteria')
    await user.click(screen.getByRole('button', { name: /buscar lugares/i }))
    await user.click(await screen.findByRole('button', { name: /café central/i }))
    expect(await screen.findByTestId('map')).toBeInTheDocument()
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
    expect(screen.getAllByTestId('marker')[0]).toHaveAttribute('data-position', '-23.6203,-45.4132')
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-position', '-23.735,-45.42')
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-icon-class', 'nearby-marker nearby-marker-active')
    expect(fetchMock.mock.calls[3][0]).toContain('category=cafeteria')
    expect(screen.getByText('Caraguatatuba, SP, Brasil')).toBeInTheDocument()
  })
})
