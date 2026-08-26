import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientForm from './pages/ClientForm';
import Employees from './pages/Employees';
import EmployeeForm from './pages/EmployeeForm';
import RoutesPage from './pages/RoutesPage';
import Billing from './pages/Billing';
import SuppliesForm from './pages/SuppliesForm';
import ProductsPage from './pages/ProductsPage';
import Messages from './pages/Messages';
import ClientPanel from './pages/ClientPanel';
import OneOffJobs from './pages/OneOffJobs';
import VisitsHistory from './pages/VisitsHistory';
import SubscriptionWall from './pages/SubscriptionWall';
import SuperAdminPage from './pages/SuperAdminPage';
import Agenda from './pages/Agenda';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: ('admin' | 'employee' | 'manager' | 'client')[] }) => {
  const { currentUser, userProfile, loading, isSubscriptionExpired } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-gray-50/80 backdrop-blur-sm">
        <div className="flex flex-col items-center space-y-6">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-xl ring-8 ring-blue-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-400">
              <span className="h-3 w-3 rounded-full bg-white animate-ping"></span>
            </div>
          </div>
          <div className="flex flex-col items-center space-y-2 text-center animate-pulse">
            <h3 className="text-xl font-bold text-gray-900 tracking-tight">GestãoPro</h3>
            <p className="text-sm font-medium text-gray-500">Preparando painel...</p>
          </div>
        </div>
      </div>
    );
  }
  if (!currentUser || !userProfile) return <Navigate to="/login" />;
  
  if (isSubscriptionExpired && userProfile.role !== 'client') {
    return <SubscriptionWall />;
  }

  if (allowedRoles && !allowedRoles.includes(userProfile.role)) {
    if (userProfile.role === 'client') return <Navigate to="/client-panel" />;
    return <Navigate to="/routes" />;
  }

  return <>{children}</>;
};

export default function App() {

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id');
    const status = params.get('status');
    
    if (paymentId && status === 'approved') {
      console.log('Payment returned, syncing...');
      fetch('/api/sync-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId })
      }).then(res => res.json()).then(data => {
        if (data.success) {
          // Remove query params
          window.history.replaceState({}, document.title, window.location.pathname);
          // Reload to fetch new subscription state
          window.location.reload();
        }
      }).catch(err => console.error('Failed to sync payment:', err));
    }
  }, []);
  
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Dashboard /></ProtectedRoute>} />
            <Route path="clients" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}><Clients /></ProtectedRoute>} />
            <Route path="clients/new" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><ClientForm /></ProtectedRoute>} />
            <Route path="clients/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><ClientForm /></ProtectedRoute>} />
            <Route path="clients/:id/supplies" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}><SuppliesForm /></ProtectedRoute>} />
            <Route path="products" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}><ProductsPage /></ProtectedRoute>} />
            <Route path="messages" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Messages /></ProtectedRoute>} />
            <Route path="agenda" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Agenda /></ProtectedRoute>} />
            <Route path="employees" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Employees /></ProtectedRoute>} />
            <Route path="employees/new" element={<ProtectedRoute allowedRoles={['admin']}><EmployeeForm /></ProtectedRoute>} />
            <Route path="employees/:id" element={<ProtectedRoute allowedRoles={['admin']}><EmployeeForm /></ProtectedRoute>} />
            <Route path="billing" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Billing /></ProtectedRoute>} />
            <Route path="routes" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}><RoutesPage /></ProtectedRoute>} />
            <Route path="visits" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><VisitsHistory /></ProtectedRoute>} />
            <Route path="one-off-jobs" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><OneOffJobs /></ProtectedRoute>} />
            <Route path="client-panel" element={<ProtectedRoute allowedRoles={['client']}><ClientPanel /></ProtectedRoute>} />
            <Route path="superadmin" element={<ProtectedRoute allowedRoles={['admin']}><SuperAdminPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
