import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MapContainer, Marker, Popup, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import { LoaderCircle, MapPin, Search, LocateFixed, Store, Sparkles, Pizza, Utensils, Coffee, Pill, ShoppingBasket, MapPinned, Maximize2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { GeocodeResult, NearbyPlace, PlaceCategory } from '../lib/api'
import { useSelectedLocation } from '../locations/LocationContext'
import { useLocation } from 'react-router-dom'

import 'leaflet/dist/leaflet.css'

function formatDistance(distance: number) {
  return distance < 1000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`
}

type MapCameraMode = 'reference' | 'results' | 'place'
interface MapCameraActions {
  fitResults: () => void
  focusReference: () => void
}

function MapCamera({ selected, places, activePlace, mode, onReady }: {
  selected: { latitude: number; longitude: number }
  places: NearbyPlace[]
  activePlace?: NearbyPlace
  mode: MapCameraMode
  onReady: (actions: MapCameraActions) => void
}) {
  const map = useMap()
  const fitResults = useCallback(() => {
    if (!places.length) {
      map.flyTo([selected.latitude, selected.longitude], 14, { animate: true, duration: 0.65 })
      return
    }
    const points: [number, number][] = [
      [selected.latitude, selected.longitude],
      ...places.map(place => [place.latitude, place.longitude] as [number, number]),
    ]
    map.flyToBounds(L.latLngBounds(points), { padding: [52, 52], maxZoom: 15, animate: true, duration: 0.7 })
  }, [map, selected.latitude, selected.longitude, places])
  const focusReference = useCallback(() => {
    map.flyTo([selected.latitude, selected.longitude], 14, { animate: true, duration: 0.65 })
  }, [map, selected.latitude, selected.longitude])

  useEffect(() => onReady({ fitResults, focusReference }), [onReady, fitResults, focusReference])
  useEffect(() => {
    if (mode === 'place' && activePlace) {
      map.flyTo([activePlace.latitude, activePlace.longitude], 16, { animate: true, duration: 0.65 })
      return
    }
    if (mode === 'reference' || places.length === 0) {
      focusReference()
      return
    }
    fitResults()
  }, [map, focusReference, fitResults, places.length, mode, activePlace?.osm_id])
  return null
}

const referenceIcon = L.divIcon({
  className: 'reference-location-marker',
  html: '<span class="reference-marker-halo"></span><span class="reference-marker-core"></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
})

const categories: { value: PlaceCategory; label: string }[] = [
  { value: 'pizzaria', label: 'Pizzaria' }, { value: 'restaurante', label: 'Restaurante' },
  { value: 'cafeteria', label: 'Cafeteria' }, { value: 'farmácia', label: 'Farmácia' },
  { value: 'supermercado', label: 'Supermercado' },
]

type VerifiedPhotoSource = 'official_business' | 'wikimedia_commons' | 'google_places'

interface VerifiedPlacePhoto {
  url: string
  alt?: string
  attribution: string
  license?: string
  source: VerifiedPhotoSource
  verified: true
}

function categoryLabel(category: PlaceCategory) {
  return categories.find(item => item.value === category)?.label ?? 'Estabelecimento'
}

function verifiedPhotos(place: NearbyPlace): VerifiedPlacePhoto[] {
  const rawPhotos = (place as NearbyPlace & { photos?: unknown }).photos
  if (!Array.isArray(rawPhotos)) return []

  return rawPhotos.filter((photo): photo is VerifiedPlacePhoto => {
    if (!photo || typeof photo !== 'object') return false
    const candidate = photo as Partial<VerifiedPlacePhoto>
    if (candidate.verified !== true || typeof candidate.url !== 'string' || typeof candidate.attribution !== 'string' || !candidate.attribution.trim()) return false
    if (!['official_business', 'wikimedia_commons', 'google_places'].includes(candidate.source ?? '')) return false
    if (candidate.source === 'wikimedia_commons' && (typeof candidate.license !== 'string' || !candidate.license.trim())) return false
    try {
      const url = new URL(candidate.url)
      if (url.protocol !== 'https:' || url.username || url.password) return false
      if ([...url.searchParams.keys()].some(key => /^(key|token|signature|auth)$/i.test(key))) return false
    } catch { return false }
    return true
  })
}

function CategorySymbol({ category, size = 22 }: { category: PlaceCategory; size?: number }) {
  const props = { size, strokeWidth: 1.7, 'aria-hidden': true as const }
  if (category === 'pizzaria') return <Pizza {...props}/>
  if (category === 'restaurante') return <Utensils {...props}/>
  if (category === 'cafeteria') return <Coffee {...props}/>
  if (category === 'farmácia') return <Pill {...props}/>
  if (category === 'supermercado') return <ShoppingBasket {...props}/>
  return <Store {...props}/>
}

function PlaceMedia({ photo, category, alt, size = 'compact' }: {
  photo?: VerifiedPlacePhoto
  category: PlaceCategory
  alt: string
  size?: 'compact' | 'large' | 'thumb'
}) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [photo?.url])

  if (!photo || broken) return <div className={`place-media place-media--${size} place-media-placeholder`} role="img" aria-label={`Sem foto verificada · ${categoryLabel(category)}`}>
    <span className="place-placeholder-orbit" aria-hidden="true"/>
    <span className="place-placeholder-icon"><CategorySymbol category={category} size={size === 'large' ? 32 : 23}/></span>
    <span className="place-placeholder-label">Foto indisponível</span>
  </div>

  return <div className={`place-media place-media--${size}`}>
    <img src={photo.url} alt={photo.alt?.trim() || alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" width={720} height={480} onError={() => setBroken(true)}/>
    {size !== 'thumb' && <span className="place-photo-credit" title={`${photo.attribution}${photo.license ? ` · ${photo.license}` : ''}`}>Foto: {photo.attribution}{photo.license ? ` · ${photo.license}` : ''}</span>}
  </div>
}

function PlaceDetails({ place }: { place: NearbyPlace }) {
  const photos = verifiedPhotos(place)
  const [activePhoto, setActivePhoto] = useState(0)
  useEffect(() => setActivePhoto(0), [place.osm_id])
  const title = place.name || 'Estabelecimento sem nome'
  const currentPhoto = photos[activePhoto]

  return <section className="place-detail-panel" aria-label={`Detalhes de ${title}`}>
    <div className="place-detail-heading">
      <div><p className="place-detail-eyebrow">Lugar selecionado</p><h4>{title}</h4></div>
      <span className="place-detail-distance">{formatDistance(place.distance_m)}</span>
    </div>
    <PlaceMedia photo={currentPhoto} category={place.category} alt={`Foto de ${title}`} size="large"/>
    <div className="place-detail-meta">
      <span>{categoryLabel(place.category)}</span>
      {place.address && <span>{place.address}</span>}
      {currentPhoto && <span>Crédito: {currentPhoto.attribution}{currentPhoto.license ? ` · ${currentPhoto.license}` : ''}</span>}
    </div>
    {photos.length > 1 && <div className="place-gallery-strip" role="group" aria-label={`Galeria de fotos de ${title}`}>
      {photos.map((photo, index) => <button key={`${photo.url}-${index}`} type="button" className={`place-gallery-thumb${activePhoto === index ? ' place-gallery-thumb-active' : ''}`} aria-label={`Mostrar foto ${index + 1} de ${title}`} aria-pressed={activePhoto === index} onClick={() => setActivePhoto(index)}>
        <PlaceMedia photo={photo} category={place.category} alt={photo.alt?.trim() || `Foto ${index + 1} de ${title}`} size="thumb"/>
      </button>)}
    </div>}
  </section>
}

const placeIcon = (active: boolean) => L.divIcon({
  className: `nearby-marker${active ? ' nearby-marker-active' : ''}`,
  html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11],
})

function gpsError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Permissão de localização negada. Você pode habilitá-la nas configurações do navegador.'
  if (error.code === error.TIMEOUT) return 'A localização demorou demais. Tente novamente.'
  return 'Não foi possível obter sua localização neste dispositivo.'
}

export function LocationExplorer() {
  const { searchLocations, searchNearby, aiSearch } = useAuth()
  const { selectedLocation: selected, setSelectedLocation: setSelected } = useSelectedLocation()
  const route = useLocation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<PlaceCategory>('pizzaria')
  const [radius, setRadius] = useState(3000)
  const [places, setPlaces] = useState<NearbyPlace[]>([])
  const [placesAttribution, setPlacesAttribution] = useState<string | null>(null)
  const [placesError, setPlacesError] = useState('')
  const [placesLoading, setPlacesLoading] = useState(false)
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null)
  const [mapCameraMode, setMapCameraMode] = useState<MapCameraMode>('reference')
  const [mapActions, setMapActions] = useState<MapCameraActions | null>(null)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiMessage, setAiMessage] = useState('')

  const mapPlaces = places
  const activePlace = mapPlaces.find(place => place.osm_id === activePlaceId)
  const handleMapReady = useCallback((actions: MapCameraActions) => setMapActions(actions), [])
  const selectPlaceOnMap = (placeId: string) => {
    setActivePlaceId(placeId)
    setMapCameraMode('place')
  }
  const showAllMapResults = () => {
    setActivePlaceId(null)
    setMapCameraMode(places.length ? 'results' : 'reference')
    mapActions?.fitResults()
  }
  const focusReferenceOnMap = () => {
    setActivePlaceId(null)
    setMapCameraMode('reference')
    mapActions?.focusReference()
  }

  useEffect(() => {
    const routeState = route.state as { focusPlace?: NearbyPlace; focusAttribution?: string | null } | null
    const focusPlace = routeState?.focusPlace
    if (!focusPlace || !focusPlace.osm_id || !Number.isFinite(focusPlace.latitude) || !Number.isFinite(focusPlace.longitude)) return
    if (Math.abs(focusPlace.latitude) > 90 || Math.abs(focusPlace.longitude) > 180) return
    setPlaces([focusPlace])
    setPlacesAttribution(routeState?.focusAttribution ?? null)
    setActivePlaceId(focusPlace.osm_id)
    setMapCameraMode('place')
  }, [route.state])

  const runAiSearch = async (event: FormEvent) => {
    event.preventDefault(); setAiError(''); setAiMessage('')
    if (!aiPrompt.trim()) { setAiError('Escreva o que deseja encontrar.'); return }
    setAiLoading(true)
    try {
      const response = await aiSearch(aiPrompt.trim(), selected ? { latitude: selected.latitude, longitude: selected.longitude } : null)
      setAiMessage(response.message)
      setPlaces(response.results); setActivePlaceId(null)
      setMapCameraMode(response.results.length ? 'results' : 'reference')
      setPlacesAttribution(response.attribution ?? null)
      if (response.interpretation.category) setCategory(response.interpretation.category)
      setRadius(response.interpretation.radius_m)
    } catch (cause) { setAiError(cause instanceof Error ? cause.message : 'Não foi possível interpretar a busca.') }
    finally { setAiLoading(false) }
  }

  const search = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setResults([])
    if (query.trim().length < 3) { setError('Digite pelo menos 3 caracteres para pesquisar.'); return }
    setLoading(true)
    try {
      const found = await searchLocations(query.trim())
      setResults(found)
      if (!found.length) setError('Nenhum local encontrado. Tente outro endereço ou referência.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível pesquisar o local.')
    } finally { setLoading(false) }
  }

  const useDeviceLocation = () => {
    setError('')
    if (!navigator.geolocation) { setError('Este navegador não oferece geolocalização.'); return }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude } = coords
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
          setError('O dispositivo retornou coordenadas inválidas.'); return
        }
        setSelected({ name: 'Minha localização', formatted_address: '', latitude, longitude, source: 'device' })
        setResults([])
        setPlaces([])
        setPlacesAttribution(null)
        setActivePlaceId(null)
      },
      (cause) => setError(gpsError(cause)),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    )
  }

  const findNearby = async (event: FormEvent) => {
    event.preventDefault()
    setPlacesError('')
    setPlaces([])
    setPlacesAttribution(null)
    setActivePlaceId(null)
    if (!selected) { setPlacesError('Escolha ou pesquise uma localização de referência primeiro.'); return }
    setPlacesLoading(true)
    try {
      const found = await searchNearby(selected.latitude, selected.longitude, category, radius)
      setPlaces(found.results)
      setMapCameraMode(found.results.length ? 'results' : 'reference')
      setPlacesAttribution(found.attribution ?? null)
      if (!found.results.length) setPlacesError('Nenhum estabelecimento encontrado nesta categoria e raio.')
    } catch (cause) {
      setPlacesError(cause instanceof Error ? cause.message : 'Não foi possível buscar os estabelecimentos.')
    } finally { setPlacesLoading(false) }
  }

  return <section className="location-explorer-shell mt-3 rounded-2xl border border-[#e5e6de] bg-white p-5 sm:p-7" aria-labelledby="location-title">
    <div className="mb-5">
      <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[#85867e]">GeoIA</p>
      <h2 id="location-title" className="mt-1 text-xl font-semibold tracking-tight text-[#181915]">Explorar localização</h2>
      <p className="mt-1 text-sm text-[#77796f]">Pesquise um endereço ou escolha sua posição atual.</p>
    </div>
    <form onSubmit={search} className="location-search-form">
      <label className="sr-only" htmlFor="location-query">Endereço, hotel ou ponto de referência</label>
      <div className="field-wrap min-w-0 flex-1"><Search size={17} className="field-icon" aria-hidden="true"/><input id="location-query" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Endereço, hotel ou ponto de referência" autoComplete="off"/></div>
      <button className="button-primary location-search-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle className="animate-spin" size={17}/> : <Search size={17}/>} Pesquisar</button>
      <button className="header-logout location-search-gps justify-center" type="button" onClick={useDeviceLocation}><LocateFixed size={16}/> Usar minha localização</button>
    </form>
    {error && <p role="alert" className="form-alert mt-4">{error}</p>}
    {results.length > 0 && <ul className="mt-4 max-h-56 divide-y divide-[#e7e8e1] overflow-auto rounded-xl border border-[#e7e8e1]" aria-label="Resultados da pesquisa">
        {results.map((result,index)=><li key={`${result.latitude}:${result.longitude}:${index}`}><button type="button" className="w-full px-4 py-3 text-left transition hover:bg-[#f6f7f2]" onClick={()=>{setSelected({...result,source:'search'});setResults([]);setPlaces([]);setPlacesAttribution(null);setActivePlaceId(null)}}><span className="block text-sm font-semibold text-[#252620]">{result.name}</span><span className="mt-1 block text-xs text-[#77796f]">{result.formatted_address}</span></button></li>)}
    </ul>}
    <section className="nearby-section mt-6 border-t border-[#e7e8e1] pt-5" aria-labelledby="nearby-title">
      <div className="mb-5 rounded-xl border border-[#e7e8e1] bg-[#fafaf8] p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#252620]"><Sparkles size={16} className="text-[#829F34]"/>Buscar com IA</h3>
        <form onSubmit={runAiSearch} className="ai-search-form mt-3">
          <label className="sr-only" htmlFor="ai-place-query">Descreva o que procura</label>
          <input id="ai-place-query" value={aiPrompt} onChange={event=>setAiPrompt(event.target.value)} maxLength={1000} placeholder="Ex.: uma farmácia a até 2 km" className="min-w-0 flex-1 rounded-lg border border-[#dedfd8] bg-white px-3 py-2 text-sm"/>
          <button className="button-primary" type="submit" disabled={aiLoading}>{aiLoading ? <LoaderCircle className="animate-spin" size={16}/> : <Sparkles size={16}/>} Interpretar e buscar</button>
        </form>
        {!selected && <p className="mt-2 text-xs text-[#77796f]">Selecione uma localização ou use sua posição para receber resultados.</p>}
        {aiError && <p role="alert" className="form-alert mt-3">{aiError}</p>}
        {aiMessage && <p role="status" className="mt-3 text-sm text-[#55574e]">{aiMessage}</p>}
      </div>
      <div className="mb-4"><h3 id="nearby-title" className="flex items-center gap-2 text-base font-semibold text-[#252620]"><Store size={17} className="text-[#829F34]"/>Encontrar lugares próximos</h3><p className="mt-1 text-xs text-[#77796f]">Busque estabelecimentos mapeados perto da localização selecionada.</p></div>
      <form onSubmit={findNearby} className="nearby-form">
        <div className="nearby-field nearby-category-field"><span>Escolha um tipo</span><div className="category-chips" role="group" aria-label="Categoria de estabelecimento">{categories.map(item=><button key={item.value} type="button" aria-pressed={category===item.value} onClick={()=>setCategory(item.value)} className={`category-chip${category===item.value?' category-chip-active':''}`}>{item.label}</button>)}</div></div>
        <label className="nearby-field"><span>Distância</span><select value={radius} onChange={event=>setRadius(Number(event.target.value))}><option value={1000}>1 km</option><option value={2000}>2 km</option><option value={3000}>3 km</option><option value={5000}>5 km</option></select></label>
        <button className="button-primary nearby-submit" type="submit" disabled={placesLoading || !selected}>{placesLoading ? <LoaderCircle className="animate-spin" size={17}/> : <Search size={17}/>} Buscar lugares</button>
      </form>
      {!selected && <p className="mt-3 text-xs text-[#85867e]">Selecione uma localização acima para habilitar a busca.</p>}
      {placesError && <p role="alert" className="form-alert mt-4">{placesError}</p>}
    </section>
    {selected && <div id="selected-location-map" className={`places-map-layout mt-5${places.length ? ' places-map-layout--results' : ''}`}>
      {places.length > 0 && <aside className="places-results-panel" aria-label="Resultados de estabelecimentos">
        <div className="places-results-heading">
          <div>
            <p className="places-results-eyebrow">Perto de você</p>
            <h3>Resultados <span>{places.length}</span></h3>
          </div>
          <span className="places-category-tag">{categories.find(item=>item.value===places[0].category)?.label}</span>
        </div>
        <ul className="places-result-list" aria-label="Estabelecimentos próximos">
          {places.map(place=><li key={place.osm_id}>
            <article className={`places-result-card${activePlaceId===place.osm_id?' places-result-card-active':''}`}>
              <button type="button" aria-pressed={activePlaceId===place.osm_id} aria-label={`Selecionar ${place.name || 'estabelecimento sem nome'} no mapa`} className="places-result-select" onClick={()=>selectPlaceOnMap(place.osm_id)}>
                <PlaceMedia photo={verifiedPhotos(place)[0]} category={place.category} alt={`Foto de ${place.name || 'estabelecimento'}`} size="compact"/>
                <span className="places-result-copy">
                  <span className="places-result-topline"><span className="places-result-name">{place.name || 'Estabelecimento sem nome'}</span><span className="places-result-distance">{formatDistance(place.distance_m)}</span></span>
                  <span className="places-result-category"><CategorySymbol category={place.category} size={14}/>{categoryLabel(place.category)}</span>
                  {place.address && <span className="places-result-address">{place.address}</span>}
                </span>
              </button>
              <button type="button" className="places-map-focus-button" onClick={()=>selectPlaceOnMap(place.osm_id)}><MapPinned size={14} aria-hidden="true"/> Ver no mapa</button>
            </article>
          </li>)}
        </ul>
        {activePlace && <PlaceDetails key={activePlace.osm_id} place={activePlace}/>}
        {placesAttribution && <p className="places-attribution">Dados: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>}
      </aside>}
      <div className="geo-map places-map">
        <MapContainer center={[selected.latitude,selected.longitude]} zoom={14} minZoom={3} maxZoom={19} zoomControl={false} scrollWheelZoom className="h-full min-h-[360px] w-full sm:min-h-[440px]" aria-label="Mapa da localização selecionada">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <ZoomControl position="bottomright"/><ScaleControl position="bottomleft" metric imperial={false}/>
          <MapCamera selected={selected} places={mapPlaces} activePlace={activePlace} mode={mapCameraMode} onReady={handleMapReady}/>
          <Marker position={[selected.latitude,selected.longitude]} icon={referenceIcon}><Popup><strong>{selected.name}</strong><br/>{selected.formatted_address || 'Localização de referência'}</Popup></Marker>
          {mapPlaces.map(place=><Marker key={place.osm_id} position={[place.latitude,place.longitude]} icon={placeIcon(activePlaceId===place.osm_id)} eventHandlers={{click:()=>selectPlaceOnMap(place.osm_id)}}>
            <Tooltip direction="top" offset={[0,-12]} permanent={activePlaceId===place.osm_id}>{place.name || categoryLabel(place.category)}</Tooltip>
            <Popup><div className="map-marker-popup"><strong>{place.name || 'Estabelecimento sem nome'}</strong><span>{categoryLabel(place.category)} · {formatDistance(place.distance_m)}</span>{place.address && <small>{place.address}</small>}</div></Popup>
          </Marker>)}
        </MapContainer>
        <div className="map-context-badge" aria-live="polite"><MapPin size={14} aria-hidden="true"/><span>{activePlace?.name || selected.name}</span>{places.length > 0 && <small>{places.length} {places.length === 1 ? 'local' : 'locais'}</small>}</div>
        <div className="map-action-toolbar" role="group" aria-label="Controles de enquadramento do mapa">
          <button type="button" onClick={showAllMapResults} disabled={places.length === 0} aria-label="Enquadrar todos os locais" title="Enquadrar todos os locais"><Maximize2 size={15} aria-hidden="true"/><span>Todos</span></button>
          <button type="button" onClick={focusReferenceOnMap} aria-label="Voltar à localização de referência" title="Voltar à localização de referência"><LocateFixed size={15} aria-hidden="true"/><span>Referência</span></button>
        </div>
      </div>
      <div className="selected-place-card rounded-2xl border border-[#e7e8e1] bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#252620]"><MapPin size={17} className="text-[#829F34]"/>{selected.name}</div>
        <p className="mt-3 text-xs leading-5 text-[#77796f]">{selected.formatted_address || 'Endereço não geocodificado para esta posição.'}</p>
        <dl className="mt-5 space-y-2 text-xs text-[#55574e]"><div className="flex justify-between gap-2"><dt>Latitude</dt><dd className="font-mono">{selected.latitude.toFixed(6)}</dd></div><div className="flex justify-between gap-2"><dt>Longitude</dt><dd className="font-mono">{selected.longitude.toFixed(6)}</dd></div></dl>
      </div>
    </div>}
    {placesAttribution && places.length === 0 && <p className="places-attribution mt-3">Dados: <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></p>}
    <p className="mt-4 text-[11px] text-[#85867e]">Mapa © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
  </section>
}
