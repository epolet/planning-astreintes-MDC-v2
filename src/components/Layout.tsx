import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Users,
  Settings,
  Sparkles,
  BarChart2,
  Heart,
  Menu,
  X,
  Building2,
  LogOut,
} from 'lucide-react';
import PeriodSelector from './PeriodSelector';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de Bord' },
  { to: '/calendrier', icon: Calendar, label: 'Calendrier' },
  { to: '/planning', icon: ClipboardList, label: 'Planning' },
  { to: '/equite', icon: BarChart2, label: 'Recap Equite' },
  { to: '/voeux', icon: Heart, label: 'Voeux' },
  { to: '/cadres', icon: Users, label: 'Cadres' },
  { to: '/parametres', icon: Settings, label: 'Parametres' },
  { to: '/generer', icon: Sparkles, label: 'Generer' },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 transform transition-transform duration-300 ease-in-out md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700/50">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-sm tracking-wide">Musee Planning</h1>
            <p className="text-slate-400 text-xs">Astreintes & Permanences</p>
          </div>
        </div>

        <div className="px-3 mt-4 mb-2">
          <PeriodSelector />
        </div>

        <nav className="mt-2 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-[18px] h-[18px] flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 px-4 py-4 border-t border-slate-700/50 space-y-3">
          <button
            onClick={() => {
              sessionStorage.removeItem('museum_auth');
              window.location.reload();
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            Deconnexion
          </button>
        </div>
      </aside>

      <div className="md:ml-64 min-h-screen flex flex-col">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
