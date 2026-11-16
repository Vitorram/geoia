import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LocationExplorer } from './LocationExplorer'
import { AuthProvider } from '../auth/AuthContext'
import { AppRoutes } from '../App'
import { LocationProvider } from '../locations/LocationContext'

const mapMocks = vi.hoisted(() => ({ flyTo: vi.fn(), flyToBounds: vi.fn() }))

vi.mock('react-leaflet', () => ({
  ZoomControl: () => null,
  ScaleControl: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  Marker: ({ position, icon, eventHandlers }: { position: [number, number]; icon?: { options: { className: string } }; eventHandlers?: { click?: () => void } }) => <div data-testid="marker" data-position={position.join(',')} data-icon-class={icon?.options.className} onClick={() => eventHandlers?.click?.()} />,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMap: () => mapMocks,
}))

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('Explorar localização', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    mapMocks.flyTo.mockClear()
    mapMocks.flyToBounds.mockClear()
  })

  it('exibe erro quando o usuário nega acesso ao GPS', async () => {
    const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError))
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } })
    render(<AuthProvider><LocationProvider><MemoryRouter><LocationExplorer /></MemoryRouter></LocationProvider></AuthProvider>)
    await userEvent.click(screen.getByRole('button', { name: /usar minha localização/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/permissão.*negada/i)
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('exibe a orientação para selecionar localização retornada pela busca com IA', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(response(200, { access_token: 'test-token', token_type: 'bearer', expires_in: 900 }))
    fetchMock.mockResolvedValueOnce(response(200, {
      id: 'user-id', name: 'Geo User', email: 'geo@example.com', is_active: true, created_at: '', updated_at: '',
    }))
    fetchMock.mockResolvedValueOnce(response(200, {
      interpretation: { intent: 'find_places', category: 'farmácia', radius_m: 2000, needs_location: true },
      results: [],
      message: 'Selecione uma localização ou autorize o uso da sua posição para buscar lugares próximos.',
    }))

    render(<AuthProvider><MemoryRouter initialEntries={['/login']}><AppRoutes /></MemoryRouter></AuthProvider>)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'geo@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))
    await user.click((await screen.findAllByRole('link', { name: /explorar localização/i }))[0])
    await user.type(await screen.findByLabelText('Descreva o que procura'), 'farmácia em até 2 km')
    await user.click(screen.getByRole('button', { name: /interpretar e buscar/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Selecione uma localização ou autorize o uso da sua posição para buscar lugares próximos.',
    )
    const aiRequest = fetchMock.mock.calls.find(([url]) => String(url) === '/api/v1/ai/search')
    expect(aiRequest).toBeDefined()
    expect(JSON.parse(aiRequest?.[1]?.body as string)).toMatchObject({ location: null })
  })

  it('seleciona categoria, mostra estabelecimentos reais retornados e destaca o marcador escolhido', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async input => String(input).includes('category=restaurante')
      ? response(200, { results: [{ osm_id: 'node/456', name: 'Restaurante do Centro', category: 'restaurante', latitude: -23.621, longitude: -45.414, distance_m: 280, address: 'Rua Central, 20' }] })
      : response(200, { results: [] }))
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
    await user.click(screen.getByRole('button', { name: 'Cafeteria' }))
    await user.click(screen.getByRole('button', { name: /buscar lugares/i }))
    await user.click(await screen.findByRole('button', { name: /café central/i }))
    expect(await screen.findByTestId('map')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Resultados de estabelecimentos' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /selecionar.*no mapa/i })).toHaveLength(1)
    expect(screen.getAllByText('520 m')).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: /sem foto verificada/i })).toHaveLength(2)
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
    expect(screen.getAllByTestId('marker')[0]).toHaveAttribute('data-position', '-23.6203,-45.4132')
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-position', '-23.735,-45.42')
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-icon-class', 'nearby-marker nearby-marker-active')
    expect(mapMocks.flyTo).toHaveBeenCalledWith([-23.735, -45.42], 16, expect.any(Object))
    const previousBoundsCalls = mapMocks.flyToBounds.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Enquadrar todos os locais' }))
    await waitFor(() => expect(mapMocks.flyToBounds.mock.calls.length).toBeGreaterThan(previousBoundsCalls))
    await user.click(screen.getByRole('button', { name: 'Voltar à localização de referência' }))
    await waitFor(() => expect(mapMocks.flyTo).toHaveBeenCalledWith([-23.6203, -45.4132], 14, expect.any(Object)))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('category=cafeteria'))).toBe(true)
    expect(screen.getByText('Caraguatatuba, SP, Brasil')).toBeInTheDocument()
    await user.click(screen.getAllByRole('link', { name: 'Início' })[0])
    expect(await screen.findByRole('heading', { name: /Descubra por perto/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Restaurantes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Farmácias' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Supermercados' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Caraguatatuba/i })).toBeInTheDocument()
    await user.click(await screen.findByRole('link', { name: /Restaurante do Centro/i }))
    expect(await screen.findByTestId('map')).toBeInTheDocument()
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-icon-class', 'nearby-marker nearby-marker-active')
  })

  it('abre galeria apenas para fotos verificadas e sincroniza card e marcador', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(response(200, { access_token: 'test-token', token_type: 'bearer', expires_in: 900 }))
    fetchMock.mockResolvedValueOnce(response(200, { id: 'user-id', name: 'Geo User', email: 'geo@example.com', is_active: true, created_at: '', updated_at: '' }))
    fetchMock.mockResolvedValueOnce(response(200, { results: [{ name: 'MASP', formatted_address: 'MASP Sao Paulo', latitude: -23.5614, longitude: -46.6559 }] }))
    fetchMock.mockResolvedValueOnce(response(200, { results: [
      { osm_id: 'node/789', name: 'Pizzaria da Praca', category: 'pizzaria', latitude: -23.56, longitude: -46.65, distance_m: 450, address: 'Rua Central, 1', photos: [
        { url: 'https://business.example.test/photo-1.jpg', alt: 'Fachada verificada', attribution: 'Estabelecimento', source: 'official_business', verified: true },
        { url: 'https://commons.example.test/photo-2.jpg', alt: 'Imagem licenciada', attribution: 'Pessoa autora', license: 'CC BY-SA 4.0', source: 'wikimedia_commons', verified: true },
        { url: 'https://example.test/unverified.jpg', attribution: 'Sem verificacao', source: 'official_business', verified: false },
      ] },
      { osm_id: 'node/790', name: 'Pizzaria sem fotos', category: 'pizzaria', latitude: -23.562, longitude: -46.652, distance_m: 610, address: null },
    ] }))

    render(<AuthProvider><MemoryRouter initialEntries={['/login']}><AppRoutes /></MemoryRouter></AuthProvider>)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('E-mail'), 'geo@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: /entrar na plataforma/i }))
    await user.click((await screen.findAllByRole('link', { name: /explorar localiza/i }))[0])
    await user.type(screen.getAllByRole('textbox')[0], 'MASP')
    await user.click(screen.getByRole('button', { name: /pesquisar/i }))
    await user.click(await screen.findByRole('button', { name: /MASP Sao Paulo/i }))
    await user.click(screen.getByRole('button', { name: /buscar lugares/i }))

    const markers = await screen.findAllByTestId('marker')
    await user.click(markers[1])
    const firstCard = screen.getByRole('button', { name: 'Selecionar Pizzaria da Praca no mapa' })
    expect(firstCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('marker')[1]).toHaveAttribute('data-icon-class', 'nearby-marker nearby-marker-active')
    const details = screen.getByRole('region', { name: 'Detalhes de Pizzaria da Praca' })
    const gallery = within(details).getByRole('group', { name: 'Galeria de fotos de Pizzaria da Praca' })
    expect(within(gallery).getAllByRole('button')).toHaveLength(2)
    const secondPhoto = within(gallery).getByRole('button', { name: 'Mostrar foto 2 de Pizzaria da Praca' })
    await user.click(secondPhoto)
    expect(secondPhoto).toHaveAttribute('aria-pressed', 'true')
    expect(within(secondPhoto).getByRole('img')).toHaveAttribute('src', 'https://commons.example.test/photo-2.jpg')
    expect(within(details).getAllByText(/CC BY-SA 4.0/)).toHaveLength(2)

    const secondCard = screen.getByRole('button', { name: 'Selecionar Pizzaria sem fotos no mapa' })
    await user.click(screen.getAllByRole('button', { name: /ver no mapa/i })[1])
    expect(secondCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByTestId('marker')[2]).toHaveAttribute('data-icon-class', 'nearby-marker nearby-marker-active')
    expect(screen.getAllByRole('img', { name: /sem foto verificada.*pizzaria/i })).toHaveLength(2)

    const brokenImage = screen.getAllByRole('img', { name: 'Fachada verificada' })[0]
    fireEvent.error(brokenImage)
    expect(await screen.findAllByRole('img', { name: /sem foto verificada.*pizzaria/i })).toHaveLength(3)
  })
})
