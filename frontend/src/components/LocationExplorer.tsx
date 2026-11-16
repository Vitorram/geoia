import { useEffect, useState, type FormEvent } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { LoaderCircle, MapPin, Search, LocateFixed, Store } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { GeocodeResult, NearbyPlace, PlaceCategory } from '../lib/api'

import 'leaflet/dist/leaflet.css'

export interface SelectedLocation extends GeocodeResult {
  source: 'search' | 'device'
}

const markerIcon = L.icon({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap()
  useEffect(() => { map.setView(position, 14, { animate: true }) }, [map, position[0], position[1]])
  return null
}

const categories: { value: PlaceCategory; label: string }[] = [
  { value: 'pizzaria', label: 'Pizzaria' }, { value: 'restaurante', label: 'Restaurante' },
  { value: 'cafeteria', label: 'Cafeteria' }, { value: 'farmácia', label: 'Farmácia' },
  { value: 'supermercado', label: 'Supermercado' },
]

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
  const { searchLocations, searchNearby } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [selected, setSelected] = useState<SelectedLocation | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<PlaceCategory>('pizzaria')
  const [radius, setRadius] = useState(3000)
  const [places, setPlaces] = useState<NearbyPlace[]>([])
  const [placesError, setPlacesError] = useState('')
  const [placesLoading, setPlacesLoading] = useState(false)
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null)

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
    setActivePlaceId(null)
    if (!selected) { setPlacesError('Escolha ou pesquise uma localização de referência primeiro.'); return }
    setPlacesLoading(true)
    try {
      const found = await searchNearby(selected.latitude, selected.longitude, category, radius)
      setPlaces(found)
      if (!found.length) setPlacesError('Nenhum estabelecimento encontrado nesta categoria e raio.')
    } catch (cause) {
      setPlacesError(cause instanceof Error ? cause.message : 'Não foi possível buscar os estabelecimentos.')
    } finally { setPlacesLoading(false) }
  }

  return <section className="mt-8 rounded-2xl border border-[#e5e6de] bg-white p-5 sm:p-7" aria-labelledby="location-title">
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
      {results.map((result,index)=><li key={`${result.latitude}:${result.longitude}:${index}`}><button type="button" className="w-full px-4 py-3 text-left transition hover:bg-[#f6f7f2]" onClick={()=>{setSelected({...result,source:'search'});setResults([]);setPlaces([]);setActivePlaceId(null)}}><span className="block text-sm font-semibold text-[#252620]">{result.name}</span><span className="mt-1 block text-xs text-[#77796f]">{result.formatted_address}</span></button></li>)}
    </ul>}
    <section className="nearby-section mt-6 border-t border-[#e7e8e1] pt-5" aria-labelledby="nearby-title">
      <div className="mb-4"><h3 id="nearby-title" className="flex items-center gap-2 text-base font-semibold text-[#252620]"><Store size={17} className="text-[#829F34]"/>Encontrar lugares próximos</h3><p className="mt-1 text-xs text-[#77796f]">Busque estabelecimentos mapeados perto da localização selecionada.</p></div>
      <form onSubmit={findNearby} className="nearby-form">
        <label className="nearby-field"><span>Categoria</span><select value={category} onChange={event=>setCategory(event.target.value as PlaceCategory)}>{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="nearby-field"><span>Raio</span><select value={radius} onChange={event=>setRadius(Number(event.target.value))}><option value={1000}>1 km</option><option value={3000}>3 km</option><option value={5000}>5 km</option></select></label>
        <button className="button-primary nearby-submit" type="submit" disabled={placesLoading || !selected}>{placesLoading ? <LoaderCircle className="animate-spin" size={17}/> : <Search size={17}/>} Buscar lugares</button>
      </form>
      {!selected && <p className="mt-3 text-xs text-[#85867e]">Selecione uma localização acima para habilitar a busca.</p>}
      {placesError && <p role="alert" className="form-alert mt-4">{placesError}</p>}
      {places.length > 0 && <ul className="nearby-results mt-4" aria-label="Estabelecimentos próximos">{places.map(place=><li key={place.osm_id}><button type="button" className={`nearby-result${activePlaceId===place.osm_id?' nearby-result-active':''}`} onClick={()=>setActivePlaceId(place.osm_id)}><span className="nearby-result-pin"><MapPin size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#252620]">{place.name || 'Estabelecimento sem nome'}</span><span className="mt-1 block text-xs text-[#77796f]">{categories.find(item=>item.value===place.category)?.label} · {place.distance_m < 1000 ? `${place.distance_m} m` : `${(place.distance_m/1000).toFixed(1)} km`}</span>{place.address && <span className="mt-1 block truncate text-xs text-[#85867e]">{place.address}</span>}</span></button></li>)}</ul>}
    </section>
    {selected && <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,.6fr)]">
      <div className="geo-map overflow-hidden rounded-xl border border-[#e5e6de]">
        <MapContainer center={[selected.latitude,selected.longitude]} zoom={14} scrollWheelZoom={false} className="h-full min-h-[300px] w-full" aria-label="Mapa da localização selecionada">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <Recenter position={activePlaceId && places.find(place=>place.osm_id===activePlaceId) ? [places.find(place=>place.osm_id===activePlaceId)!.latitude, places.find(place=>place.osm_id===activePlaceId)!.longitude] : [selected.latitude,selected.longitude]}/><Marker position={[selected.latitude,selected.longitude]} icon={markerIcon}/>
          {places.map(place=><Marker key={place.osm_id} position={[place.latitude,place.longitude]} icon={placeIcon(activePlaceId===place.osm_id)} eventHandlers={{click:()=>setActivePlaceId(place.osm_id)}}>{place.name && <Popup>{place.name}</Popup>}</Marker>)}
        </MapContainer>
      </div>
      <div className="rounded-xl bg-[#f5f5f2] p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#252620]"><MapPin size={17} className="text-[#829F34]"/>{selected.name}</div>
        <p className="mt-3 text-xs leading-5 text-[#77796f]">{selected.formatted_address || 'Endereço não geocodificado para esta posição.'}</p>
        <dl className="mt-5 space-y-2 text-xs text-[#55574e]"><div className="flex justify-between gap-2"><dt>Latitude</dt><dd className="font-mono">{selected.latitude.toFixed(6)}</dd></div><div className="flex justify-between gap-2"><dt>Longitude</dt><dd className="font-mono">{selected.longitude.toFixed(6)}</dd></div></dl>
      </div>
    </div>}
    <p className="mt-4 text-[11px] text-[#85867e]">Mapa © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
  </section>
}
