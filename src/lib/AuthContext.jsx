import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44, MODO_LOCAL, MODO_SUPABASE, fijarUsuarioActual, registrarIngreso } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  const isPublicRoute = window.location.pathname === '/bitacora-publica';

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    // En modo local no hay plataforma que consultar: el usuario sale del
    // respaldo y se elige con el selector de arriba a la derecha.
    if (MODO_LOCAL) {
      setAppPublicSettings({});
      setIsLoadingPublicSettings(false);
      // Sin cuenta elegida se entra por la pantalla de Bienvenida, igual que
      // en produccion — asi el modo local tambien sirve para revisar el
      // arranque de sesion y no solo las pantallas de adentro.
      const { haySesion } = await import('@/api/local/compat');
      if (!haySesion()) {
        setAuthError({ type: 'auth_required', message: 'Elige una cuenta' });
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        return;
      }
      await checkUserAuth();
      return;
    }

    // Fuera del modo local la sesion vive en Supabase Auth. Aca antes venia
    // todo el arranque contra la plataforma de Base44 (/api/apps/public, sus
    // codigos de error auth_required y user_not_registered): ~85 lineas que
    // desde la migracion ya no se ejecutaban nunca, porque el corte de arriba
    // devolvia antes. Se fueron junto con el SDK.
    setAppPublicSettings({});
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();

      if (!currentUser || !currentUser.email) {
        setIsLoadingAuth(false);
        setIsAuthenticated(false);
        // En Supabase, "sin perfil" con sesión activa es distinto de "sin
        // sesión": la cuenta de auth.users existe pero no hay fila en
        // `usuario` enlazada (ver auth_id en 03_policies.sql).
        if (MODO_SUPABASE && await base44.auth.isAuthenticated()) {
          setAuthError({ type: 'user_not_registered', message: 'Tu cuenta no está vinculada a un perfil del sistema' });
        } else {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
        return;
      }

      setUser(currentUser);
      // El cliente necesita el rol para bloquear escrituras del Monitor
      // Corporativo en todas las pantallas, y la identidad para firmar cada
      // escritura en la auditoria (ver base44Client.js).
      fijarUsuarioActual(currentUser);
      // Deja el ingreso anotado en Auditoria — el propio incluido.
      // El nombre y el rol los pone el servidor a partir del token: no viajan
      // desde aca, para que no se pueda anotar un ingreso ajeno.
      registrarIngreso({ email: currentUser.email });
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      if (!isPublicRoute) {
        const reason = error?.data?.extra_data?.reason;
        if (reason === 'user_not_registered') {
          setAuthError({ type: 'user_not_registered', message: 'User not registered for this app' });
        } else {
          setAuthError({ type: 'auth_required', message: 'Authentication required' });
        }
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      base44.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      // Releer la ficha del usuario sin recargar la pagina. Lo usa la pantalla
      // donde el chofer actualiza su licencia: sin esto el estado de arriba
      // seguiria mostrando la fecha vieja hasta el siguiente ingreso.
      refreshUser: checkUserAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};