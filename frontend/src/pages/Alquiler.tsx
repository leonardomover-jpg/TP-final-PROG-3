export default function Alquiler() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Módulo de Alquiler</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          Este módulo está en desarrollo. Aquí podrás gestionar contratos de alquiler,
          fechas de vencimiento, clientes y pagos periódicos.
        </p>
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-xl p-4 text-left">
          <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">Funcionalidades planificadas</p>
          <ul className="text-sm text-orange-600 space-y-1">
            <li>• Registro de contratos de alquiler</li>
            <li>• Control de vencimientos y renovaciones</li>
            <li>• Historial de pagos por cliente</li>
            <li>• Alertas de alquileres próximos a vencer</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
