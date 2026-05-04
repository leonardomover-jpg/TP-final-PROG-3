import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PageId } from '../types';

interface NavLeaf {
  kind: 'leaf';
  id: PageId;
  label: string;
  indent?: boolean;
}

interface NavDivider {
  kind: 'divider';
  label: string;
}

type NavEntry = NavLeaf | NavDivider;

interface Section {
  key: string;
  label: string;
  defaultPage: PageId;
  icon: JSX.Element;
  entries: NavEntry[];
}

const sections: Section[] = [
  {
    key: 'ventas',
    label: 'Ventas',
    defaultPage: 'punto-de-venta',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
    entries: [
      { kind: 'leaf', id: 'punto-de-venta', label: 'Punto de Venta' },
      { kind: 'leaf', id: 'facturacion',    label: 'Facturación' },
      { kind: 'leaf', id: 'articulos',      label: 'Artículos' },
      { kind: 'divider', label: 'Stock' },
      { kind: 'leaf', id: 'stock-listado',  label: 'Listado', indent: true },
    ],
  },
  {
    key: 'alquiler',
    label: 'Alquiler',
    defaultPage: 'alquiler',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    entries: [
      { kind: 'leaf', id: 'alquiler', label: 'Panel de Alquiler' },
    ],
  },
  {
    key: 'servicios',
    label: 'Servicios Técnicos',
    defaultPage: 'servicios-tecnicos',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
    entries: [
      { kind: 'leaf', id: 'servicios-tecnicos', label: 'Panel de Servicios' },
    ],
  },
];

interface Props {
  isOpen: boolean;
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
}

export default function Sidebar({ isOpen, currentPage, onNavigate }: Props) {
  const { user, logout } = useAuth();
  const [openSections, setOpenSections] = useState<string[]>(['ventas']);

  const toggleSection = (key: string) =>
    setOpenSections(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );

  const isSectionActive = (section: Section) =>
    section.entries.some(e => e.kind === 'leaf' && e.id === currentPage);

  return (
    <aside
      className={`${isOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-gray-900 flex flex-col flex-shrink-0 overflow-hidden`}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            SH
          </div>
          {isOpen && (
            <span className="text-white font-semibold text-sm whitespace-nowrap">SH Servicios</span>
          )}
        </div>
      </div>

      {/* Sections */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {sections.map(section => {
          const sectionOpen = openSections.includes(section.key);
          const sectionActive = isSectionActive(section);

          return (
            <div key={section.key}>
              {/* Section header */}
              <button
                onClick={() =>
                  isOpen ? toggleSection(section.key) : onNavigate(section.defaultPage)
                }
                title={!isOpen ? section.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors
                  ${sectionActive && !isOpen
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
              >
                <span className="flex-shrink-0">{section.icon}</span>
                {isOpen && (
                  <>
                    <span className="flex-1 text-sm font-semibold text-left">{section.label}</span>
                    <svg
                      className={`w-4 h-4 flex-shrink-0 transition-transform ${sectionOpen ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                )}
              </button>

              {/* Sub-items (accordion) */}
              {isOpen && sectionOpen && (
                <div className="bg-gray-950 pb-1">
                  {section.entries.map((entry, i) => {
                    if (entry.kind === 'divider') {
                      return (
                        <p key={i} className="px-7 pt-2 pb-0.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          {entry.label}
                        </p>
                      );
                    }
                    return (
                      <button
                        key={entry.id}
                        onClick={() => onNavigate(entry.id)}
                        className={`w-full flex items-center gap-2 text-left py-2 text-sm transition-colors
                          ${entry.indent ? 'pl-10 pr-4' : 'pl-7 pr-4'}
                          ${currentPage === entry.id
                            ? 'text-blue-400 font-semibold bg-gray-800'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                          }`}
                      >
                        <span className="w-1 h-1 rounded-full bg-current flex-shrink-0" />
                        {entry.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom: Configuración + user + logout */}
      <div className="border-t border-gray-700 flex-shrink-0">
        <button
          onClick={() => onNavigate('configuracion')}
          title={!isOpen ? 'Configuración' : undefined}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
            ${currentPage === 'configuracion'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {isOpen && <span className="font-medium">Configuración</span>}
        </button>

        {isOpen && user && (
          <div className="px-4 py-2 border-t border-gray-800">
            <p className="text-white text-xs font-medium truncate">{user.email}</p>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${
              user.role === 'Admin' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}>
              {user.role}
            </span>
          </div>
        )}

        <button
          onClick={logout}
          title={!isOpen ? 'Salir' : undefined}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors text-sm"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          {isOpen && <span>Salir</span>}
        </button>
      </div>
    </aside>
  );
}
