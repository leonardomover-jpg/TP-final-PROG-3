import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Layout from './components/Layout';
import PuntoDeVenta from './pages/PuntoDeVenta';
import Facturacion from './pages/Facturacion';
import Articulos from './pages/Articulos';
import StockListado from './pages/StockListado';
import Alquiler from './pages/Alquiler';
import ServiciosTecnicos from './pages/ServiciosTecnicos';
import Configuracion from './pages/Configuracion';
import { PageId } from './types';

function AppContent() {
  const { user } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [currentPage, setCurrentPage] = useState<PageId>('punto-de-venta');

  if (!user) {
    return showRegister
      ? <Register onToggle={() => setShowRegister(false)} />
      : <Login onToggle={() => setShowRegister(true)} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'punto-de-venta':    return <PuntoDeVenta />;
      case 'facturacion':       return <Facturacion />;
      case 'articulos':         return <Articulos />;
      case 'stock-listado':     return <StockListado />;
      case 'alquiler':          return <Alquiler />;
      case 'servicios-tecnicos': return <ServiciosTecnicos />;
      case 'configuracion':     return <Configuracion />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
