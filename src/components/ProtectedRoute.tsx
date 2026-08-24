import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) return <div className="splash">Carregando Polar...</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
