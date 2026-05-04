import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { Sale } from '../types';

export default function Facturacion() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expandedSale, setExpandedSale] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSales = useCallback(async () => {
    const { data } = await api.get('/sales');
    setSales(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const totalFacturado = sales.reduce((sum, s) => sum + s.total, 0);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">
        {/* Summary bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Total ventas</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{sales.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Total facturado</p>
            <p className="text-2xl font-bold text-green-600 mt-0.5">${totalFacturado.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Ticket promedio</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">
              ${sales.length ? Math.round(totalFacturado / sales.length).toLocaleString('es-AR') : '0'}
            </p>
          </div>
        </div>

        {/* Table */}
        {sales.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-16 text-center text-gray-400">
            <p className="font-medium">No hay ventas registradas</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nro.</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Ítems</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sales.map(s => (
                  <React.Fragment key={s.id}>
                    <tr className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-gray-700">#{String(s.id).padStart(4, '0')}</td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {new Date(s.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">{s.user.email}</td>
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
                          <p className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">
                            Detalle — Venta #{String(s.id).padStart(4, '0')}
                          </p>
                          <div className="space-y-1.5">
                            {s.details.map(d => (
                              <div key={d.id} className="flex justify-between text-sm">
                                <span className="text-gray-700">
                                  {d.product.name}
                                  <span className="text-gray-400 ml-1">× {d.quantity}</span>
                                </span>
                                <span className="font-medium text-gray-800">
                                  ${(d.unitPrice * d.quantity).toLocaleString('es-AR')}
                                </span>
                              </div>
                            ))}
                            <div className="pt-1.5 border-t border-blue-200 flex justify-between font-semibold text-sm">
                              <span>Total</span>
                              <span>${s.total.toLocaleString('es-AR')}</span>
                            </div>
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
      </div>
    </div>
  );
}
