import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { Menu, X, Home, Users, UserCircle, Map, LogOut, Bell, MessageSquare, Headphones, Briefcase, History } from 'lucide-react';
import clsx from 'clsx';
import EmployeeLocationTracker from './EmployeeLocationTracker';

export default function Layout() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isAdmin, isManager, isClient, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  let navItems = isClient ? [
    { name: 'Meu Painel', path: '/client-panel', icon: Home }
  ] : (isAdmin || isManager)
    ? [
        { name: 'Dashboard', path: '/', icon: Home },
        { name: 'Clientes', path: '/clients', icon: Users },
        { name: 'Cobranças', path: '/billing', icon: Bell },
        { name: 'Mensagens', path: '/messages', icon: MessageSquare },
        { name: 'Contatos', path: '/chat', icon: Headphones },
        { name: 'Colaboradores', path: '/employees', icon: UserCircle },
        { name: 'Rotas', path: '/routes', icon: Map },
        { name: 'Visitas', path: '/visits', icon: History },
        { name: 'Avulsos', path: '/one-off-jobs', icon: Briefcase },
      ]
    : [
        { name: 'Rotas', path: '/routes', icon: Map },
        { name: 'Clientes', path: '/clients', icon: Users },
        { name: 'Contatos', path: '/chat', icon: Headphones },
      ];

  if (userProfile?.email === 'servincg@gmail.com') {
    navItems.push({ name: 'SuperAdmin', path: '/superadmin', icon: Briefcase });
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <EmployeeLocationTracker />
      {/* Mobile drawer overlay */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-72 bg-primary-dark text-white flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 shadow-2xl lg:shadow-none",
          isDrawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-6 bg-primary shadow-md shrink-0">
          <div className="flex items-center space-x-2">
            <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-2xl font-bold text-secondary-light tracking-wide">GestãoPro</span>
          </div>
          <button onClick={() => setIsDrawerOpen(false)} className="lg:hidden text-white hover:text-gray-200 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* User Profile Section */}
        <div className="p-6 bg-primary-dark border-b border-primary-light/20 shrink-0">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-secondary-light font-bold text-xl shadow-inner">
              {userProfile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{userProfile?.name}</p>
              <p className="text-xs text-secondary-light uppercase tracking-wider mt-1 font-semibold">
                {userProfile?.role === 'admin' ? 'Administrador' : userProfile?.role === 'manager' ? 'Gestor' : userProfile?.role === 'client' ? 'Cliente' : 'Colaborador'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <div className="text-xs font-bold text-primary-light uppercase tracking-wider mb-4 px-2">
            Menu Principal
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={() => setIsDrawerOpen(false)}
                className={clsx(
                  "flex items-center px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive 
                    ? "bg-primary text-white shadow-md" 
                    : "text-gray-300 hover:bg-primary/40 hover:text-white"
                )}
              >
                <Icon 
                  size={20} 
                  className={clsx(
                    "mr-3 transition-colors duration-200",
                    isActive ? "text-secondary-light" : "text-gray-400 group-hover:text-secondary-light"
                  )} 
                />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-primary-light/20 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-gray-300 rounded-xl hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
          >
            <LogOut size={20} className="mr-3 text-gray-400 group-hover:text-red-400 transition-colors" />
            <span className="font-medium">Sair do Sistema</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white shadow-sm h-16 flex items-center px-4 lg:hidden shrink-0">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-gray-500 hover:text-primary transition-colors focus:outline-none p-2 -ml-2"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center space-x-2 ml-2">
            <img src="/logo.png" alt="Logo" className="w-6 h-6 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="text-lg font-bold text-primary">GestãoPro</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto bg-gray-100">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
