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
import Messages from './pages/Messages';
import Chat from './pages/Chat';
import ClientPanel from './pages/ClientPanel';
import OneOffJobs from './pages/OneOffJobs';
import VisitsHistory from './pages/VisitsHistory';
import SubscriptionWall from './pages/SubscriptionWall';
import SuperAdminPage from './pages/SuperAdminPage';
import Layout from './components/Layout';

const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: ('admin' | 'employee' | 'manager' | 'client')[] }) => {
  const { currentUser, userProfile, loading, isSubscriptionExpired } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
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
            <Route path="messages" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><Messages /></ProtectedRoute>} />
            <Route path="chat" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'employee']}><Chat /></ProtectedRoute>} />
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
