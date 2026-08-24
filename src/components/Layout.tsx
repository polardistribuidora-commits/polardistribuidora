import { NavLink, Outlet } from 'react-router-dom'
import {
  Boxes,
  FileBarChart,
  FileInput,
  Gauge,
  LogOut,
  Menu,
  PackageSearch,
  ShoppingCart,
  Snowflake,
  Warehouse,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from './AuthProvider'

const links = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { to: '/produtos', label: 'Produtos', icon: PackageSearch },
  { to: '/estoque', label: 'Estoque', icon: Warehouse },
  { to: '/nfe', label: 'Importar NF-e', icon: FileInput },
  { to: '/relatorios', label: 'Relatório diário', icon: FileBarChart },
]

export function Layout() {
  const [menu, setMenu] = useState(false)
  const { perfil, session, signOut } = useAuth()

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Snowflake /></div>
          <div>
            <strong>POLAR</strong>
            <span>Distribuidora</span>
          </div>
          <button className="mobile-close" onClick={() => setMenu(false)}><X /></button>
        </div>

        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenu(false)}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-box">
            <div className="avatar">{(perfil?.nome || session?.user.email || 'U')[0].toUpperCase()}</div>
            <div>
              <strong>{perfil?.nome || session?.user.email}</strong>
              <span>{perfil?.role || 'usuário'}</span>
            </div>
          </div>
          <button className="logout" onClick={() => signOut()}>
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {menu && <div className="sidebar-overlay" onClick={() => setMenu(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenu(true)}><Menu /></button>
          <div className="top-title">
            <Boxes size={20} />
            <span>Gestão de Estoque e Vendas</span>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
