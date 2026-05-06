// ============================================================
//  COMPONENTE PRODUCTFORM (components/ProductForm.tsx)
//  Modal (ventana superpuesta) para crear o editar un producto.
//  Funciona en modo dual:
//    - Si recibe `product` → modo EDITAR (pre-completa los campos con los datos actuales)
//    - Si `product` es null → modo CREAR (campos vacíos)
//  También permite crear una categoría nueva directamente desde este formulario.
// ============================================================

import { useState, useEffect } from 'react';
import api from '../services/api';

// Tipos locales (se definen acá porque este componente no importa de types/index.ts)
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

/** Props que recibe ProductForm */
interface Props {
  product: Product | null; // null = crear nuevo, objeto = editar existente
  onClose: () => void;     // Cierra el modal sin guardar
  onSaved: () => void;     // Se llama después de guardar para refrescar la lista
}

export default function ProductForm({ product, onClose, onSaved }: Props) {
  // Estados del formulario — se inicializan con los valores del producto si está editando
  // product?.name usa optional chaining: si product es null, devuelve undefined → fallback a ''
  const [name,            setName]            = useState(product?.name || '');
  const [price,           setPrice]           = useState(product?.price?.toString() || '');
  const [stock,           setStock]           = useState(product?.stock?.toString() || '');
  const [categoryId,      setCategoryId]      = useState(product?.category?.id?.toString() || '');
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState(''); // Para crear categoría inline
  const [error,           setError]           = useState('');

  // Al montar el componente, cargamos la lista de categorías disponibles
  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data));
  }, []); // [] = solo se ejecuta una vez al montar

  /**
   * handleAddCategory — Crea una nueva categoría sin salir del formulario.
   * Después de crearla, la agrega al selector y la selecciona automáticamente.
   */
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return; // No hace nada si el campo está vacío
    try {
      const { data } = await api.post('/categories', { name: newCategoryName.trim() });
      setCategories(prev => [...prev, data]); // Agrega la nueva categoría al estado local
      setCategoryId(data.id.toString());       // La selecciona automáticamente
      setNewCategoryName('');                  // Limpia el campo
    } catch {
      setError('Error al crear categoría (puede que ya exista)');
    }
  };

  /**
   * handleSubmit — Guarda el producto (crea o edita según el modo).
   * Si `product` existe → PUT /products/:id (editar)
   * Si `product` es null → POST /products (crear)
   * Después de guardar: llama onSaved() para refrescar la lista y onClose() para cerrar el modal.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Construimos el body convirtiendo strings a números (los inputs siempre dan strings)
      const body = {
        name,
        price:      Number(price),
        stock:      Number(stock),
        categoryId: Number(categoryId),
      };

      if (product) {
        await api.put(`/products/${product.id}`, body); // Editar producto existente
      } else {
        await api.post('/products', body);               // Crear producto nuevo
      }

      onSaved(); // Refresca la lista de productos en el componente padre
      onClose(); // Cierra el modal
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar';
      setError(message);
    }
  };

  return (
    // Overlay oscuro semitransparente que cubre toda la pantalla (fixed inset-0)
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">

        {/* Título dinámico según el modo */}
        <h2 className="text-xl font-bold mb-4">{product ? 'Editar' : 'Nuevo'} Producto</h2>

        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Campo: nombre del producto */}
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nombre del producto"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />

          {/* Campo: precio — step="0.01" permite decimales, min="0" evita negativos */}
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

          {/* Campo: stock inicial */}
          <input
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            type="number"
            min="0"
            placeholder="Stock inicial"
            value={stock}
            onChange={e => setStock(e.target.value)}
            required
          />

          {/* Selector de categoría existente */}
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

          {/* Opción alternativa: crear categoría nueva sin salir del modal */}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
              placeholder="O crear nueva categoría..."
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
            />
            {/* type="button" evita que dispare el submit del formulario */}
            <button
              type="button"
              onClick={handleAddCategory}
              className="bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              Crear
            </button>
          </div>

          {/* Botones de acción */}
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
