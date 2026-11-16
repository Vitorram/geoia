import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/DashboardLayout'
import { LocationExplorer } from '../components/LocationExplorer'

export function LocationsPage() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <DashboardLayout><div className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8c81]">GeoIA / Módulos</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#181915]">Explorar localização</h1></div><LocationExplorer/></DashboardLayout>
}
