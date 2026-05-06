// ============================================================
//  PÁGINA: CONFIGURACIÓN (pages/Configuracion.tsx)
//  Panel de configuración del sistema con dos secciones:
//    1. Cuenta: muestra email y rol del usuario logueado
//    2. Categorías: lista y (si es Admin) formulario para agregar nuevas
//
//  Solo los Admin pueden crear categorías desde esta pantalla.
// ============================================================

import { useState, useEffect } from 'react';
import api        from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Category, Product } from '../types';

// Paleta de colores para los badges de categorías (se cicla con módulo %)
const BADGE_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export default function Configuracion() {
  const { user } = useAuth(); // Para mostrar datos de la cuenta y verificar rol Admin

  const [categories, setCategories] = useState<Category[]>([]);
  const [products,   setProducts]   = useState<Product[]>([]);   // Para contar artículos por categoría
  const [newName,    setNewName]    = useState('');               // Campo del formulario de nueva categoría
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(true);

  /**
   * fetchData — Carga categorías y productos en paralelo.
   * Se usa también después de crear una categoría para actualizar la lista.
   */
  const fetchData = async () => {
    const [c, p] = await Promise.all([api.get('/categories'), api.get('/products')]);
    setCategories(c.data);
    setProducts(p.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  /**
   * handleCreate — Crea una nueva categoría y refresca la lista.
   * e.preventDefault() evita que el form recargue la página.
   * trim() elimina espacios al inicio y al final del nombre.
   */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/categories', { name: newName.trim() });
      setNewName('');  // Limpia el campo después de crear
      fetchData();     // Refresca la lista para mostrar la nueva categoría
    } catch {
      setError('Ya existe una categoría con ese nombre');
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-6">

        {/* ── SECCIÓN: Cuenta del usuario ── */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Cuenta</h3>
          <div className="flex items-center gap-4">

            {/* Avatar con la inicial del email (en mayúscula) */}
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {user?.email.charAt(0).toUpperCase()}
            </div>

            <div>
              <p className="font-medium text-gray-900">{user?.email}</p>
              {/* Badge de rol: azul para Admin, gris para User */}
              <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-1 font-medium ${
                user?.role === 'Admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* ── SECCIÓN: Gestión de categorías ── */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Categorías</h3>
            <p className="text-sm text-gray-400 mt-0.5">Los artículos se organizan por categoría</p>
          </div>

          {/* Formulario para crear nueva categoría (solo visible para Admin) */}
          {user?.role === 'Admin' && (
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <form onSubmit={handleCreate} className="flex gap-3">
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Nombre de la nueva categoría..."
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium whitespace-nowrap"
                >
                  Agregar
                </button>
              </form>
              {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>
          )}

          {/* Lista de categorías existentes */}
          {categories.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-sm">No hay categorías cargadas.</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {categories.map((cat, i) => {
                // Cuenta cuántos productos pertenecen a esta categoría
                const count = products.filter(p => p.category.id === cat.id).length;
                return (
                  <div key={cat.id} className="px-6 py-3.5 flex items-center gap-4">
                    {/* Avatar de la categoría con su inicial y color del array BADGE_COLORS */}
                    {/* i % BADGE_COLORS.length cicla los colores si hay más categorías que colores */}
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${BADGE_COLORS[i % BADGE_COLORS.length]}`}>
                      {cat.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="flex-1 font-medium text-gray-900">{cat.name}</span>
                    {/* Contador de artículos en esta categoría */}
                    <span className="text-sm bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">
                      {count} {count === 1 ? 'artículo' : 'artículos'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
