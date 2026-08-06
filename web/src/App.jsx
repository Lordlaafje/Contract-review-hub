import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Intake from './pages/Intake.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Detail from './pages/Detail.jsx';
import Login from './pages/Login.jsx';
import Settings from './pages/Settings.jsx';
import { isAuthed, logout } from './auth.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IconDashboard, IconSettings, IconSignOut, IconLegal, IconExternal } from '@/components/icons';

function Wordmark({ to }) {
  const inner = (
    <span className="flex items-center gap-2">
      <IconLegal className="h-5 w-5 text-primary" />
      <span className="font-bold tracking-tight text-white">Clause</span>
    </span>
  );
  return to ? <Link to={to} className="shrink-0">{inner}</Link> : <span className="shrink-0">{inner}</span>;
}

function TopBar({ children, subtitle, brandTo }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[hsl(220_13%_9%)]">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-6">
        <Wordmark to={brandTo} />
        <span className="hidden text-sm text-white/50 sm:inline">{subtitle}</span>
        <nav className="ml-auto flex items-center gap-1">{children}</nav>
      </div>
    </header>
  );
}

function NavLink({ to, icon: Icon, children }) {
  const { pathname } = useLocation();
  const active = to === '/legal' ? pathname === '/legal' : pathname.startsWith(to);
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        active ? 'bg-white/10 font-medium text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

function PublicLayout({ children }) {
  return (
    <>
      <TopBar subtitle="Contract intake · Northside Legal Aid">
        <Link
          to="/legal"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <IconDashboard className="h-4 w-4" />
          <span className="hidden sm:inline">Legal dashboard</span>
        </Link>
      </TopBar>
      <main>{children}</main>
    </>
  );
}

function LegalLayout({ children }) {
  const nav = useNavigate();
  return (
    <>
      <TopBar subtitle="Legal — Contract Review" brandTo="/legal">
        <NavLink to="/legal" icon={IconDashboard}>Dashboard</NavLink>
        <NavLink to="/legal/settings" icon={IconSettings}>Settings</NavLink>
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
        >
          <IconExternal className="h-4 w-4" />
          <span className="hidden lg:inline">Intake form</span>
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { logout(); nav('/legal/login'); }}
          className="ml-1 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <IconSignOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </TopBar>
      <main>{children}</main>
    </>
  );
}

function Protected({ children }) {
  if (!isAuthed()) return <Navigate to="/legal/login" replace />;
  return <LegalLayout>{children}</LegalLayout>;
}

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
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
    </TooltipProvider>
  );
}
