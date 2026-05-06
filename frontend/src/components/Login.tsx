// ============================================================
//  COMPONENTE LOGIN (components/Login.tsx)
//  Pantalla de inicio de sesión que se muestra cuando no hay usuario autenticado.
//  Recibe email y contraseña, llama al contexto de auth para iniciar sesión
//  y en caso de error muestra un mensaje al usuario.
// ============================================================

import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/** Props: onToggle permite cambiar a la pantalla de registro */
export default function Login({ onToggle }: { onToggle: () => void }) {
  const { login } = useAuth(); // Función de login del contexto global

  // Estados del formulario: campos y mensaje de error
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  /**
   * handleSubmit — Se ejecuta al enviar el formulario.
   * e.preventDefault() evita que el navegador recargue la página (comportamiento HTML por defecto).
   * Si el login es exitoso, el AuthContext actualiza el estado y App.tsx renderiza el sistema.
   * Si falla (credenciales incorrectas), muestra un mensaje de error.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita recarga de página al hacer submit del form
    setError('');       // Limpia errores anteriores
    try {
      await login(email, password); // Llama al backend → guarda token en localStorage
    } catch {
      setError('Email o contraseña incorrectos');
    }
  };

  return (
    // Contenedor centrado en pantalla completa con fondo gris
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Iniciar Sesión</h2>

        {/* Mensaje de error (solo se muestra si `error` no está vacío) */}
        {error && <p className="text-red-500 mb-4 text-sm bg-red-50 p-2 rounded">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Campo email: type="email" hace validación básica del formato */}
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)} // Actualiza el estado al tipear
            required
          />

          {/* Campo contraseña: type="password" oculta los caracteres */}
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {/* Botón de submit: dispara handleSubmit */}
          <button
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition font-medium"
            type="submit"
          >
            Entrar
          </button>
        </form>

        {/* Link para cambiar a la pantalla de registro */}
        <p className="mt-4 text-center text-sm text-gray-600">
          ¿No tenés cuenta?{' '}
          <button onClick={onToggle} className="text-blue-600 hover:underline font-medium">
            Registrate
          </button>
        </p>
      </div>
    </div>
  );
}
