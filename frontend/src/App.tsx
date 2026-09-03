import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/common/Header';
import { ProtectedRoute } from './components/common/ProtectedRoute';

import { LoginPage } from './pages/LoginPage';
import { EquipmentListPage } from './pages/EquipmentListPage';
import { EquipmentProfilePage } from './pages/EquipmentProfilePage';
import { AdminPortalPage } from './pages/AdminPortalPage';
import { DemoLabPage } from './pages/DemoLabPage';

const RootRedirect: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/equipment' : '/login'} replace />;
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
          <Header />
          <main className="flex-1">
            <Routes>
              {/* Root route decision */}
              <Route path="/" element={<RootRedirect />} />

              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/equipment/:qrToken" element={<EquipmentProfilePage />} />
              <Route path="/demo" element={<DemoLabPage />} />

              {/* Protected Routes (Require login) */}
              <Route
                path="/equipment"
                element={
                  <ProtectedRoute roles={['Admin', 'Technician', 'Viewer']}>
                    <EquipmentListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute roles={['Admin', 'Technician']}>
                    <AdminPortalPage />
                  </ProtectedRoute>
                }
              />

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
