import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/DashboardLayout'
import { NearbyFeed } from '../components/NearbyFeed'

export function HomePage() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  const firstName = user.name.trim().split(/\s+/)[0]

  return <DashboardLayout>
    <h1 className="feed-greeting">Olá, {firstName} <span aria-hidden="true"> ^^ </span></h1>
    <NearbyFeed />
  </DashboardLayout>
}
