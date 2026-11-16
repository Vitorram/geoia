import type { ReactNode } from 'react'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-frame min-h-screen bg-[#f5f5f2] lg:grid lg:grid-cols-[1.02fr_0.98fr]">
      <aside className="auth-story relative hidden min-h-screen min-w-0 overflow-hidden bg-[#10110f] p-7 text-white lg:flex lg:flex-col lg:p-10 xl:p-14">

        <div className="relative z-10 animate-logo">
          <img className="w-[188px]" src="/geoia-logo.svg" alt="GeoIA" />
        </div>

        <div className="auth-story-copy relative z-10 mt-20 max-w-xl animate-copy">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">
            <span className="h-1.5 w-1.5 rounded-full bg-[#d8f56a] animate-pulse-soft" />
            Inteligência geoespacial, com clareza
          </div>
          <h1 className="max-w-[490px] text-3xl font-medium leading-[1.08] tracking-[-0.045em] lg:text-4xl xl:text-[3.45rem]">
            Uma nova perspectiva começa <span className="text-[#d8f56a]">aqui.</span>
          </h1>
        </div>

      </aside>

      <section className="flex min-h-screen min-w-0 flex-col px-5 py-6 sm:px-8 lg:justify-center lg:px-12 xl:px-20">
        <div className="auth-mobile-header animate-logo lg:hidden">
          <img className="auth-mobile-logo" src="/geoia-logo.svg" alt="GeoIA" />
        </div>
        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-6 lg:flex-none lg:py-0">
          {children}
        </div>
        <footer className="mx-auto mt-10 flex w-full max-w-[430px] items-center justify-between text-[11px] text-[#85867e] lg:absolute lg:bottom-7 lg:right-10 lg:mt-0 lg:max-w-none lg:justify-end lg:gap-5">
          <span>© 2026 GeoIA</span>
          <span className="hidden sm:inline">Acesso protegido · Sessão segura</span>
        </footer>
      </section>
    </main>
  )
}

export function BrandMark({ onDark = false }: { onDark?: boolean }) {
  return <img className="w-[142px]" src={onDark ? '/geoia-logo.svg' : '/geoia-logo-light.svg'} alt="GeoIA" />
}
