export default function ServiciosTecnicos() {
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg mx-auto mt-16 text-center">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Servicios Técnicos</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          Este módulo está en desarrollo. Aquí podrás gestionar órdenes de servicio técnico,
          asignación de técnicos, seguimiento de reparaciones y presupuestos.
        </p>
        <div className="mt-6 bg-purple-50 border border-purple-200 rounded-xl p-4 text-left">
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Funcionalidades planificadas</p>
          <ul className="text-sm text-purple-600 space-y-1">
            <li>• Registro de órdenes de trabajo</li>
            <li>• Asignación de técnicos responsables</li>
            <li>• Estados: Pendiente / En proceso / Finalizado</li>
            <li>• Presupuestos y aprobación del cliente</li>
            <li>• Historial por cliente y equipo</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
