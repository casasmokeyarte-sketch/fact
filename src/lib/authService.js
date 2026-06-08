import { clearSupabaseAuthStorage, supabase } from './supabaseClient'

function isInvalidRefreshTokenError(error) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return blob.includes('invalid refresh token') || blob.includes('refresh token not found')
}

function normalizeDomain(domain) {
  const trimmed = String(domain || '').trim().toLowerCase()
  if (!trimmed) return '@fact.local'
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`
}

function buildLoginEmailCandidates(identifier, usernameDomain) {
  const raw = String(identifier || '').trim().toLowerCase()
  if (!raw) return []

  const candidates = [raw]
  if (!raw.includes('@')) {
    candidates.push(`${raw}${normalizeDomain(usernameDomain)}`)
  }

  return [...new Set(candidates)]
}

function mapSignInError(error, identifier, usernameDomain) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  if (blob.includes('email not confirmed')) {
    return 'Tu email no esta confirmado. Pide al administrador que valide el usuario o usa "Olvidaste tu contrasena".'
  }
  if (
    blob.includes('invalid login credentials') ||
    blob.includes('invalid_grant') ||
    blob.includes('invalid grant')
  ) {
    const raw = String(identifier || '').trim()
    if (raw && !raw.includes('@')) {
      const suggestedDomain = normalizeDomain(usernameDomain)
      return `Usuario o contrasena invalidos. Si ingresas solo usuario, se probara tambien con ${suggestedDomain}. Revisa el dominio configurado.`
    }
    return 'Usuario o contrasena invalidos.'
  }
  return error?.message || 'No se pudo iniciar sesion.'
}

// AUTENTICACIAN
export async function signUp(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {}
      }
    })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function signIn(identifier, password, options = {}) {
  try {
    const candidates = buildLoginEmailCandidates(
      identifier,
      options?.usernameDomain || '@fact.local'
    )

    let lastError = null

    for (const email of candidates) {
      let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error && isInvalidRefreshTokenError(error)) {
        clearSupabaseAuthStorage()
        const retry = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        data = retry.data
        error = retry.error
      }

      if (!error) {
        return { data, error: null }
      }

      lastError = error
    }

    if (lastError) {
      throw new Error(mapSignInError(lastError, identifier, options?.usernameDomain))
    }

    throw new Error('Debes ingresar un usuario o email valido.')
  } catch (error) {
    return { data: null, error: error.message }
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error.message }
  }
}

export async function getCurrentUser() {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      if (isInvalidRefreshTokenError(sessionError)) {
        clearSupabaseAuthStorage()
        return { user: null, error: null }
      }
      throw sessionError
    }

    if (session?.user) {
      return { user: session.user, error: null }
    }

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        clearSupabaseAuthStorage()
        return { user: null, error: null }
      }
      throw error
    }
    return { user, error: null }
  } catch (error) {
    return { user: null, error: error.message }
  }
}

export async function resetPassword(email) {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    })
    if (error) throw error
    return { error: null }
  } catch (error) {
    return { error: error.message }
  }
}

export async function updatePassword(newPassword) {
  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (error) throw error
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error.message }
  }
}

// LISTENER DE SESIAN
export function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return subscription
}
