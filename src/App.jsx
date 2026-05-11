import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import NavBar from './components/NavBar'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Bans from './pages/Bans'
import BanDetails from './pages/BanDetails'
import Appeals from './pages/Appeals'
import Audit from './pages/Audit'
import Players from './pages/Players'
import Warnings from './pages/Warnings'
import StaffStats from './pages/StaffStats'
import Tags from './pages/Tags'
import ConsolePanel  from './pages/ConsolePanel'
import ServerPanel   from './pages/ServerPanel'
import MapPage       from './pages/MapPage'
import Permissions   from './pages/Permissions'

function Protected({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <main className="center"><p>Loading...</p></main>
  if (!user) return <Navigate to="/login" replace />

  return children
}

export default function App() {
  const { user } = useAuth()

  return (
    <div className="app-shell">
      <NavBar />
      <div className={`app-body ${user ? 'with-sidebar' : ''}`}>
        <Sidebar />
        <div className="route-shell">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Bans />} />
            <Route path="/bans/:id" element={<BanDetails />} />
            <Route path="/appeals" element={<Protected><Appeals /></Protected>} />
            <Route path="/audit" element={<Protected><Audit /></Protected>} />
            <Route path="/players" element={<Protected><Players /></Protected>} />
            <Route path="/warnings" element={<Protected><Warnings /></Protected>} />
            <Route path="/staff-stats" element={<Protected><StaffStats /></Protected>} />
            <Route path="/tags" element={<Protected><Tags /></Protected>} />
            <Route path="/console" element={<Protected><ConsolePanel /></Protected>} />
            <Route path="/server"  element={<Protected><ServerPanel /></Protected>} />
            <Route path="/map"     element={<Protected><MapPage /></Protected>} />
            <Route path="/admin"   element={<Protected><Permissions /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
