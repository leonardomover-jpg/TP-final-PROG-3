// ============================================================
//  PÁGINA: PUNTO DE VENTA (pages/PuntoDeVenta.tsx)
//  Pantalla principal para registrar ventas.
//  Divide la vista en dos paneles:
//    - IZQUIERDA: grilla de productos filtrables por categoría
//    - DERECHA:   carrito de compras con total y botón confirmar
//
//  El stock se actualiza en tiempo real via WebSocket cuando
//  otro usuario confirma una venta.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import api           from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Product, Category } from '../types';

/** Representa un ítem dentro del carrito (producto + cantidad elegida) */
interface CartItem {
  product:  Product;
  quantity: number;
}

/**
 * stockLabel — Devuelve texto y clase CSS según el nivel de stock del producto.
 * Usado en cada card para mostrar disponibilidad al vendedor.
 */
function stockLabel(stock: number) {
  if (stock === 0) return { text: 'Sin stock',             cls: 'text-red-500' };
  if (stock <= 5)  return { text: `${stock} disponibles`,  cls: 'text-yellow-600' };
  return              { text: `${stock} disponibles`,  cls: 'text-gray-400' };
}

export default function PuntoDeVenta() {
  const [products,        setProducts]        = useState<Product[]>([]);
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [cart,            setCart]            = useState<CartItem[]>([]); // Estado del carrito
  const [activeCategory,  setActiveCategory]  = useState<number | null>(null); // Filtro activo
  const [loading,         setLoading]         = useState(true);
  const [success,         setSuccess]         = useState('');
  const [error,           setError]           = useState('');
  const [submitting,      setSubmitting]      = useState(false); // Evita doble submit

  // Carga productos y categorías en paralelo al montar el componente
  useEffect(() => {
    Promise.all([api.get('/products'), api.get('/categories')]).then(([p, c]) => {
      setProducts(p.data);
      setCategories(c.data);
      setLoading(false);
    });
  }, []);

  // Actualiza la lista de productos cuando llega un evento WebSocket de stock-update
  const handleStockUpdate = useCallback((updated: unknown) => {
    setProducts(updated as Product[]);
  }, []);
  useSocket('stock-update', handleStockUpdate);

  /**
   * addToCart — Agrega un producto al carrito o incrementa su cantidad.
   * Si ya está en el carrito y ya llegó al máximo de stock, no hace nada.
   * Si el producto no tiene stock, tampoco hace nada.
   */
  const addToCart = (product: Product) => {
    if (product.stock === 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev; // No superar el stock disponible
        // Incrementa la cantidad del ítem existente
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      // Agrega nuevo ítem al carrito
      return [...prev, { product, quantity: 1 }];
    });
  };

  /**
   * updateQty — Actualiza la cantidad de un ítem del carrito.
   * Si qty <= 0, elimina el ítem del carrito (como "borrar").
   */
  const updateQty = (productId: number, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.product.id !== productId)); // Eliminar ítem
    } else {
      setCart(prev =>
        prev.map(i => i.product.id === productId ? { ...i, quantity: qty } : i)
      );
    }
  };

  /**
   * handleSale — Envía la venta al backend con los ítems del carrito.
   * `submitting` evita que el usuario haga doble clic y envíe la venta dos veces.
   * Si es exitosa: limpia el carrito y muestra mensaje de éxito por 3 segundos.
   * Si falla: muestra el error del backend por 5 segundos.
   */
  const handleSale = async () => {
    if (cart.length === 0 || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await api.post('/sales', {
        items: cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
      });
      setCart([]); // Vacía el carrito después de confirmar
      setSuccess('¡Venta confirmada!');
      setTimeout(() => setSuccess(''), 3000); // Oculta el mensaje a los 3 segundos
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Error al procesar la venta');
      setTimeout(() => setError(''), 5000);
    } finally {
      setSubmitting(false); // Siempre libera el flag de submitting
    }
  };

  // Productos filtrados por categoría activa (null = mostrar todos)
  const filtered = activeCategory
    ? products.filter(p => p.category.id === activeCategory)
    : products;

  // Totales del carrito calculados en tiempo real
  const cartTotal = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Cargando productos...
      </div>
    );
  }

  return (
    // Layout de dos paneles: productos a la izquierda, carrito a la derecha
    <div className="flex-1 flex overflow-hidden">

      {/* ── PANEL IZQUIERDO: Catálogo de productos ── */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-3 min-w-0">

        {/* Filtros por categoría: botones pill que filtran la grilla */}
        <div className="flex gap-2 flex-wrap flex-shrink-0">
          {/* Botón "Todos": limpia el filtro de categoría */}
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
              activeCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            Todos ({products.length})
          </button>

          {/* Un botón por cada categoría disponible */}
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                activeCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grilla de cards de productos — clic en card agrega al carrito */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-2">
            {filtered.map(p => {
              const inCart = cart.find(i => i.product.id === p.id); // ¿Está en el carrito?
              const sl     = stockLabel(p.stock);
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={p.stock === 0} // No clickeable si no hay stock
                  className={`relative text-left bg-white rounded-xl border-2 p-3 transition-all
                    ${p.stock === 0
                      ? 'opacity-50 cursor-not-allowed border-gray-100' // Sin stock: grisado
                      : inCart
                        ? 'border-blue-500 shadow-md bg-blue-50'         // En carrito: resaltado
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                    }`}
                >
                  {/* Badge con cantidad en carrito (esquina superior derecha) */}
                  {inCart && (
                    <span className="absolute top-2 right-2 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {inCart.quantity}
                    </span>
                  )}
                  <p className="text-xs text-gray-400 mb-1">{p.category.name}</p>
                  <p className="font-semibold text-gray-900 text-sm leading-snug pr-6">{p.name}</p>
                  <p className="text-base font-bold text-blue-600 mt-1.5">
                    ${p.price.toLocaleString('es-AR')}
                  </p>
                  <p className={`text-xs mt-0.5 font-medium ${sl.cls}`}>{sl.text}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── PANEL DERECHO: Carrito de compras ── */}
      <div className="w-72 xl:w-80 flex flex-col bg-white border-l border-gray-200 flex-shrink-0">

        {/* Header del carrito con contador de ítems */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Carrito</h3>
            {cartCount > 0 && (
              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                {cartCount} ítem{cartCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Mensajes de éxito y error */}
        {(success || error) && (
          <div className="px-4 pt-3 flex-shrink-0">
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-2.5 rounded-lg text-center font-medium">
                {success}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-2.5 rounded-lg">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Lista de ítems del carrito */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            // Estado vacío: icono y mensaje cuando el carrito está vacío
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 py-8">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              <p className="text-sm font-medium">Carrito vacío</p>
              <p className="text-xs mt-1">Hacé clic en un producto para agregarlo</p>
            </div>
          ) : (
            // Renderiza cada ítem del carrito con controles de cantidad
            cart.map(item => (
              <div key={item.product.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{item.product.name}</p>
                  <p className="text-xs text-gray-500">${item.product.price.toLocaleString('es-AR')} c/u</p>
                </div>

                {/* Controles de cantidad: − cantidad + */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => updateQty(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 bg-white border border-gray-200 rounded-md text-gray-700 hover:bg-gray-100 font-bold text-sm flex items-center justify-center"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product.id, item.quantity + 1)}
                    disabled={item.quantity >= item.product.stock} // No superar stock disponible
                    className="w-6 h-6 bg-white border border-gray-200 rounded-md text-gray-700 hover:bg-gray-100 font-bold text-sm flex items-center justify-center disabled:opacity-30"
                  >
                    +
                  </button>
                </div>

                {/* Botón para eliminar el ítem del carrito (pone quantity en 0) */}
                <button
                  onClick={() => updateQty(item.product.id, 0)}
                  className="text-gray-300 hover:text-red-500 transition ml-1 flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer del carrito: totales y botón de confirmar venta */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-gray-500">Subtotal</span>
            <span className="text-sm text-gray-700">${cartTotal.toLocaleString('es-AR')}</span>
          </div>
          <div className="flex justify-between items-center mb-4">
            <span className="font-bold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-gray-900">${cartTotal.toLocaleString('es-AR')}</span>
          </div>

          {/* Botón de confirmar: deshabilitado si el carrito está vacío o ya se está procesando */}
          <button
            onClick={handleSale}
            disabled={cart.length === 0 || submitting}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? 'Procesando...' : 'Confirmar Venta'}
          </button>

          {/* Botón limpiar carrito (solo visible si hay ítems) */}
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 transition py-1"
            >
              Limpiar carrito
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
