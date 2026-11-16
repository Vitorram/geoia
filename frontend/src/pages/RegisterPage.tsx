import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../auth/AuthContext'
import { AuthLayout } from '../components/AuthLayout'
import { ApiError, authApi } from '../lib/api'

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Informe seu nome.').max(120, 'Use até 120 caracteres.'),
    email: z.email('Informe um e-mail válido.'),
    password: z.string().min(12, 'Use pelo menos 12 caracteres.').max(128, 'Use até 128 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirme sua senha.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  })

type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  if (user) return <Navigate to="/app" replace />

  const onSubmit = async ({ name, email, password }: RegisterValues) => {
    setApiError('')
    setIsSubmitting(true)
    try {
      await authApi.register({ name, email, password })
      navigate('/login?registered=1', { replace: true })
    } catch (error) {
      setApiError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível criar sua conta. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="animate-rise">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#e8e9e3] bg-white px-3 py-1.5 text-[11px] font-medium text-[#68705a] shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-[#83a52e]" />
          Comece por aqui
        </div>
        <h2 className="text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#161713] sm:text-[2.35rem]">
          Seu espaço,<br className="hidden sm:block" /> novas perspectivas.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#77796f]">
          Crie sua conta para acessar a plataforma GeoIA.
        </p>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label htmlFor="register-name" className="field-label">Nome</label>
            <div className={`field-wrap ${errors.name ? 'field-wrap-error' : ''}`}>
              <UserRound size={17} className="field-icon" aria-hidden="true" />
              <input
                id="register-name"
                autoComplete="name"
                placeholder="Como podemos chamar você?"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'register-name-error' : undefined}
                {...register('name')}
              />
            </div>
            {errors.name && <p id="register-name-error" className="field-error">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="register-email" className="field-label">E-mail</label>
            <div className={`field-wrap ${errors.email ? 'field-wrap-error' : ''}`}>
              <Mail size={17} className="field-icon" aria-hidden="true" />
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'register-email-error' : undefined}
                {...register('email')}
              />
            </div>
            {errors.email && <p id="register-email-error" className="field-error">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="register-password" className="field-label">Senha</label>
            <div className={`field-wrap ${errors.password ? 'field-wrap-error' : ''}`}>
              <LockKeyhole size={17} className="field-icon" aria-hidden="true" />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo de 12 caracteres"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'register-password-error' : 'password-hint'}
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
            {errors.password ? (
              <p id="register-password-error" className="field-error">{errors.password.message}</p>
            ) : (
              <p id="password-hint" className="field-hint">Use pelo menos 12 caracteres.</p>
            )}
          </div>

          <div>
            <label htmlFor="register-confirm-password" className="field-label">Confirmar senha</label>
            <div className={`field-wrap ${errors.confirmPassword ? 'field-wrap-error' : ''}`}>
              <LockKeyhole size={17} className="field-icon" aria-hidden="true" />
              <input
                id="register-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Digite a senha novamente"
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
                {...register('confirmPassword')}
              />
            </div>
            {errors.confirmPassword && <p id="register-confirm-password-error" className="field-error">{errors.confirmPassword.message}</p>}
          </div>

          {apiError && <p className="form-alert" role="alert">{apiError}</p>}

          <button className="button-primary group !mt-6" type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <><span className="loading-spinner" aria-hidden="true" /> Criando conta...</>
            ) : (
              <>Criar conta <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#77796f]">
          Já tem uma conta? <Link className="text-link" to="/login">Entrar</Link>
        </p>
      </div>
    </AuthLayout>
  )
}
