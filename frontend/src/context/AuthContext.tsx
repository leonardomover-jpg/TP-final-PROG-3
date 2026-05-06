// ============================================================
//  CONTEXTO DE AUTENTICACIÓN (context/AuthContext.tsx)
//  Implementa el patrón Context de React para compartir el estado
//  del usuario autenticado con TODOS los componentes de la app
//  sin tener que pasar props manualmente por cada nivel.
//
//  ¿Qué es un Context?
//  → Es un "estado global" accesible desde cualquier componente hijo.
//    En lugar de pasar user/login/logout como props de padre a hijo,
//    cualquier componente puede llamar useAuth() y obtenerlos directamente.
// ============================================================

import React, { createContext, useContext, useState } from 'react';
import api from '../services/api';

/** Estructura del usuario autenticado */
interface User {
  id:    number;
  email: string;
  role:  string; // "Admin" o "User"
}

/** Funciones y datos que expone el contexto a los componentes */
interface AuthContextType {
  user:     User | null;                                              // null = no está logueado
  login:    (email: string, password: string) => Promise<void>;      // Inicia sesión
  register: (email: string, password: string, role: string) => Promise<void>; // Registra usuario
  logout:   () => void;                                              // Cierra sesión
}

// Creamos el contexto con un valor inicial vacío (null! = "confío en que siempre habrá un Provider")
const AuthContext = createContext<AuthContextType>(null!);

/**
 * AuthProvider — Componente que envuelve la app y provee el contexto de auth.
 * Debe estar en el nivel más alto del árbol de componentes (en main.tsx).
 *
 * @param children - Los componentes hijos que tendrán acceso al contexto
 */
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {

  // Estado del usuario: se inicializa desde localStorage para persistir entre recargas
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    // Si hay datos guardados del login anterior, los recuperamos
    return stored ? JSON.parse(stored) : null;
  });

  /**
   * login — Envía credenciales al backend y guarda el token y usuario en localStorage.
   * Después de llamar a login(), el estado `user` se actualiza y la app renderiza
   * la pantalla principal en lugar del formulario de login.
   */
  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });

    // Guardamos token y usuario en localStorage para que persistan al recargar la página
    localStorage.setItem('token', data.token);
    localStorage.setItem('user',  JSON.stringify(data.user));
    setUser(data.user);
  };

  /**
   * register — Registra un nuevo usuario. No inicia sesión automáticamente.
   * Después de registrar, el usuario debe hacer login manualmente.
   */
  const register = async (email: string, password: string, role: string) => {
    await api.post('/auth/register', { email, password, role });
  };

  /**
   * logout — Limpia el localStorage y reinicia el estado.
   * Esto hace que App.tsx muestre el login nuevamente.
   */
  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    // Proveemos el contexto a todos los componentes hijos
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth — Hook personalizado para acceder al contexto de autenticación.
 * Cualquier componente puede llamar `const { user, login, logout } = useAuth()`
 * en lugar de importar y usar useContext(AuthContext) directamente.
 */
export const useAuth = () => useContext(AuthContext);
