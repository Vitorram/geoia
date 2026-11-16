import type { ReactNode } from 'react'
import { Compass, Home, LogOut, MapPinned, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandMark } from './AuthLayout'

const navItems = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/locations', label: 'Explorar localização', icon: MapPinned, end: false },
]

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  if (!user) return null
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')

  return <div className="geo-app-shell min-h-screen bg-[#f6f7f3] text-[#191a16]">
    <aside className="geo-sidebar" aria-label="Barra lateral">
      <BrandMark onDark />
      <p className="sidebar-caption">SEU ESPAÇO</p>
      <nav aria-label="Navegação principal" className="sidebar-links">
        {navItems.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}>
          <Icon size={18} aria-hidden="true" />{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-security"><ShieldCheck size={16} aria-hidden="true"/><span>Sessão protegida</span></div>
        <p>Sua sessão fica ativa somente neste navegador.</p>
        <div className="sidebar-profile"><span className="sidebar-avatar">{initials}</span><span className="sidebar-user"><strong>{user.name}</strong><small>{user.email}</small></span><button type="button" onClick={logout} aria-label="Encerrar sessão pelo menu lateral" title="Sair"><LogOut size={17}/></button></div>
      </div>
    </aside>

    <div className="geo-main-column">
      <header className="geo-topbar">
        <div className="geo-mobile-brand"><BrandMark /></div>
        <div className="geo-topbar-context"><Compass size={16} aria-hidden="true"/><span>Inteligência territorial</span></div>
        <div className="geo-topbar-user"><span className="geo-user-name">{user.name}</span><span className="geo-secure"><ShieldCheck size={14} aria-hidden="true"/>Sessão segura</span><button className="header-logout" type="button" onClick={logout} aria-label="Sair"><LogOut size={16} aria-hidden="true"/><span>Sair</span></button></div>
      </header>
      <main className="geo-main-content">{children}</main>
    </div>

    <nav className="mobile-dock" aria-label="Navegação móvel">
      <NavLink to="/app/locations" aria-label="Explorar localização" className={({ isActive }) => `mobile-dock-link${isActive ? ' mobile-dock-link-active' : ''}`}><MapPinned size={18}/></NavLink>
      <NavLink to="/app" end aria-label="Início" className={({ isActive }) => `mobile-dock-link${isActive ? ' mobile-dock-link-active' : ''}`}><Home size={18}/></NavLink>
      <button type="button" className="mobile-dock-link" aria-label="Encerrar sessão" onClick={logout}><LogOut size={18}/></button>
    </nav>
  </div>
}
