// ============================================================
//  CLIENTE HTTP CENTRALIZADO (services/api.ts)
//  Crea una instancia de Axios configurada para toda la app.
//  Todos los componentes importan este `api` en lugar de fetch() directo.
//
//  ¿Por qué centralizar?
//  → Un solo lugar para configurar baseURL y el token de autenticación.
//    Si cambia la URL del backend, solo se edita acá.
// ============================================================

import axios from 'axios';

// Instancia de Axios con la URL base de la API
// "/api" funciona porque Vite proxea "/api" al backend en localhost:3000
const api = axios.create({ baseURL: '/api' });

// ── Interceptor de peticiones ─────────────────────────────────
// Se ejecuta automáticamente ANTES de cada petición HTTP.
// Lee el token del localStorage y lo agrega al header Authorization.
// Así no hay que recordar agregar el token en cada llamada de la app.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // Formato estándar Bearer Token: "Authorization: Bearer eyJhbGci..."
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
