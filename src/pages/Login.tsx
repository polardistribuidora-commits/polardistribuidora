import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { LockKeyhole, Snowflake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../components/AuthProvider'

export function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha inválidos.')
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo"><Snowflake size={34} /></div>
          <h1>POLAR</h1>
          <p>Distribuidora</p>
        </div>

        <div className="login-copy">
          <h2>Bem-vindo</h2>
          <p>Acesse o sistema de estoque e vendas.</p>
        </div>

        <form onSubmit={entrar} className="form-stack">
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <div className="alert error">{erro}</div>}
          <button className="primary large" disabled={loading}>
            <LockKeyhole size={18} />
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
