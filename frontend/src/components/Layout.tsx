// ============================================================
//  COMPONENTE LAYOUT (components/Layout.tsx)
//  Define la estructura visual base de toda la aplicación autenticada.
//  Divide la pantalla en dos zonas:
//    - Izquierda: Sidebar (menú de navegación)
//    - Derecha:   Header (título + toggle) + área de contenido (children)
//
//  El sidebar se puede mostrar/ocultar con el botón de hamburguesa (☰).
//  Cada página se renderiza como children dentro de esta estructura.
// ============================================================

import { useState, ReactNode } from 'react';
import Sidebar  from './Sidebar';
import { PageId } from '../types';

/** Props que recibe Layout desde App.tsx */
interface Props {
  children:    ReactNode;              // La página activa que se muestra en el área de contenido
  currentPage: PageId;                 // ID de la página actual (para mostrar el título en el header)
  onNavigate:  (page: PageId) => void; // Función para cambiar de página (se pasa al Sidebar)
}

/** Mapa de IDs de página a sus títulos legibles para el header */
const pageTitles: Record<PageId, string> = {
  'punto-de-venta':    'Punto de Venta',
  'facturacion':       'Facturación',
  'articulos':         'Artículos',
  'stock-listado':     'Stock — Listado',
  'alquiler':          'Alquiler',
  'servicios-tecnicos': 'Servicios Técnicos',
  'configuracion':     'Configuración',
};

/**
 * Layout — Estructura visual principal de la app.
 * Controla si el sidebar está expandido o colapsado con el estado `sidebarOpen`.
 */
export default function Layout({ children, currentPage, onNavigate }: Props) {
  // Estado local: controla si el sidebar está visible (true) o colapsado a iconos (false)
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    // Contenedor raíz: ocupa toda la pantalla, flex horizontal
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* SIDEBAR: menú lateral de navegación */}
      <Sidebar isOpen={sidebarOpen} currentPage={currentPage} onNavigate={onNavigate} />

      {/* ÁREA PRINCIPAL: header + contenido */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* HEADER: barra superior con botón de toggle y título de página */}
        <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3 flex-shrink-0">

          {/* Botón hamburguesa ☰ para expandir/colapsar el sidebar */}
          <button
            onClick={() => setSidebarOpen(o => !o)} // Alterna entre true y false
            className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600 flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Separador visual vertical */}
          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

          {/* Título de la página activa (ej: "Punto de Venta", "Facturación") */}
          <h2 className="text-base font-semibold text-gray-800">{pageTitles[currentPage]}</h2>
        </header>

        {/* ÁREA DE CONTENIDO: acá se renderiza la página activa (children) */}
        {/* Cada página controla su propio scroll internamente */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
