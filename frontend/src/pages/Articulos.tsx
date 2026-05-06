// ============================================================
//  PÁGINA: ARTÍCULOS (pages/Articulos.tsx)
//  Vista de gestión del catálogo de productos con grilla de cards.
//  Los usuarios Admin ven botones de Editar/Eliminar en cada card.
//  Los usuarios normales solo pueden ver el catálogo.
//  El stock se actualiza en tiempo real via WebSocket.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import api           from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth }   from '../context/AuthContext';
import ProductForm   from '../components/ProductForm';
import { Product, Category } from '../types';

/**
 * stockClass — Devuelve clases CSS de color para el badge de stock.
 * Rojo = sin stock, Amarillo = stock bajo, Verde = stock normal.
 */
function stockClass(stock: number) {
  if (stock === 0) return 'bg-red-100 text-red-700';
  if (stock <= 5)  return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

export default function Articulos() {
  const { user } = useAuth(); // Para saber si el usuario es Admin

  const [products,       setProducts]       = useState<Product[]>([]);
  const [categories,     setCategories]     = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null); // Filtro activo
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showForm,       setShowForm]       = useState(false);
  const [loading,        setLoading]        = useState(true);

  /**
   * fetchProducts — Solo recarga productos (sin categorías).
   * Se usa como callback en ProductForm.onSaved para refrescar la lista
   * después de crear o editar un producto sin recargar la página.
   */
  const fetchProducts = useCallback(async () => {
    const { data } = await api.get('/products');
    setProducts(data);
  }, []);

  // Carga inicial: productos y categorías en paralelo
  useEffect(() => {
    Promise.all([api.get('/products'), api.get('/categories')]).then(([p, c]) => {
      setProducts(p.data);
      setCategories(c.data);
      setLoading(false);
    });
  }, []);

  // Actualiza el stock en tiempo real cuando se registra una venta desde otro componente
  const handleStockUpdate = useCallback((updated: unknown) => {
    setProducts(updated as Product[]);
  }, []);
  useSocket('stock-update', handleStockUpdate);

  /**
   * handleDelete — Solicita confirmación y elimina el producto del sistema.
   * Después de eliminar, recarga la lista para quitar la card de la grilla.
   */
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await api.delete(`/products/${id}`);
    fetchProducts();
  };

  // Filtra los productos: si hay categoría activa, muestra solo los de esa categoría
  const filtered = activeCategory
    ? products.filter(p => p.category.id === activeCategory)
    : products;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">

        {/* ── HEADER: contador y botón nuevo artículo ── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {filtered.length} de {products.length} artículo(s)
          </p>

          {/* Botón "Nuevo Artículo": solo visible para Admin */}
          {user?.role === 'Admin' && (
            <button
              onClick={() => { setEditingProduct(null); setShowForm(true); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nuevo Artículo
            </button>
          )}
        </div>

        {/* ── FILTROS POR CATEGORÍA ── */}
        <div className="flex gap-2 flex-wrap">
          {/* Botón "Todos": limpia el filtro */}
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 shadow-sm'
            }`}
          >
            Todos ({products.length})
          </button>

          {/* Un botón por categoría con el contador de productos de esa categoría */}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 shadow-sm'
              }`}
            >
              {cat.name} ({products.filter(p => p.category.id === cat.id).length})
            </button>
          ))}
        </div>

        {/* ── GRILLA DE CARDS ── */}
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No hay artículos en esta categoría.</div>
        ) : (
          // Grilla responsiva: 1 col → 2 → 3 → 4 según el ancho de pantalla
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(p => (
              <div
                key={p.id}
                className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Header de la card: categoría y badge de stock */}
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
                    {p.category.name}
                  </span>
                  {/* Badge de stock con color dinámico */}
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${stockClass(p.stock)}`}>
                    {p.stock === 0 ? 'SIN STOCK' : `${p.stock} u.`}
                  </span>
                </div>

                {/* Nombre y precio del producto */}
                <h3 className="font-semibold text-gray-900 text-sm flex-1">{p.name}</h3>
                <p className="text-xl font-bold text-gray-900 mt-2">
                  ${p.price.toLocaleString('es-AR')}
                </p>

                {/* Botones de Editar/Eliminar: solo para Admin */}
                {user?.role === 'Admin' && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    {/* Editar: pre-carga el producto en el formulario */}
                    <button
                      onClick={() => { setEditingProduct(p); setShowForm(true); }}
                      className="flex-1 text-xs bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition font-medium"
                    >
                      Editar
                    </button>
                    {/* Eliminar: pide confirmación antes de borrar */}
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex-1 text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition font-medium"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de formulario (se muestra encima de todo cuando showForm es true) */}
      {showForm && (
        <ProductForm
          product={editingProduct}               // null = nuevo, objeto = editar
          onClose={() => setShowForm(false)}
          onSaved={fetchProducts}                // Refresca la grilla al guardar
        />
      )}
    </div>
  );
}
