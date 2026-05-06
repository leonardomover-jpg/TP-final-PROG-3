// ============================================================
//  PUNTO DE ENTRADA DEL FRONTEND (main.tsx)
//  Es el primer archivo que ejecuta React al cargar la app en el navegador.
//  Monta el componente raíz <App /> dentro del elemento HTML con id="root"
//  que está definido en index.html.
//
//  React.StrictMode:
//  → Es un modo de desarrollo que detecta problemas potenciales.
//  → En producción no tiene efecto visual pero ayuda a encontrar errores
//    como efectos que se ejecutan dos veces o APIs deprecadas.
// ============================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'; // Estilos globales de Tailwind CSS

// createRoot es la API moderna de React 18 para montar la aplicación
// getElementById('root')! → el "!" le dice a TypeScript que estamos seguros de que ese elemento existe
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
