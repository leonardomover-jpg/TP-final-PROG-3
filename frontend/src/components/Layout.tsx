import { useState, ReactNode } from 'react';
import Sidebar from './Sidebar';
import { PageId } from '../types';

interface Props {
  children: ReactNode;
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

const pageTitles: Record<PageId, string> = {
  'punto-de-venta':   'Punto de Venta',
  'facturacion':      'Facturación',
  'articulos':        'Artículos',
  'stock-listado':    'Stock — Listado',
  'alquiler':         'Alquiler',
  'servicios-tecnicos': 'Servicios Técnicos',
  'configuracion':    'Configuración',
};

export default function Layout({ children, currentPage, onNavigate }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar isOpen={sidebarOpen} currentPage={currentPage} onNavigate={onNavigate} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="p-2 rounded-lg hover:bg-gray-100 transition text-gray-600 flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="h-5 w-px bg-gray-200 flex-shrink-0" />
          <h2 className="text-base font-semibold text-gray-800">{pageTitles[currentPage]}</h2>
        </header>

        {/* Cada página controla su propio scroll */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
}
