import { clearSupabaseAuthStorage, supabase } from './supabaseClient'

function isInvalidRefreshTokenError(error) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return blob.includes('invalid refresh token') || blob.includes('refresh token not found')
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

export async function signIn(email, password) {
  try {
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
    if (error) throw error
    return { data, error: null }
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
