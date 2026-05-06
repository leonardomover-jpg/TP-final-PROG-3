// ============================================================
//  COMPONENTE RAÍZ DE LA APLICACIÓN (App.tsx)
//  Es el componente principal que organiza toda la app.
//  Decide qué mostrar según si el usuario está logueado o no,
//  y qué página renderizar según la navegación del sidebar.
//
//  Estructura:
//    App
//    └── AuthProvider (provee contexto de autenticación)
//        └── AppContent (lógica de navegación y renderizado)
//            ├── Si NO logueado → Login o Register
//            └── Si logueado   → Layout + página activa
// ============================================================

import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';

// Componentes de autenticación (pantallas antes de ingresar al sistema)
import Login    from './components/Login';
import Register from './components/Register';

// Layout principal: contiene el sidebar y el header
import Layout from './components/Layout';

// Páginas del sistema (cada una es una sección del menú)
import PuntoDeVenta      from './pages/PuntoDeVenta';
import Facturacion       from './pages/Facturacion';
import Articulos         from './pages/Articulos';
import StockListado      from './pages/StockListado';
import Alquiler          from './pages/Alquiler';
import ServiciosTecnicos from './pages/ServiciosTecnicos';
import Configuracion     from './pages/Configuracion';

import { PageId } from './types';

/**
 * AppContent — Lógica principal de navegación y autenticación.
 * Separado de App para poder usar useAuth() dentro del AuthProvider.
 * (useAuth necesita estar dentro de un AuthProvider para funcionar)
 */
function AppContent() {
  const { user } = useAuth(); // Obtenemos el usuario del contexto global

  // Controla si mostramos Login o Register (cuando el usuario no está logueado)
  const [showRegister, setShowRegister] = useState(false);

  // Página actualmente activa en el sidebar (por defecto: Punto de Venta)
  const [currentPage, setCurrentPage] = useState<PageId>('punto-de-venta');

  // ── Guard: si no hay usuario autenticado, mostramos auth screens ─────
  if (!user) {
    return showRegister
      ? <Register onToggle={() => setShowRegister(false)} />  // Pantalla de registro
      : <Login    onToggle={() => setShowRegister(true)} />;  // Pantalla de login
  }

  /**
   * renderPage — Elige qué componente de página mostrar según `currentPage`.
   * Funciona como un router simple sin librería externa.
   * El Sidebar llama a onNavigate() para cambiar `currentPage` y re-renderizar.
   */
  const renderPage = () => {
    switch (currentPage) {
      case 'punto-de-venta':     return <PuntoDeVenta />;
      case 'facturacion':        return <Facturacion />;
      case 'articulos':          return <Articulos />;
      case 'stock-listado':      return <StockListado />;
      case 'alquiler':           return <Alquiler />;
      case 'servicios-tecnicos': return <ServiciosTecnicos />;
      case 'configuracion':      return <Configuracion />;
    }
  };

  // ── Usuario logueado: mostramos el sistema completo ──────────────────
  return (
    // Layout envuelve el sidebar + header, y dentro renderiza la página activa
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

/**
 * App — Componente raíz exportado.
 * Envuelve todo con AuthProvider para que el contexto de autenticación
 * esté disponible en todos los componentes hijos de la app.
 */
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
