import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Category, Product } from '../types';

const COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
];

export default function CategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [c, p] = await Promise.all([api.get('/categories'), api.get('/products')]);
    setCategories(c.data);
    setProducts(p.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/categories', { name: newName.trim() });
      setNewName('');
      fetchData();
    } catch {
      setError('Ya existe una categoría con ese nombre');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Add form (admin only) */}
      {user?.role === 'Admin' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-semibold text-gray-800 mb-1">Nueva Categoría</h3>
          <p className="text-sm text-gray-400 mb-4">Los productos se agrupan por categoría</p>
          <form onSubmit={handleCreate} className="flex gap-3">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Electrónica, Ropa, Alimentos..."
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

      {/* Categories list */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Categorías</h3>
          <span className="text-sm text-gray-400">{categories.length} en total</span>
        </div>

        {categories.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No hay categorías creadas todavía.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {categories.map((cat, i) => {
              const catProducts = products.filter(p => p.category.id === cat.id);
              const totalStock = catProducts.reduce((sum, p) => sum + p.stock, 0);
              const color = COLORS[i % COLORS.length];

              return (
                <div key={cat.id} className="px-6 py-4 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0 ${color}`}>
                    {cat.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{cat.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {totalStock} unidades en stock
                    </p>
                  </div>
                  <span className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium flex-shrink-0">
                    {catProducts.length} {catProducts.length === 1 ? 'producto' : 'productos'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
