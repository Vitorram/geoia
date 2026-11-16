import type { ReactNode } from 'react'
import { LayoutDashboard, LogOut, MapPinned, ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { BrandMark } from './AuthLayout'

const navItems = [
  { to: '/app', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/app/locations', label: 'Explorar localização', icon: MapPinned, end: false },
]

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  if (!user) return null
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${isActive ? 'bg-white/[0.1] text-white' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`

  return <div className="min-h-screen bg-[#f5f5f2] lg:flex">
    <aside className="hidden w-[250px] shrink-0 flex-col bg-[#10110f] px-6 py-7 text-white lg:flex">
      <BrandMark onDark />
      <nav aria-label="Navegação principal" className="mt-10 space-y-2">
        {navItems.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={linkClass}><Icon size={17} className="text-[#d8f56a]" aria-hidden="true"/>{label}</NavLink>)}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="flex items-center gap-2 text-xs font-medium text-white/80"><ShieldCheck size={15} className="text-[#d8f56a]"/>Sessão protegida</div><p className="mt-2 text-[11px] leading-5 text-white/40">Sua sessão fica ativa somente neste navegador.</p></div>
    </aside>
    <div className="min-w-0 flex-1">
      <header className="flex h-[76px] items-center justify-between border-b border-[#e7e8e1] bg-white/80 px-5 backdrop-blur sm:px-8 lg:px-11">
        <div className="lg:hidden"><BrandMark /></div>
        <div className="hidden text-xs text-[#818278] lg:block">GeoIA</div>
        <div className="ml-auto flex items-center gap-3 sm:gap-4"><div className="hidden text-right sm:block"><p className="text-xs font-semibold text-[#252620]">{user.name}</p><p className="mt-0.5 text-[11px] text-[#85867e]">{user.email}</p></div><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8eddd] text-xs font-semibold text-[#53642e]" aria-label={`Perfil de ${user.name}`}>{initials}</div><button className="header-logout" type="button" onClick={logout}><LogOut size={16} aria-hidden="true"/><span className="hidden sm:inline">Sair</span></button></div>
      </header>
      <nav aria-label="Navegação principal" className="flex gap-2 overflow-x-auto border-b border-[#e7e8e1] bg-white px-4 py-2 lg:hidden">
        {navItems.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${isActive?'bg-[#eef2e5] text-[#455a1c]':'text-[#73756c] hover:bg-[#f5f5f2]'}`}><Icon size={15}/>{label}</NavLink>)}
      </nav>
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-11 lg:py-12">{children}</main>
    </div>
  </div>
}
