import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {  Menu, Store, Wrench, X, Home, Users, UserCircle, Map, LogOut, Bell, MessageSquare, Headphones, Briefcase, History, Contact , Package, Settings, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import EmployeeLocationTracker from './EmployeeLocationTracker';

export default function Layout() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isAdmin, isManager, isClient, userProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Client Selection State
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch available clients if the user is a client
    if (!userProfile) return;

    const fetchAllClients = async () => {
      if (isClient || userProfile.role === 'client' || userProfile.clientId) {
        try {
          const cleanedProfilePhone = (userProfile.phone || '').replace(/\D/g, '');
          const { data: clientsData } = await supabase.from('clients').select('id, name, phone, cpf_cnpj');
          
          if (clientsData) {
            const matchedClients = clientsData.filter(c => {
              const cleanedClientPhone = (c.phone || '').replace(/\D/g, '');
              const cleanedClientCpf = (c.cpf_cnpj || '').replace(/\D/g, '');
              return cleanedClientPhone === cleanedProfilePhone || 
                     cleanedClientCpf === cleanedProfilePhone || 
                     c.id === userProfile.clientId;
            });
            
            setAvailableClients(matchedClients);
            if (matchedClients.length > 0 && !selectedClientId) {
              setSelectedClientId(matchedClients[0].id);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    fetchAllClients();
  }, [userProfile, isClient]);

  
  // Escuta novas visitas (e limpezas avulsas) agendadas para este técnico ou admin
  useEffect(() => {
    if (!userProfile) return;

    const requestPerms = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.requestPermissions();
        } catch (e) {
          console.error("Local notifications permission error", e);
        }
      } else if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission().catch(() => {});
      }
    };
    requestPerms();

    const showNotification = async (title: string, body: string) => {
      if (Capacitor.isNativePlatform()) {
        try {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: new Date().getTime(),
                schedule: { at: new Date(Date.now() + 1000) }
              }
            ]
          });
        } catch (e) {
          console.error("Capacitor local notification error", e);
        }
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
              registration.showNotification(title, {
                body,
                icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png',
              });
            });
          } else {
            new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/123/123382.png' });
          }
        }
      }
    };

    const handleNewVisit = (payload: any) => {
      if (payload.new) {
        const isAssignedToMe = payload.new.employee_id === userProfile.uid;
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        if (isAssignedToMe || isAdminOwner) {
          const msg = isAssignedToMe 
            ? 'Você tem uma nova visita/manutenção agendada para hoje!'
            : 'Uma nova visita foi criada no sistema.';
          showNotification('Nova Visita Agendada', msg);
        }
      }
    };

    const handleNewJob = (payload: any) => {
      if (payload.new) {
        const isAssignedToMe = payload.new.employee_id === userProfile.uid;
        const isAdminOwner = userProfile.role === 'admin' && payload.new.admin_id === userProfile.uid;
        if (isAssignedToMe || isAdminOwner) {
          const msg = isAssignedToMe
            ? 'Um novo serviço avulso foi agendado para você!'
            : 'Um novo serviço avulso foi criado no sistema.';
          showNotification('Novo Serviço Avulso', msg);
        }
      }
    };

    const channel = supabase.channel('employee-notifications-fix')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visits' }, handleNewVisit)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'oneoffjobs' }, handleNewJob)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile]);

  useEffect(() => {
    // Solicita permissões de notificação e localização ativamente
    // Isso forçará o WebView ou app Wrapper no Android a exibir os dialogs
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    
    // Tenta obter a localização apenas uma vez logo no início para ativar a permissão
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, { timeout: 5000 });
    }
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  let navItems: { name: string; path: string; icon: any; id?: string }[] = isClient ? [
    { name: 'Meu Painel', path: '/client-panel', icon: Home },
    { name: 'Lojas Parceiras', path: '/partners', icon: Store },
    { name: 'Técnicos Parceiros', path: '/technicians', icon: Wrench }
  ] : (isAdmin || isManager)
    ? [
        { name: 'Dashboard', path: '/dashboard', icon: Home },
        { name: 'Clientes', path: '/clients', icon: Users },
        { name: 'Produtos', path: '/products', icon: Package },
        { name: 'Agenda', path: '/agenda', icon: Contact },
        { name: 'Cobranças', path: '/billing', icon: Bell },
        { name: 'Mensagens', path: '/messages', icon: MessageSquare },
        { name: 'Colaboradores', path: '/employees', icon: UserCircle },
        { name: 'Rotas', path: '/routes', icon: Map },
        { name: 'Visitas', path: '/visits', icon: History },
        { name: 'Avulsos', path: '/one-off-jobs', icon: Briefcase },
        // Will add Settings dynamically below
      ]
    : [
        { name: 'Rotas', path: '/routes', icon: Map },
        { name: 'Produtos', path: '/products', icon: Package },
      ];

  if (isAdmin) {
    navItems.push({ name: 'Configurações', path: '/settings', icon: Settings });
    navItems.push({ name: 'Lojas Parceiras', path: '/partners', icon: Store, id: 'tour-partners' });
    navItems.push({ name: 'Tour do Sistema', path: '/tour', icon: HelpCircle });
    navItems.push({ name: 'Técnicos Parceiros', path: '/technicians', icon: Wrench, id: 'tour-technicians' });
  }

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
        <div className="flex flex-col bg-primary shadow-md shrink-0">
          <div className="flex items-center justify-between h-16 px-6">
            <span className="text-2xl font-bold text-secondary-light tracking-wide truncate max-w-[200px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
            <button onClick={() => setIsDrawerOpen(false)} className="lg:hidden text-white hover:text-gray-200 transition-colors">
              <X size={24} />
            </button>
          </div>
          {userProfile?.whatsappSettings?.companyLogo && (
            <div className="w-full aspect-square bg-white overflow-hidden border-b border-gray-200">
              <img 
                key={userProfile.whatsappSettings.companyLogo} 
                src={userProfile.whatsappSettings.companyLogo} 
                alt="Logo" 
                className="w-full h-full object-cover" 
                onError={(e) => { e.currentTarget.style.display = "none"; }} 
              />
            </div>
          )}
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
              <div key={item.name}>
                <Link
                  id={item.id}
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
                
                {/* Client Selection List (If client has multiple profiles) */}
                {item.name === 'Meu Painel' && isClient && availableClients.length > 1 && (
                  <div className="mt-2 ml-4 pl-4 border-l border-primary-light/20 space-y-1">
                    <div className="text-[10px] font-bold text-primary-light uppercase tracking-wider mb-2 mt-2">
                      Meus Cadastros
                    </div>
                    {availableClients.map(client => (
                      <button
                        key={client.id}
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setIsDrawerOpen(false); // Close drawer on mobile after selection
                        }}
                        className={clsx(
                          "flex items-center w-full px-3 py-2 rounded-lg transition-all duration-200 text-left",
                          selectedClientId === client.id
                            ? "bg-primary/30 text-white shadow-sm ring-1 ring-primary-light/30"
                            : "text-gray-400 hover:bg-primary/30 hover:text-white"
                        )}
                      >
                        <Users size={14} className={clsx(
                          "mr-2 shrink-0",
                          selectedClientId === client.id ? "text-secondary-light" : "text-gray-500"
                        )} />
                        <span className="text-xs font-medium truncate">{client.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pb-16 lg:pb-0">
        <header className="bg-white shadow-sm h-16 flex items-center px-4 lg:hidden shrink-0">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-gray-500 hover:text-primary transition-colors focus:outline-none p-2 -ml-2"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center space-x-2 ml-2">
            <span className="text-lg font-bold text-primary truncate max-w-[150px]">{userProfile?.whatsappSettings?.companyName || "GestãoPro"}</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto bg-gray-100">
          <Outlet context={{ availableClients, selectedClientId }} />
        </main>
        
        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex justify-around items-center z-40 px-2 pb-safe">
          {(isClient ? [
             { name: 'Painel', path: '/client-panel', icon: Home },
             { name: 'Lojas', path: '/partners', icon: Store },
             { name: 'Técnicos', path: '/technicians', icon: Wrench }
           ] : (isAdmin || isManager) ? [
             { name: 'Painel', path: '/dashboard', icon: Home },
             { name: 'Clientes', path: '/clients', icon: Users },
             { name: 'Rotas', path: '/routes', icon: Map },
             { name: 'Mensagens', path: '/messages', icon: MessageSquare }
           ] : [
             { name: 'Rotas', path: '/routes', icon: Map },
             { name: 'Produtos', path: '/products', icon: Package }
           ]).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                  isActive ? "text-primary" : "text-gray-500 hover:text-primary"
                )}
              >
                <Icon size={20} className={isActive ? "text-primary" : ""} />
                <span className="text-[10px] font-medium leading-none truncate w-full text-center px-1">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
