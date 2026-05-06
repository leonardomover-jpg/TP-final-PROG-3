// ============================================================
//  COMPONENTE SALEFORM (components/SaleForm.tsx)
//  Modal para registrar una venta rápida con múltiples productos.
//  Permite agregar/quitar líneas de ítem (producto + cantidad),
//  calcula el total en tiempo real y envía la venta al backend.
//
//  Diferencia con PuntoDeVenta:
//  → SaleForm es un modal simple (lista de selects).
//  → PuntoDeVenta es la pantalla completa con grilla de cards y carrito visual.
// ============================================================

import { useState } from 'react';
import api from '../services/api';

// Tipos locales del componente
interface Product {
  id:    number;
  name:  string;
  price: number;
  stock: number;
}

/** Representa una línea del carrito (un ítem de la venta) */
interface SaleItem {
  productId: number; // ID del producto seleccionado
  quantity:  number; // Cantidad a vender
}

/** Props del componente */
interface Props {
  products: Product[]; // Lista de productos disponibles (viene del componente padre)
  onClose:  () => void; // Cierra el modal
}

export default function SaleForm({ products, onClose }: Props) {
  // Estado del carrito: inicia con una línea vacía para que el usuario complete
  const [items,   setItems]   = useState<SaleItem[]>([{ productId: 0, quantity: 1 }]);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  /** addItem — Agrega una nueva línea vacía al carrito */
  const addItem = () =>
    setItems(prev => [...prev, { productId: 0, quantity: 1 }]);

  /** removeItem — Elimina una línea del carrito por su índice */
  const removeItem = (index: number) =>
    setItems(prev => prev.filter((_, i) => i !== index));

  /**
   * updateItem — Actualiza un campo (productId o quantity) de una línea específica.
   * Usa spread operator para crear un nuevo objeto con el campo modificado.
   * React necesita objetos nuevos para detectar el cambio de estado.
   */
  const updateItem = (index: number, field: keyof SaleItem, value: number) => {
    setItems(prev =>
      prev.map((item, i) => i === index ? { ...item, [field]: value } : item)
    );
  };

  /**
   * total — Calcula el total del carrito en tiempo real.
   * Para cada ítem: busca el producto por ID y multiplica precio × cantidad.
   * Si el producto no está seleccionado (productId = 0), suma 0.
   */
  const total = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  /**
   * handleSubmit — Envía la venta al backend.
   * Filtra los ítems inválidos (sin producto seleccionado o cantidad 0).
   * Si la venta es exitosa, cierra el modal después de 1.5 segundos.
   * Si hay error (stock insuficiente, etc.), muestra el mensaje del backend.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Solo enviamos ítems con producto seleccionado y cantidad válida
    const validItems = items.filter(item => item.productId > 0 && item.quantity > 0);
    if (validItems.length === 0) {
      setError('Agregá al menos un producto');
      return;
    }

    try {
      await api.post('/sales', { items: validItems });
      setSuccess('Venta registrada exitosamente');
      // Espera 1.5s para que el usuario vea el mensaje, luego cierra el modal
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      // Extraemos el mensaje de error del response de Axios
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Error al registrar la venta');
    }
  };

  return (
    // Overlay que cubre toda la pantalla
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Nueva Venta</h2>

        {/* Mensajes de feedback */}
        {error   && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-3 bg-green-50 p-2 rounded">{success}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Lista de ítems del carrito */}
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">

              {/* Selector de producto: muestra nombre, stock y precio */}
              <select
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={item.productId}
                onChange={e => updateItem(i, 'productId', Number(e.target.value))}
              >
                <option value={0}>Seleccionar producto</option>
                {products.map(p => (
                  // disabled si no tiene stock → no se puede seleccionar
                  <option key={p.id} value={p.id} disabled={p.stock === 0}>
                    {p.name} — Stock: {p.stock} — ${p.price.toFixed(2)}
                  </option>
                ))}
              </select>

              {/* Input de cantidad */}
              <input
                className="w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                type="number"
                min="1"
                value={item.quantity}
                onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
              />

              {/* Botón eliminar línea (solo si hay más de una línea) */}
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="text-red-400 hover:text-red-600 text-lg font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          {/* Botón para agregar una línea más al carrito */}
          <button
            type="button"
            onClick={addItem}
            className="text-green-600 hover:underline text-sm font-medium"
          >
            + Agregar producto
          </button>

          {/* Total calculado en tiempo real */}
          <div className="border-t pt-3">
            <p className="text-xl font-bold text-gray-800">Total: ${total.toFixed(2)}</p>
          </div>

          {/* Botones: confirmar o cancelar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 font-medium transition"
            >
              Confirmar Venta
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
