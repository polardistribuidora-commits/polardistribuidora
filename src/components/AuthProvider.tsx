import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Perfil } from '../lib/types'

type AuthContextValue = {
  session: Session | null
  perfil: Perfil | null
  loading: boolean
  signOut: () => Promise<void>
  refreshPerfil: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  const loadPerfil = async (userId?: string) => {
    const id = userId ?? session?.user.id
    if (!id) {
      setPerfil(null)
      return
    }

    const { data, error } = await supabase
      .from('perfis')
      .select('id,nome,role')
      .eq('id', id)
      .maybeSingle()

    if (error) console.error(error)
    setPerfil((data as Perfil | null) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadPerfil(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next) await loadPerfil(next.user.id)
      else setPerfil(null)
      setLoading(false)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    perfil,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshPerfil: async () => loadPerfil(),
  }), [session, perfil, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
