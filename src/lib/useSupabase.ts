import * as React from 'react'
import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  User,
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { getCurrentUser } from './authService'

export type UID = string

export interface Profile {
  user_id: string
  email?: string | null
  display_name?: string | null
  role?: string | null
  company_id?: string | null
  permissions?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

type EqFilter = [column: string, value: unknown]
type OrderFilter = [column: string, ascending?: boolean]

interface FetchOptions {
  select?: string
  eq?: EqFilter | null
  order?: OrderFilter | null
}

interface DataResult<T> {
  data: T | null
  error: string | null
}

const profileKey = (userId: UID) => ['profile', userId] as const

export function useSupabase() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { user: currentUser } = await getCurrentUser()
        setUser(currentUser)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error obteniendo usuario')
      } finally {
        setLoading(false)
      }
    }

    void fetchUser()
  }, [])

  const fetchData = useCallback(
    async <T = unknown[]>(table: string, options: FetchOptions = {}): Promise<DataResult<T>> => {
      try {
        setError(null)
        const { select = '*', eq = null, order = null } = options

        let query = supabase.from(table).select(select)

        if (user && !eq) {
          query = query.eq('user_id', user.id)
        }

        if (eq) {
          const [column, value] = eq
          query = query.eq(column, value)
        }

        if (order) {
          const [column, ascending] = order
          query = query.order(column, { ascending: ascending !== false })
        }

        const { data, error: queryError } = await query
        if (queryError) throw queryError

        return { data: (data as T) ?? null, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error consultando datos'
        setError(message)
        return { data: null, error: message }
      }
    },
    [user]
  )

  const addData = useCallback(
    async <T extends Record<string, unknown>>(
      table: string,
      item: T
    ): Promise<DataResult<Record<string, unknown>>> => {
      try {
        setError(null)

        if (!user?.id) {
          const message = 'No hay usuario autenticado'
          setError(message)
          return { data: null, error: message }
        }

        const dataWithUser = { ...item, user_id: user.id }
        const { data, error: queryError } = await supabase
          .from(table)
          .insert([dataWithUser])
          .select()

        if (queryError) throw queryError
        return { data: (data?.[0] as Record<string, unknown>) ?? null, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error insertando datos'
        setError(message)
        return { data: null, error: message }
      }
    },
    [user]
  )

  const updateData = useCallback(
    async (
      table: string,
      id: string,
      updates: Record<string, unknown>
    ): Promise<DataResult<Record<string, unknown>>> => {
      try {
        setError(null)
        const { data, error: queryError } = await supabase
          .from(table)
          .update(updates)
          .eq('id', id)
          .select()

        if (queryError) throw queryError
        return { data: (data?.[0] as Record<string, unknown>) ?? null, error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error actualizando datos'
        setError(message)
        return { data: null, error: message }
      }
    },
    []
  )

  const deleteData = useCallback(
    async (table: string, id: string): Promise<{ error: string | null }> => {
      try {
        setError(null)
        const { error: queryError } = await supabase.from(table).delete().eq('id', id)

        if (queryError) throw queryError
        return { error: null }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error eliminando datos'
        setError(message)
        return { error: message }
      }
    },
    []
  )

  const subscribe = useCallback(
    (
      table: string,
      callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
    ) => {
      const channel = supabase
        .channel(`${table}-changes`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
          },
          (payload) => callback(payload as RealtimePostgresChangesPayload<Record<string, unknown>>)
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    },
    []
  )

  return {
    user,
    loading,
    error,
    fetchData,
    addData,
    updateData,
    deleteData,
    subscribe,
  }
}

export function useProfile(userId?: UID) {
  const qc = useQueryClient()

  const query = useQuery<Profile | null>({
    queryKey: profileKey(userId ?? ''),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId as string)
        .single()

      if (error) throw error
      return (data as Profile) ?? null
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  React.useEffect(() => {
    if (!userId) return

    let channel: RealtimeChannel | undefined
    let isMounted = true

    const setup = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!isMounted) return

        await supabase.realtime.setAuth(session?.access_token ?? '')

        if (!isMounted) return

        channel = supabase
          .channel(`profile:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'profiles',
              filter: `user_id=eq.${userId}`,
            },
            () => {
              if (isMounted) {
                qc.invalidateQueries({ queryKey: profileKey(userId) })
              }
            }
          )

        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED' && isMounted) {
            qc.invalidateQueries({ queryKey: profileKey(userId) })
          }

          if (status === 'CHANNEL_ERROR') {
            console.error('Realtime profile channel error:', err)
          }
        })
      } catch (err) {
        console.error('Failed to setup profile realtime subscription:', err)
      }
    }

    void setup()

    return () => {
      isMounted = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return query
}

export function bindAuthProfileInvalidation(
  queryClient: QueryClient,
  debounceMs = 120
) {
  let timer: ReturnType<typeof setTimeout> | null = null

  const invalidate = (uid?: UID | null) => {
    if (timer) clearTimeout(timer)

    timer = setTimeout(() => {
      if (uid) {
        queryClient.invalidateQueries({ queryKey: profileKey(uid) })
      } else {
        queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    }, debounceMs)
  }

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    invalidate(session?.user?.id ?? null)
  })

  return () => {
    if (timer) clearTimeout(timer)
    data.subscription.unsubscribe()
  }
}

