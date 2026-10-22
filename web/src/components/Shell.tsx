import { BookOpen, ClipboardList, Factory, LogOut, Scale, Settings, Shield } from 'lucide-react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { cn, pretty } from '../lib/utils';

const links = [
  { to: '/', label: 'My requests', roles: ['EMPLOYEE', 'TECHNICIAN', 'MANAGER', 'ADMIN'], icon: ClipboardList },
  { to: '/queue', label: 'Technician queue', roles: ['TECHNICIAN', 'MANAGER', 'ADMIN'], icon: Factory },
  { to: '/operations', label: 'Operations', roles: ['TECHNICIAN', 'MANAGER', 'ADMIN'], icon: Scale },
  { to: '/knowledge', label: 'Knowledge', roles: ['TECHNICIAN', 'MANAGER', 'ADMIN'], icon: BookOpen },
  { to: '/admin', label: 'Administration', roles: ['MANAGER', 'ADMIN'], icon: Settings },
];

export function homeFor(role: string): string {
  if (role === 'EMPLOYEE') return '/';
  if (role === 'TECHNICIAN') return '/queue';
  return '/operations';
}

export function Shell() {
  const { user, loading, logout } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-muted">Opening the desk…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="grid min-h-screen grid-cols-[250px_1fr]">
      <aside className="flex flex-col bg-pine-deep text-[#efe8dc]">
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2 text-xs tracking-[0.16em] text-[#d7c4a8]">
            <Shield size={14} /> NORTHLINE
          </div>
          <div className="mt-2 font-serif text-2xl">Service desk</div>
          <p className="mt-2 text-xs leading-5 text-[#c9bfb0]">Manufacturing IT requests, classified and answered with retrieved evidence.</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {links.filter((link) => link.roles.includes(user.role)).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => cn('flex items-center gap-2 rounded-md px-3 py-2 text-sm', isActive ? 'bg-white/10 text-white' : 'text-[#d9d0c3] hover:bg-white/5')}
            >
              <link.icon size={16} /> {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-sm">
          <div className="font-medium">{user.name}</div>
          <div className="text-xs text-[#c9bfb0]">{pretty(user.role)} · {user.plant}</div>
          <button className="mt-3 inline-flex items-center gap-2 text-xs text-[#e7d3bc]" onClick={logout} type="button">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-8 py-7">
        <Outlet />
      </main>
    </div>
  );
}
