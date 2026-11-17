import { Routes, Route, Link, NavLink, Navigate, useNavigate } from 'react-router-dom';
import Intake from './pages/Intake.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Detail from './pages/Detail.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import { isAuthed, logout } from './auth.js';

function PublicLayout({ children }) {
  return (
    <>
      <div className="topbar">
        <span className="logo">Clause</span>
        <span style={{ opacity: 0.6, fontSize: 14 }}>Contract intake · Northside Legal Aid</span>
        <nav style={{ marginLeft: 'auto' }}>
          <Link to="/legal">Dashboard</Link>
        </nav>
      </div>
      {children}
    </>
  );
}

function LegalLayout({ children }) {
  const nav = useNavigate();
  return (
    <>
      <div className="topbar">
        <Link to="/legal" className="logo">Clause</Link>
        <span style={{ opacity: 0.6, fontSize: 14 }}>Legal — Contract Review</span>
        <nav style={{ marginLeft: 'auto' }}>
          <NavLink to="/legal" end>Dashboard</NavLink>
          <NavLink to="/legal/settings">Settings</NavLink>
          <a onClick={() => { logout(); nav('/legal/login'); }} style={{ cursor: 'pointer' }}>Sign out</a>
        </nav>
      </div>
      {children}
    </>
  );
}

function Protected({ children }) {
  if (!isAuthed()) return <Navigate to="/legal/login" replace />;
  return <LegalLayout>{children}</LegalLayout>;
}

export default function App() {
  return (
    <Routes>
      {/* Public — requesters only see the intake form */}
      <Route path="/" element={<PublicLayout><Intake /></PublicLayout>} />

      {/* Legal — behind sign-in */}
      <Route path="/legal/login" element={<Login />} />
      <Route path="/legal" element={<Protected><Dashboard /></Protected>} />
      <Route path="/legal/requests/:id" element={<Protected><Detail /></Protected>} />
      <Route path="/legal/settings" element={<Protected><Settings /></Protected>} />


      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
