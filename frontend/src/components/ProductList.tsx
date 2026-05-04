import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../context/AuthContext';
import ProductForm from './ProductForm';
import SaleForm from './SaleForm';

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  category: { id: number; name: string };
}

export default function ProductList() {
  const { user, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);

  const fetchProducts = useCallback(async () => {
    const { data } = await api.get('/products');
    setProducts(data);
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Escucha el evento de WebSocket y actualiza el stock sin recargar
  const handleStockUpdate = useCallback((updatedProducts: unknown) => {
    setProducts(updatedProducts as Product[]);
  }, []);

  useSocket('stock-update', handleStockUpdate);

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await api.delete(`/products/${id}`);
    fetchProducts();
  };

  const stockBadge = (stock: number) => {
    if (stock === 0) return 'bg-red-100 text-red-700';
    if (stock <= 5) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Stock Manager</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-500">
            {user?.email}{' '}
            <span className={`font-semibold ${user?.role === 'Admin' ? 'text-blue-600' : 'text-gray-600'}`}>
              ({user?.role})
            </span>
          </span>
          <button
            onClick={() => setShowSaleForm(true)}
            className="bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition text-sm font-medium"
          >
            Nueva Venta
          </button>
          {user?.role === 'Admin' && (
            <button
              onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              + Producto
            </button>
          )}
          <button
            onClick={logout}
            className="text-red-500 hover:underline text-sm"
          >
            Salir
          </button>
        </div>
      </nav>

      {/* Grilla de productos */}
      <div className="p-6">
        {products.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg">No hay productos cargados.</p>
            {user?.role === 'Admin' && (
              <p className="text-sm mt-2">Hacé clic en <strong>+ Producto</strong> para agregar el primero.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-xl shadow p-4 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{p.name}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {p.category.name}
                    </span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${stockBadge(p.stock)}`}>
                    {p.stock} u.
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-auto pt-2">
                  ${p.price.toFixed(2)}
                </p>
                {user?.role === 'Admin' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => { setEditingProduct(p); setShowProductForm(true); }}
                      className="flex-1 text-sm bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg hover:bg-yellow-100 transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex-1 text-sm bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 transition"
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

      {showProductForm && (
        <ProductForm
          product={editingProduct}
          onClose={() => setShowProductForm(false)}
          onSaved={fetchProducts}
        />
      )}

      {showSaleForm && (
        <SaleForm
          products={products}
          onClose={() => setShowSaleForm(false)}
        />
      )}
    </div>
  );
}
