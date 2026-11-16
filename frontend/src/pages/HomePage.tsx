import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { DashboardLayout } from '../components/DashboardLayout'

export function HomePage() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />

  return <DashboardLayout>
    <div className="mb-9"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8c81]">Sua conta GeoIA</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#181915] sm:text-4xl">Olá, {user.name.split(/\s+/)[0]}.</h1><p className="mt-2 text-sm text-[#77796f]">Sua conta está pronta para explorar o GeoIA.</p></div>
    <section className="welcome-panel relative overflow-hidden rounded-[28px] bg-[#151713] p-7 text-white sm:p-10 lg:p-12">
      <div className="welcome-glow" aria-hidden="true"/><div className="relative z-10 max-w-xl"><div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-[#d8f56a]"/>Conta autenticada</div><h2 className="text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-4xl">Veja o território<br className="hidden sm:block"/> por outro ângulo.</h2><p className="mt-4 max-w-md text-sm leading-6 text-white/55">Este é o início do seu espaço GeoIA. As ferramentas de exploração territorial serão adicionadas nas próximas etapas.</p><div className="mt-8 flex flex-wrap items-center gap-3 text-xs"><span className="inline-flex items-center gap-2 rounded-full bg-[#d8f56a] px-4 py-2.5 font-semibold text-[#20231a]">Perfil verificado <ShieldCheck size={15}/></span><span className="text-white/40">Acesso pessoal e seguro</span></div></div>
      <div className="welcome-contours" aria-hidden="true"><svg viewBox="0 0 420 340" fill="none"><path d="M10 287C67 233 105 267 151 223s54-107 112-90 72 78 115 50 36-79 74-108"/><path d="M-6 308c57-54 95-20 141-64s54-107 112-90 72 78 115 50 36-79 74-108"/><path d="M-22 329c57-54 95-20 141-64s54-107 112-90 72 78 115 50 36-79 74-108"/><path d="M29 265c57-54 95-20 141-64s54-107 112-90 72 78 115 50 36-79 74-108"/><path d="M2 315c68-30 90-9 153-78s76-105 129-90 81 59 125 37" className="route-line"/><circle cx="284" cy="147" r="8" className="route-point"/></svg><span>GeoIA · localização</span><ArrowUpRight size={18}/></div>
    </section>
    <section className="mt-7 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-[#e6e7df] bg-white p-5 sm:p-6"><p className="text-xs font-medium text-[#85867e]">Conta conectada</p><p className="mt-2 truncate text-sm font-semibold text-[#23241f]">{user.email}</p></div><div className="rounded-2xl border border-[#e6e7df] bg-white p-5 sm:p-6"><p className="text-xs font-medium text-[#85867e]">Acesso</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[#23241f]"><span className="h-2 w-2 rounded-full bg-[#83a52e]"/>Conta ativa</p></div></section>
    <footer className="mt-10 flex flex-col gap-2 border-t border-[#e5e6de] pt-5 text-[11px] text-[#96978e] sm:flex-row sm:items-center sm:justify-between"><span>GeoIA · Inteligência territorial</span><span>Conectado como {user.name}</span></footer>
  </DashboardLayout>
}
