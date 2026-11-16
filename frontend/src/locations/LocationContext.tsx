import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { GeocodeResult } from '../lib/api'

export interface SelectedLocation extends GeocodeResult {
  source: 'search' | 'device'
}

interface LocationContextValue {
  selectedLocation: SelectedLocation | null
  setSelectedLocation: (location: SelectedLocation | null) => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

export function LocationProvider({ children }: { children: ReactNode }) {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null)
  const value = useMemo(() => ({ selectedLocation, setSelectedLocation }), [selectedLocation])
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useSelectedLocation() {
  const context = useContext(LocationContext)
  if (!context) throw new Error('useSelectedLocation deve ser usado dentro de LocationProvider.')
  return context
}
