import { useState } from 'react';
import api from '../services/api';

interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
}

interface SaleItem {
  productId: number;
  quantity: number;
}

interface Props {
  products: Product[];
  onClose: () => void;
}

export default function SaleForm({ products, onClose }: Props) {
  const [items, setItems] = useState<SaleItem[]>([{ productId: 0, quantity: 1 }]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const addItem = () => setItems(prev => [...prev, { productId: 0, quantity: 1 }]);

  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const updateItem = (index: number, field: keyof SaleItem, value: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const total = items.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validItems = items.filter(item => item.productId > 0 && item.quantity > 0);
    if (validItems.length === 0) {
      setError('Agregá al menos un producto');
      return;
    }

    try {
      await api.post('/sales', { items: validItems });
      setSuccess('Venta registrada exitosamente');
      setTimeout(onClose, 1500);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || 'Error al registrar la venta');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Nueva Venta</h2>

        {error && <p className="text-red-500 text-sm mb-3 bg-red-50 p-2 rounded">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-3 bg-green-50 p-2 rounded">{success}</p>}

        <form onSubmit={handleSubmit} className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                value={item.productId}
                onChange={e => updateItem(i, 'productId', Number(e.target.value))}
              >
                <option value={0}>Seleccionar producto</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} disabled={p.stock === 0}>
                    {p.name} — Stock: {p.stock} — ${p.price.toFixed(2)}
                  </option>
                ))}
              </select>
              <input
                className="w-20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                type="number"
                min="1"
                value={item.quantity}
                onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
              />
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

          <button
            type="button"
            onClick={addItem}
            className="text-green-600 hover:underline text-sm font-medium"
          >
            + Agregar producto
          </button>

          <div className="border-t pt-3">
            <p className="text-xl font-bold text-gray-800">Total: ${total.toFixed(2)}</p>
          </div>

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
