// ============================================================
//  COMPONENTE PRODUCTLIST (components/ProductList.tsx)
//  Vista de grilla de productos con navbar, botones de admin
//  y actualización de stock en tiempo real via WebSocket.
//  Este componente es una versión más simple de Articulos.tsx —
//  era la pantalla principal antes de implementar el Layout con Sidebar.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import api            from '../services/api';
import { useSocket }  from '../hooks/useSocket';
import { useAuth }    from '../context/AuthContext';
import ProductForm    from './ProductForm';
import SaleForm       from './SaleForm';

interface Product {
  id:       number;
  name:     string;
  price:    number;
  stock:    number;
  category: { id: number; name: string };
}

export default function ProductList() {
  const { user, logout } = useAuth();

  // Estado principal: lista de productos y modales visibles
  const [products,         setProducts]         = useState<Product[]>([]);
  const [editingProduct,   setEditingProduct]   = useState<Product | null>(null);
  const [showProductForm,  setShowProductForm]  = useState(false);
  const [showSaleForm,     setShowSaleForm]     = useState(false);

  /**
   * fetchProducts — Carga la lista de productos desde el backend.
   * useCallback evita que se recree la función en cada render,
   * lo que es importante porque se usa como dependencia de useEffect.
   */
  const fetchProducts = useCallback(async () => {
    const { data } = await api.get('/products');
    setProducts(data);
  }, []);

  // Al montar el componente, cargamos los productos
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  /**
   * handleStockUpdate — Actualiza los productos cuando llega un evento WebSocket.
   * Se usa useCallback para que la referencia sea estable y no re-suscriba el socket innecesariamente.
   * El tipo `unknown` se castea a Product[] porque sabemos qué envía el servidor.
   */
  const handleStockUpdate = useCallback((updatedProducts: unknown) => {
    setProducts(updatedProducts as Product[]);
  }, []);

  // Escucha el evento 'stock-update' del servidor en tiempo real
  useSocket('stock-update', handleStockUpdate);

  /**
   * handleDelete — Pide confirmación y elimina un producto.
   * confirm() abre un diálogo nativo del navegador (true = confirmó, false = canceló).
   */
  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este producto?')) return;
    await api.delete(`/products/${id}`);
    fetchProducts(); // Refresca la lista después de eliminar
  };

  /**
   * stockBadge — Devuelve clases CSS de color según el nivel de stock.
   * Rojo = sin stock, Amarillo = stock bajo (≤5), Verde = stock normal.
   */
  const stockBadge = (stock: number) => {
    if (stock === 0) return 'bg-red-100 text-red-700';
    if (stock <= 5)  return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── NAVBAR: barra superior con email, botón nueva venta, y logout ── */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-800">Stock Manager</h1>
        <div className="flex items-center gap-3 flex-wrap">

          {/* Muestra email y rol del usuario actual */}
          <span className="text-sm text-gray-500">
            {user?.email}{' '}
            <span className={`font-semibold ${user?.role === 'Admin' ? 'text-blue-600' : 'text-gray-600'}`}>
              ({user?.role})
            </span>
          </span>

          {/* Botón Nueva Venta: abre SaleForm modal */}
          <button
            onClick={() => setShowSaleForm(true)}
            className="bg-green-600 text-white px-4 py-1.5 rounded-lg hover:bg-green-700 transition text-sm font-medium"
          >
            Nueva Venta
          </button>

          {/* Botón + Producto: solo visible para Admin */}
          {user?.role === 'Admin' && (
            <button
              onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              + Producto
            </button>
          )}

          <button onClick={logout} className="text-red-500 hover:underline text-sm">
            Salir
          </button>
        </div>
      </nav>

      {/* ── GRILLA DE PRODUCTOS ── */}
      <div className="p-6">
        {products.length === 0 ? (
          // Estado vacío: mensaje cuando no hay productos
          <div className="text-center text-gray-500 mt-20">
            <p className="text-lg">No hay productos cargados.</p>
            {user?.role === 'Admin' && (
              <p className="text-sm mt-2">Hacé clic en <strong>+ Producto</strong> para agregar el primero.</p>
            )}
          </div>
        ) : (
          // Grilla responsiva: 1 col en mobile, 2 en tablet, 3 en desktop, 4 en xl
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {products.map(p => (
              <div key={p.id} className="bg-white rounded-xl shadow p-4 flex flex-col">

                {/* Cabecera de la card: nombre, categoría y badge de stock */}
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{p.name}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {p.category.name}
                    </span>
                  </div>
                  {/* Badge de stock con color dinámico */}
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${stockBadge(p.stock)}`}>
                    {p.stock} u.
                  </span>
                </div>

                {/* Precio del producto */}
                <p className="text-2xl font-bold text-gray-900 mt-auto pt-2">
                  ${p.price.toFixed(2)}
                </p>

                {/* Botones de editar/eliminar: solo para Admin */}
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

      {/* ── MODALES: se renderizan sobre el contenido cuando están activos ── */}

      {/* Modal de crear/editar producto (solo si showProductForm es true) */}
      {showProductForm && (
        <ProductForm
          product={editingProduct}           // null = crear, objeto = editar
          onClose={() => setShowProductForm(false)}
          onSaved={fetchProducts}            // Refresca la lista al guardar
        />
      )}

      {/* Modal de nueva venta (solo si showSaleForm es true) */}
      {showSaleForm && (
        <SaleForm
          products={products}
          onClose={() => setShowSaleForm(false)}
        />
      )}
    </div>
  );
}
