import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useSocket } from '../hooks/useSocket';
import { Product } from '../types';

type SortKey = 'name' | 'stock' | 'price' | 'category';

function stockBadge(stock: number) {
  if (stock === 0) return 'bg-red-100 text-red-700';
  if (stock <= 5) return 'bg-yellow-100 text-yellow-700';
  if (stock <= 20) return 'bg-blue-100 text-blue-700';
  return 'bg-green-100 text-green-700';
}

export default function StockListado() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('stock');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/products').then(({ data }) => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  const handleStockUpdate = useCallback((updated: unknown) => {
    setProducts(updated as Product[]);
  }, []);
  useSocket('stock-update', handleStockUpdate);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(a => !a);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filtered = products
    .filter(p =>
      search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'stock') cmp = a.stock - b.stock;
      else if (sortKey === 'price') cmp = a.price - b.price;
      else if (sortKey === 'category') cmp = a.category.name.localeCompare(b.category.name);
      return sortAsc ? cmp : -cmp;
    });

  const sinStock = products.filter(p => p.stock === 0).length;
  const stockCritico = products.filter(p => p.stock > 0 && p.stock <= 5).length;
  const totalUnidades = products.reduce((s, p) => s + p.stock, 0);

  const SortBtn = ({ col, label }: { col: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className="flex items-center gap-1 hover:text-gray-800 transition group"
    >
      {label}
      <span className={`${sortKey === col ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
        {sortKey === col ? (sortAsc ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">Cargando...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total artículos', value: products.length, cls: 'text-gray-900' },
            { label: 'Total unidades', value: totalUnidades, cls: 'text-gray-900' },
            { label: 'Stock crítico', value: stockCritico, cls: 'text-yellow-600' },
            { label: 'Sin stock', value: sinStock, cls: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-xs text-gray-400">{s.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${s.cls}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            placeholder="Buscar por nombre o categoría..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-5 py-3 text-left"><SortBtn col="name" label="Artículo" /></th>
                <th className="px-5 py-3 text-left"><SortBtn col="category" label="Categoría" /></th>
                <th className="px-5 py-3 text-right"><SortBtn col="price" label="Precio" /></th>
                <th className="px-5 py-3 text-right"><SortBtn col="stock" label="Stock" /></th>
                <th className="px-5 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-5 py-3 text-gray-500">{p.category.name}</td>
                  <td className="px-5 py-3 text-right text-gray-700">${p.price.toLocaleString('es-AR')}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full ${stockBadge(p.stock)}`}>
                      {p.stock === 0 ? 'SIN STOCK' : p.stock}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-gray-700">
                    ${(p.price * p.stock).toLocaleString('es-AR')}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200 font-semibold text-sm">
                <td colSpan={4} className="px-5 py-3 text-right text-gray-700">Valor total inventario</td>
                <td className="px-5 py-3 text-right text-green-600">
                  ${products.reduce((s, p) => s + p.price * p.stock, 0).toLocaleString('es-AR')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
