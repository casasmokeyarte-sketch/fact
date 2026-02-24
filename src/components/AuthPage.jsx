import React, { useEffect, useState } from 'react'
import { signUp, signIn, resetPassword, updatePassword } from '../lib/authService'
import '../App.css'
import loginBg from '../assets/login-bg.png..jpeg'

export function AuthPage({ onAuthSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
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
      setIsLogin(true)
      setInfo('Ingresa tu nueva contrasena para completar la recuperacion.')
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
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

      let result
      if (isLogin) {
        result = await signIn(email, password)
      } else {
        result = await signUp(email, password)
      }

      if (result.error) {
        setError(result.error)
      } else {
        const sessionUser = result?.data?.session?.user || null
        const authUser = result?.data?.user || null

        if (isLogin) {
          if (!sessionUser) {
            setError('No se pudo iniciar sesion. Intenta nuevamente.')
            return
          }
          onAuthSuccess(sessionUser)
          return
        }

        if (sessionUser) {
          onAuthSuccess(sessionUser)
        } else if (authUser) {
          setInfo('Registro exitoso. Revisa tu correo para confirmar la cuenta y luego inicia sesion.')
          setIsLogin(true)
        } else {
          setInfo('Registro completado. Inicia sesion para continuar.')
          setIsLogin(true)
        }
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
          {isRecoveryMode ? 'Recuperacion de contrasena' : isLogin ? 'Inicia sesion' : 'Crea una cuenta'}
        </p>

        {error && <div className="error-message">{error}</div>}
        {info && <div className="info-message">{info}</div>}

        <form onSubmit={handleSubmit}>
          {!isRecoveryMode && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
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

          {isLogin && !isRecoveryMode && (
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
            {loading ? 'Procesando...' : isRecoveryMode ? 'Actualizar contrasena' : isLogin ? 'Iniciar sesion' : 'Registrarse'}
          </button>
        </form>

        {!isRecoveryMode && (
          <div className="auth-toggle">
            <p>
              {isLogin ? 'No tienes cuenta?' : 'Ya tienes cuenta?'}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin)
                  setError('')
                  setInfo('')
                }}
                className="toggle-button"
              >
                {isLogin ? 'Registrate' : 'Inicia sesion'}
              </button>
            </p>
          </div>
        )}
      </div>

      <style>{`
        .auth-container {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-image:
            linear-gradient(135deg, rgba(102, 126, 234, 0.75) 0%, rgba(118, 75, 162, 0.75) 100%),
            url('${loginBg}');
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
        }

        .auth-card {
          background: white;
          padding: 40px;
          border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
          width: 100%;
          max-width: 400px;
        }

        .auth-card h1 {
          text-align: center;
          color: #333;
          margin: 0 0 10px 0;
          font-size: 32px;
          text-transform: uppercase;
        }

        .auth-subtitle {
          text-align: center;
          color: #666;
          margin-bottom: 30px;
        }

        .error-message {
          background-color: #fee;
          color: #c33;
          padding: 12px;
          border-radius: 5px;
          margin-bottom: 20px;
          border-left: 4px solid #c33;
        }

        .info-message {
          background-color: #effaf3;
          color: #166534;
          padding: 12px;
          border-radius: 5px;
          margin-bottom: 20px;
          border-left: 4px solid #16a34a;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: #333;
          font-weight: 600;
        }

        .form-group input {
          width: 100%;
          padding: 12px;
          box-sizing: border-box;
          border: 1px solid #ddd;
          border-radius: 5px;
          font-size: 14px;
          transition: border-color 0.3s;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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
          color: #555;
          padding: 4px;
        }

        .password-toggle:hover {
          color: #333;
        }

        .forgot-wrap {
          text-align: right;
          margin-top: -8px;
          margin-bottom: 14px;
        }

        .forgot-button {
          background: none;
          border: none;
          color: #667eea;
          cursor: pointer;
          font-size: 13px;
          padding: 0;
          text-decoration: underline;
        }

        .forgot-button:hover {
          color: #764ba2;
        }

        .auth-button {
          width: 100%;
          padding: 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 5px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .auth-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
        }

        .auth-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .auth-toggle {
          text-align: center;
          margin-top: 20px;
          color: #666;
          font-size: 14px;
        }

        .toggle-button {
          background: none;
          border: none;
          color: #667eea;
          cursor: pointer;
          font-weight: 600;
          margin-left: 5px;
          text-decoration: underline;
        }

        .toggle-button:hover {
          color: #764ba2;
        }
      `}</style>
    </div>
  )
}
