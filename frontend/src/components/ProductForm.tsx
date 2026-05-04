import { useState, useEffect } from 'react';
import api from '../services/api';

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: { id: number; name: string };
}

interface Category {
  id: number;
  name: string;
}

interface Props {
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductForm({ product, onClose, onSaved }: Props) {
  const [name, setName] = useState(product?.name || '');
  const [price, setPrice] = useState(product?.price?.toString() || '');
  const [stock, setStock] = useState(product?.stock?.toString() || '');
  const [categoryId, setCategoryId] = useState(product?.category?.id?.toString() || '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data));
  }, []);

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const { data } = await api.post('/categories', { name: newCategoryName.trim() });
      setCategories(prev => [...prev, data]);
      setCategoryId(data.id.toString());
      setNewCategoryName('');
    } catch {
      setError('Error al crear categoría (puede que ya exista)');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const body = { name, price: Number(price), stock: Number(stock), categoryId: Number(categoryId) };
      if (product) {
        await api.put(`/products/${product.id}`, body);
      } else {
        await api.post('/products', body);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      setError(message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">{product ? 'Editar' : 'Nuevo'} Producto</h2>
        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nombre del producto"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="number"
            step="0.01"
            min="0"
            placeholder="Precio"
            value={price}
            onChange={e => setPrice(e.target.value)}
            required
          />
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="number"
            min="0"
            placeholder="Stock inicial"
            value={stock}
            onChange={e => setStock(e.target.value)}
            required
          />

          <select
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            required
          >
            <option value="">Seleccionar categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="O crear nueva categoría..."
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Crear
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium transition"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-gray-200 font-medium transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
