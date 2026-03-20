import React, { useEffect, useState } from 'react'
import { signIn, resetPassword, updatePassword } from '../lib/authService'
import '../App.css'

export function AuthPage({ onAuthSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const isRecovery =
      hash.includes('type=recovery') ||
      search.includes('type=recovery') ||
      window.location.pathname.includes('/auth/reset-password')

    if (isRecovery) {
      setIsRecoveryMode(true)
      setInfo('Ingresa tu nueva contrasena para completar la recuperacion.')
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const usernameDomain = String(import.meta.env?.VITE_USERNAME_EMAIL_DOMAIN || '@fact.local').trim() || '@fact.local'
      const normalizedDomain = usernameDomain.startsWith('@') ? usernameDomain : `@${usernameDomain}`
      const normalizeLoginEmail = (value) => {
        const raw = String(value || '').trim()
        if (!raw) return ''
        return raw.includes('@') ? raw : `${raw}${normalizedDomain}`
      }

      if (isRecoveryMode) {
        if (!recoveryPassword || recoveryPassword.length < 6) {
          setError('La nueva contrasena debe tener al menos 6 caracteres.')
          return
        }
        if (recoveryPassword !== recoveryPasswordConfirm) {
          setError('Las contrasenas no coinciden.')
          return
        }

        const { error: updateError } = await updatePassword(recoveryPassword)
        if (updateError) {
          setError(updateError)
          return
        }

        setInfo('Contrasena actualizada. Ya puedes iniciar sesion.')
        setIsRecoveryMode(false)
        setRecoveryPassword('')
        setRecoveryPasswordConfirm('')
        window.history.replaceState({}, document.title, window.location.pathname)
        return
      }

      const result = await signIn(normalizeLoginEmail(email), password)

      if (result.error) {
        setError(result.error)
      } else {
        const sessionUser = result?.data?.session?.user || null

        if (!sessionUser) {
          setError('No se pudo iniciar sesion. Intenta nuevamente.')
          return
        }

        onAuthSuccess(sessionUser)
      }
    } catch (err) {
      setError(err.message || 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError('')
    setInfo('')

    if (!email) {
      setError('Ingresa tu email para recuperar la contrasena.')
      return
    }

    const { error: resetError } = await resetPassword(email)
    if (resetError) {
      setError(resetError)
      return
    }

    setInfo('Te enviamos un correo para restablecer tu contrasena.')
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>facturas OT</h1>
        <p className="auth-subtitle">
          {isRecoveryMode ? 'Recuperacion de contrasena' : 'Inicia sesion'}
        </p>

        {error && <div className="error-message">{error}</div>}
        {info && <div className="info-message">{info}</div>}

        <form onSubmit={handleSubmit}>
          {!isRecoveryMode && (
            <div className="form-group">
              <label htmlFor="email">Usuario o Email</label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ej: cajero1 (o tu@email.com)"
                required
              />
            </div>
          )}

          {!isRecoveryMode && (
            <div className="form-group">
              <label htmlFor="password">Contrasena</label>
              <div className="password-field">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                  title={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                >
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>
          )}

          {isRecoveryMode && (
            <>
              <div className="form-group">
                <label htmlFor="recoveryPassword">Nueva contrasena</label>
                <input
                  id="recoveryPassword"
                  type="password"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="recoveryPasswordConfirm">Confirmar contrasena</label>
                <input
                  id="recoveryPasswordConfirm"
                  type="password"
                  value={recoveryPasswordConfirm}
                  onChange={(e) => setRecoveryPasswordConfirm(e.target.value)}
                  placeholder="Repite la contrasena"
                  required
                />
              </div>
            </>
          )}

          {!isRecoveryMode && (
            <div className="forgot-wrap">
              <button
                type="button"
                className="forgot-button"
                onClick={handleForgotPassword}
              >
                Olvidaste tu contrasena?
              </button>
            </div>
          )}

          <button type="submit" disabled={loading} className="auth-button">
            {loading ? 'Procesando...' : isRecoveryMode ? 'Actualizar contrasena' : 'Iniciar sesion'}
          </button>
        </form>

        {!isRecoveryMode && (
          <p className="auth-hint">
            Si no tienes usuario, pidelo al Administrador para que te cree uno desde el modulo de Usuarios.
          </p>
        )}
      </div>

      <style>{`
        .auth-container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background: radial-gradient(1200px 600px at 50% 30%, rgba(255, 0, 214, 0.08), transparent 60%), #000;
          overflow: hidden;
        }

        .auth-container::before,
        .auth-container::after {
          content: '';
          position: absolute;
          inset: -20%;
          pointer-events: none;
          background:
            radial-gradient(800px 520px at 18% 32%, rgba(255, 0, 214, 0.22), transparent 55%),
            radial-gradient(760px 520px at 78% 28%, rgba(0, 229, 255, 0.18), transparent 56%),
            radial-gradient(820px 620px at 55% 78%, rgba(140, 70, 255, 0.14), transparent 60%);
          filter: blur(22px);
          opacity: 0.85;
          transform: translate3d(0, 0, 0);
          animation: authNeonShift 8.5s ease-in-out infinite;
        }

        .auth-container::after {
          opacity: 0.6;
          filter: blur(34px);
          animation-duration: 12.5s;
          animation-direction: reverse;
          mix-blend-mode: screen;
        }

        @keyframes authNeonShift {
          0% { transform: translate3d(-1.5%, -1.2%, 0) scale(1.02); opacity: 0.62; }
          35% { transform: translate3d(1.2%, -0.4%, 0) scale(1.04); opacity: 0.86; }
          70% { transform: translate3d(-0.6%, 1.1%, 0) scale(1.03); opacity: 0.74; }
          100% { transform: translate3d(-1.5%, -1.2%, 0) scale(1.02); opacity: 0.62; }
        }

        .auth-card {
          position: relative;
          background: rgba(0, 0, 0, 0.62);
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 14px 60px rgba(0, 0, 0, 0.65);
          border: 1px solid rgba(0, 229, 255, 0.22);
          backdrop-filter: blur(10px);
          width: 100%;
          max-width: 400px;
          z-index: 1;
        }

        .auth-card h1 {
          text-align: center;
          color: rgba(243, 247, 255, 0.96);
          margin: 0 0 10px 0;
          font-size: 32px;
          text-transform: uppercase;
        }

        .auth-subtitle {
          text-align: center;
          color: rgba(243, 247, 255, 0.72);
          margin-bottom: 30px;
        }

        .error-message {
          background-color: rgba(255, 45, 85, 0.14);
          color: rgba(255, 225, 230, 0.95);
          padding: 12px;
          border-radius: 5px;
          margin-bottom: 20px;
          border-left: 4px solid rgba(255, 45, 85, 0.85);
        }

        .info-message {
          background-color: rgba(0, 229, 255, 0.12);
          color: rgba(214, 251, 255, 0.95);
          padding: 12px;
          border-radius: 5px;
          margin-bottom: 20px;
          border-left: 4px solid rgba(0, 229, 255, 0.85);
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: rgba(243, 247, 255, 0.78);
          font-weight: 600;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          box-sizing: border-box;
          border: 1px solid rgba(0, 229, 255, 0.18);
          border-radius: 5px;
          font-size: 14px;
          transition: border-color 0.3s;
          background: rgba(0, 0, 0, 0.35);
          color: rgba(243, 247, 255, 0.92);
        }

        .form-group input:focus {
          outline: none;
          border-color: rgba(255, 0, 214, 0.55);
          box-shadow: 0 0 0 3px rgba(255, 0, 214, 0.18);
        }

        .password-field {
          position: relative;
        }

        .password-field input {
          width: 100%;
          padding-right: 70px;
        }

        .password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          line-height: 1;
          color: rgba(243, 247, 255, 0.75);
          padding: 4px;
        }

        .password-toggle:hover {
          color: rgba(255, 0, 214, 0.95);
        }

        .forgot-wrap {
          text-align: right;
          margin-top: -8px;
          margin-bottom: 14px;
        }

        .forgot-button {
          background: none;
          border: none;
          color: rgba(0, 229, 255, 0.92);
          cursor: pointer;
          font-size: 13px;
          padding: 0;
          text-decoration: underline;
        }

        .forgot-button:hover {
          color: rgba(255, 0, 214, 0.95);
        }

        .auth-button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, rgba(255, 0, 214, 0.92), rgba(47, 124, 255, 0.88));
          color: white;
          border: none;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .auth-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 0 0 1px rgba(255, 0, 214, 0.45), 0 10px 28px rgba(255, 0, 214, 0.18), 0 10px 32px rgba(0, 229, 255, 0.16);
        }

        .auth-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .auth-hint {
          margin: 18px 0 0 0;
          text-align: center;
          color: rgba(243, 247, 255, 0.65);
          font-size: 13px;
          line-height: 1.35;
        }
      `}</style>
    </div>
  )
}
