import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'

const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.').max(128, 'Senha muito longa.'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [showPassword, setShowPassword] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const registered = searchParams.get('registered') === '1'

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  if (user) return <Navigate to="/app" replace />

  const onSubmit = async (values: LoginValues) => {
    setApiError('')
    setIsSubmitting(true)
    try {
      await login(values)
      navigate('/app', { replace: true })
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="animate-rise">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#e8e9e3] bg-white px-3 py-1.5 text-[11px] font-medium text-[#68705a] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#83a52e]" />
          Acesso seguro ao GeoIA
        </div>
        <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#161713] sm:text-[2.35rem]">
          Bom ter você<br className="hidden sm:block" /> de volta.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#77796f]">
          Entre para continuar seu trabalho com inteligência territorial.
        </p>

        {registered && (
          <div className="mt-6 rounded-xl border border-[#dce8bd] bg-[#f2f7e6] px-4 py-3 text-sm text-[#536b21]" role="status">
            Conta criada. Agora você já pode entrar.
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="login-email" className="field-label">E-mail</label>
            <div className={`field-wrap ${errors.email ? 'field-wrap-error' : ''}`}>
              <Mail size={17} className="field-icon" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                {...register('email')}
              />
            </div>
            {errors.email && <p id="login-email-error" className="field-error">{errors.email.message}</p>}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="login-password" className="field-label mb-0">Senha</label>
            </div>
            <div className={`field-wrap ${errors.password ? 'field-wrap-error' : ''}`}>
              <LockKeyhole size={17} className="field-icon" aria-hidden="true" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Sua senha"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                {...register('password')}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.password && <p id="login-password-error" className="field-error">{errors.password.message}</p>}
          </div>

          {apiError && <p className="form-alert" role="alert">{apiError}</p>}

          <button className="button-primary group" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><span className="loading-spinner" aria-hidden="true" /> Entrando...</>
            ) : (
              <>Entrar na plataforma <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></>
            )}
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-[#77796f]">
          Ainda não tem uma conta?{' '}
          <Link className="text-link" to="/register">Criar conta</Link>
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 border-t border-[#e8e9e3] pt-6 text-[11px] text-[#85867e]">
          <LockKeyhole size={13} aria-hidden="true" />
          Seus dados são protegidos durante toda a sessão.
        </div>
      </div>
    </AuthLayout>
  )
}
