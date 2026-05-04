import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Register({ onToggle }: { onToggle: () => void }) {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('User');
  const [msg, setMsg] = useState('');
  const [isError, setIsError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, password, role);
      setIsError(false);
      setMsg('Registro exitoso. Ahora podés iniciar sesión.');
    } catch {
      setIsError(true);
      setMsg('Error al registrarse. El email puede estar en uso.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-xl shadow w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Registrarse</h2>
        {msg && (
          <p className={`mb-4 text-sm p-2 rounded ${isError ? 'text-red-500 bg-red-50' : 'text-green-600 bg-green-50'}`}>
            {msg}
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <select
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            <option value="User">Usuario</option>
            <option value="Admin">Admin</option>
          </select>
          <button
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition font-medium"
            type="submit"
          >
            Registrarse
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-600">
          ¿Ya tenés cuenta?{' '}
          <button onClick={onToggle} className="text-blue-600 hover:underline font-medium">
            Iniciá sesión
          </button>
        </p>
      </div>
    </div>
  );
}
