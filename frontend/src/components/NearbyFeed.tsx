import { useEffect, useState } from 'react'
import { ChevronRight, LocateFixed, LoaderCircle, MapPin, MapPinned } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useSelectedLocation } from '../locations/LocationContext'
import type { NearbyPlace, PlaceCategory } from '../lib/api'

const categories: { category: PlaceCategory; title: string; icon: string }[] = [
  { category: 'restaurante', title: 'Restaurantes', icon: '🍽' },
  { category: 'farmácia', title: 'Farmácias', icon: '＋' },
  { category: 'supermercado', title: 'Supermercados', icon: '▤' },
]

interface FeedRow {
  category: PlaceCategory
  title: string
  icon: string
  places: NearbyPlace[]
  attribution: string | null
  loading: boolean
  error: string
}

function distanceLabel(meters: number) {
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`
}

function gpsMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'A permissão de localização foi negada. Você pode escolher um endereço manualmente.'
  if (error.code === error.TIMEOUT) return 'A localização demorou demais. Tente novamente.'
  return 'Não foi possível obter a localização deste dispositivo.'
}

export function NearbyFeed() {
  const { searchNearby } = useAuth()
  const { selectedLocation, setSelectedLocation } = useSelectedLocation()
  const [rows, setRows] = useState<FeedRow[]>([])
  const [locationError, setLocationError] = useState('')
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!selectedLocation) { setRows([]); return }
    let current = true
    setRows(categories.map(({ category, title, icon }) => ({ category, title, icon, places: [], attribution: null, loading: true, error: '' })))
    const load = async () => {
      // Consultas limitadas, sequenciais e somente após o usuário escolher uma localização.
      for (const { category, title } of categories) {
        try {
          const response = await searchNearby(selectedLocation.latitude, selectedLocation.longitude, category, 3000)
          if (current) setRows(previous => previous.map(row => row.category === category ? { ...row, places: response.results, attribution: response.attribution ?? null, loading: false } : row))
        } catch (cause) {
          if (current) setRows(previous => previous.map(row => row.category === category ? { ...row, loading: false, error: cause instanceof Error ? cause.message : `Não foi possível carregar ${title.toLowerCase()}.` } : row))
        }
      }
    }
    void load()
    return () => { current = false }
  }, [selectedLocation?.latitude, selectedLocation?.longitude, searchNearby])

  const useDeviceLocation = () => {
    setLocationError('')
    if (!navigator.geolocation) { setLocationError('Este navegador não oferece geolocalização.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const { latitude, longitude } = coords
      setLocating(false)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        setLocationError('O dispositivo retornou coordenadas inválidas.'); return
      }
      setSelectedLocation({ name: 'Minha localização', formatted_address: '', latitude, longitude, source: 'device' })
    }, error => {
      setLocating(false)
      setLocationError(gpsMessage(error))
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 })
  }

  if (!selectedLocation) return <section className="feed-location-empty" aria-labelledby="feed-title">
    <div className="feed-empty-icon"><MapPinned size={23}/></div>
    <p className="feed-eyebrow">SEU GUIA LOCAL</p>
    <h2 id="feed-title">Descubra o que tem por perto.</h2>
    <p className="feed-empty-copy">Escolha uma localização para montar um feed de lugares reais ao seu redor.</p>
    <div className="feed-empty-actions">
      <button className="button-primary" type="button" onClick={useDeviceLocation} disabled={locating}>{locating ? <LoaderCircle size={17} className="animate-spin"/> : <LocateFixed size={17}/>}Usar minha localização</button>
      <Link className="feed-choose-location" to="/app/locations"><MapPin size={16}/>Escolher endereço</Link>
    </div>
    {locationError && <p role="alert" className="form-alert feed-location-error">{locationError}</p>}
  </section>

  return <section className="nearby-feed" aria-labelledby="feed-title">
    <header className="feed-header">
      <div><p className="feed-eyebrow">SEU GUIA LOCAL</p><h2 id="feed-title">Descubra por perto<span aria-hidden="true">.</span></h2><p className="feed-subtitle">Lugares mapeados ao redor da sua localização.</p></div>
      <Link className="feed-location-pill" to="/app/locations" title="Alterar localização"><MapPin size={15}/><span>{selectedLocation.name}</span><ChevronRight size={15}/></Link>
    </header>

    <div className="feed-rows">{rows.map(row => <section className="feed-row" key={row.category} aria-labelledby={`feed-${row.category}`}>
      <div className="feed-row-heading"><div className="feed-row-title"><span className="feed-category-icon" aria-hidden="true">{row.icon}</span><div><h2 id={`feed-${row.category}`}>{row.title}</h2><p>{row.loading ? 'Procurando perto de você…' : row.error ? 'Não foi possível atualizar agora' : `${row.places.length} ${row.places.length === 1 ? 'lugar encontrado' : 'lugares encontrados'} · até 3 km`}</p></div></div><Link to="/app/locations" className="feed-see-all" aria-label={`Explorar todos: ${row.title}`}>Ver mapa <ChevronRight size={16}/></Link></div>
      <div className="feed-carousel" aria-label={row.title}>
        {row.loading && Array.from({ length: 3 }, (_, index) => <div className="feed-place-skeleton" key={index} aria-hidden="true" />)}
        {!row.loading && row.error && <p className="feed-row-message" role="status">{row.error}</p>}
        {!row.loading && !row.error && !row.places.length && <p className="feed-row-message">Nenhum lugar encontrado nesta categoria por enquanto.</p>}
        {!row.loading && !row.error && row.places.map(place => <Link key={place.osm_id} to="/app/locations" state={{ focusPlace: place, focusAttribution: row.attribution }} className="feed-place-card">
          <span className="feed-place-art" aria-hidden="true"><span className="feed-place-marker"><MapPin size={18}/></span><span className="feed-place-distance">{distanceLabel(place.distance_m)}</span></span>
          <span className="feed-place-info"><strong>{place.name || 'Estabelecimento sem nome'}</strong><small>{row.title.slice(0, -1)}{place.address ? ` · ${place.address}` : ''}</small></span>
        </Link>)}
      </div>
    </section>)}</div>
    {rows.some(row => row.attribution) ? <p className="feed-attribution">Dados de lugares: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p> : <p className="feed-attribution">Resultados de estabelecimentos reais do OpenStreetMap, conforme os dados disponíveis para esta região.</p>}
  </section>
}
