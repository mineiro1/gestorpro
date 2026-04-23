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
import Layout from './components/Layout';

const ProtectedRoute = ({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) => {
  const { currentUser, isAdmin, loading } = useAuth();

  if (loading) return <div className="flex h-screen items-center justify-center">Carregando...</div>;
  if (!currentUser) return <Navigate to="/login" />;
  if (requireAdmin && !isAdmin) return <Navigate to="/routes" />; // Employees only have access to routes

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
            <Route index element={<ProtectedRoute requireAdmin><Dashboard /></ProtectedRoute>} />
            <Route path="clients" element={<ProtectedRoute requireAdmin><Clients /></ProtectedRoute>} />
            <Route path="clients/new" element={<ProtectedRoute requireAdmin><ClientForm /></ProtectedRoute>} />
            <Route path="clients/:id" element={<ProtectedRoute requireAdmin><ClientForm /></ProtectedRoute>} />
            <Route path="clients/:id/supplies" element={<ProtectedRoute requireAdmin><SuppliesForm /></ProtectedRoute>} />
            <Route path="employees" element={<ProtectedRoute requireAdmin><Employees /></ProtectedRoute>} />
            <Route path="employees/new" element={<ProtectedRoute requireAdmin><EmployeeForm /></ProtectedRoute>} />
            <Route path="employees/:id" element={<ProtectedRoute requireAdmin><EmployeeForm /></ProtectedRoute>} />
            <Route path="billing" element={<ProtectedRoute requireAdmin><Billing /></ProtectedRoute>} />
            <Route path="routes" element={<RoutesPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
