import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import SaleForm from '../components/SaleForm';
import { Product, Sale } from '../types';

export default function SalesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedSale, setExpandedSale] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [p, s] = await Promise.all([api.get('/products'), api.get('/sales')]);
    setProducts(p.data);
    setSales(s.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleClose = () => {
    setShowForm(false);
    fetchData();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Cargando...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{sales.length} venta(s) registrada(s)</p>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva Venta
        </button>
      </div>

      {/* Empty state */}
      {sales.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-16 text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
          </svg>
          <p className="font-medium">No hay ventas registradas</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-green-600 hover:underline text-sm font-medium"
          >
            Registrar la primera venta
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítems</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sales.map(s => (
                <React.Fragment key={s.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-gray-900">#{s.id}</td>
                    <td className="px-5 py-3.5 text-gray-600">{s.user.email}</td>
                    <td className="px-5 py-3.5 text-gray-500">
                      {new Date(s.createdAt).toLocaleDateString('es-AR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">{s.details.length} ítem(s)</td>
                    <td className="px-5 py-3.5 font-bold text-green-600 text-right">
                      ${s.total.toLocaleString('es-AR')}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => setExpandedSale(expandedSale === s.id ? null : s.id)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        {expandedSale === s.id ? 'Cerrar ▲' : 'Detalle ▼'}
                      </button>
                    </td>
                  </tr>

                  {expandedSale === s.id && (
                    <tr>
                      <td colSpan={6} className="px-5 py-3 bg-blue-50 border-b border-blue-100">
                        <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">
                          Detalle de la venta
                        </p>
                        <div className="space-y-1.5">
                          {s.details.map(d => (
                            <div key={d.id} className="flex justify-between text-sm">
                              <span className="text-gray-700">
                                {d.product.name}{' '}
                                <span className="text-gray-400">× {d.quantity}</span>
                              </span>
                              <span className="font-medium text-gray-800">
                                ${(d.unitPrice * d.quantity).toLocaleString('es-AR')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <SaleForm products={products} onClose={handleClose} />
      )}
    </div>
  );
}
