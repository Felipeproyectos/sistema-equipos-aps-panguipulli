import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import PageNotFound from './lib/PageNotFound';
import ErrorBoundary from './lib/ErrorBoundary';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

import Centros from './pages/Centros';
import Equipos2 from './pages/Equipos2';
import Actividades from './pages/Actividades';
import AlertasV2 from './pages/AlertasV2';
import SolicitudesV2 from './pages/SolicitudesV2';
import Reportes from './pages/Reportes';
import PublicBitacora from './pages/PublicBitacora';
import RevisionInspecciones from './pages/RevisionInspecciones';
import Bienvenida from './pages/Bienvenida';
import Auditoria from './pages/Auditoria';
import Taller from './pages/Taller';
import Proveedores from './pages/Proveedores';
import Repuestos from './pages/Repuestos';
import MonitorCorporativo from './pages/MonitorCorporativo';
import Usuarios from './pages/Usuarios';
import OrdenTrabajoDetalle from './pages/OrdenTrabajoDetalle';
import AprobacionRepuestos from './pages/AprobacionRepuestos';
import OrdenesTrabajo from './pages/OrdenesTrabajo';
import SolicitudRepuestos from './pages/SolicitudRepuestos';
import ComprasTablero from './pages/ComprasTablero';
import ComprasSaludTablero from './pages/ComprasSaludTablero';
const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const PageWrapper = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, x: 24 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -24 }}
    transition={{ duration: 0.22, ease: "easeInOut" }}
    style={{ width: "100%" }}
  >
    <ErrorBoundary>{children}</ErrorBoundary>
  </motion.div>
);

const AnimatedRoutes = ({ children }) => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>
        {children}
      </Routes>
    </AnimatePresence>
  );
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, isAuthenticated } = useAuth();


  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Mostrar página de bienvenida personalizada en lugar del login de Base44
      return <Bienvenida />;
    } else {
      navigateToLogin();
      return null;
    }
  }

  // Rutas públicas no requieren aprobación de acceso.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPublic = pathname === '/bitacora-publica' || pathname.startsWith('/bitacora-publica/');


  // Render the main app
  return (
    <AnimatedRoutes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <PageWrapper><MainPage /></PageWrapper>
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <PageWrapper><Page /></PageWrapper>
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/Centros" element={<LayoutWrapper currentPageName="Centros"><PageWrapper><Centros /></PageWrapper></LayoutWrapper>} />
      <Route path="/Equipos2" element={<LayoutWrapper currentPageName="Equipos2"><PageWrapper><Equipos2 /></PageWrapper></LayoutWrapper>} />
      <Route path="/Actividades" element={<LayoutWrapper currentPageName="Actividades"><PageWrapper><Actividades /></PageWrapper></LayoutWrapper>} />
      <Route path="/AlertasV2" element={<LayoutWrapper currentPageName="AlertasV2"><PageWrapper><AlertasV2 /></PageWrapper></LayoutWrapper>} />
      <Route path="/SolicitudesV2" element={<LayoutWrapper currentPageName="SolicitudesV2"><PageWrapper><SolicitudesV2 /></PageWrapper></LayoutWrapper>} />
      <Route path="/Reportes" element={<LayoutWrapper currentPageName="Reportes"><PageWrapper><Reportes /></PageWrapper></LayoutWrapper>} />
      <Route path="/bitacora-publica" element={<PublicBitacora />} />
      <Route path="/bienvenida" element={<Bienvenida />} />
      <Route path="/RevisionInspecciones" element={<LayoutWrapper currentPageName="RevisionInspecciones"><PageWrapper><RevisionInspecciones /></PageWrapper></LayoutWrapper>} />
      <Route path="/Auditoria" element={<LayoutWrapper currentPageName="Auditoria"><PageWrapper><Auditoria /></PageWrapper></LayoutWrapper>} />
      <Route path="/Taller" element={<LayoutWrapper currentPageName="Taller"><PageWrapper><Taller /></PageWrapper></LayoutWrapper>} />
      <Route path="/Proveedores" element={<LayoutWrapper currentPageName="Proveedores"><PageWrapper><Proveedores /></PageWrapper></LayoutWrapper>} />
      <Route path="/Repuestos" element={<LayoutWrapper currentPageName="Repuestos"><PageWrapper><Repuestos /></PageWrapper></LayoutWrapper>} />
      <Route path="/MonitorCorporativo" element={<LayoutWrapper currentPageName="MonitorCorporativo"><PageWrapper><MonitorCorporativo /></PageWrapper></LayoutWrapper>} />
      <Route path="/Usuarios" element={<LayoutWrapper currentPageName="Usuarios"><PageWrapper><Usuarios /></PageWrapper></LayoutWrapper>} />
      <Route path="/OrdenTrabajoDetalle/:id" element={<LayoutWrapper currentPageName="OrdenTrabajoDetalle"><PageWrapper><OrdenTrabajoDetalle /></PageWrapper></LayoutWrapper>} />
      <Route path="/AprobacionRepuestos" element={<LayoutWrapper currentPageName="AprobacionRepuestos"><PageWrapper><AprobacionRepuestos /></PageWrapper></LayoutWrapper>} />
      <Route path="/OrdenesTrabajo" element={<LayoutWrapper currentPageName="OrdenesTrabajo"><PageWrapper><OrdenesTrabajo /></PageWrapper></LayoutWrapper>} />
      <Route path="/SolicitudRepuestos" element={<LayoutWrapper currentPageName="SolicitudRepuestos"><PageWrapper><SolicitudRepuestos /></PageWrapper></LayoutWrapper>} />
      <Route path="/ComprasTablero" element={<LayoutWrapper currentPageName="ComprasTablero"><PageWrapper><ComprasTablero /></PageWrapper></LayoutWrapper>} />
      <Route path="/ComprasSaludTablero" element={<LayoutWrapper currentPageName="ComprasSaludTablero"><PageWrapper><ComprasSaludTablero /></PageWrapper></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </AnimatedRoutes>
  );
};


function App() {
  // Detect public route BEFORE any auth logic runs
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isPublicBitacora = pathname === '/bitacora-publica' || pathname.startsWith('/bitacora-publica/');

  if (isPublicBitacora) {
    return (
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/bitacora-publica" element={<PublicBitacora />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    );
  }

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App