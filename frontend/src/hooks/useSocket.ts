// ============================================================
//  HOOK DE WEBSOCKET (hooks/useSocket.ts)
//  Hook personalizado para escuchar eventos de Socket.io en cualquier componente.
//
//  ¿Qué es un Hook personalizado?
//  → Es una función que empieza con "use" y encapsula lógica reutilizable de React.
//    En lugar de repetir el código de socket.on/socket.off en cada componente,
//    lo escribimos una sola vez acá y lo reutilizamos donde sea necesario.
//
//  ¿Qué es un Singleton?
//  → La variable `socket` se crea UNA SOLA VEZ cuando se importa el módulo.
//    Todos los componentes que usen este hook comparten la misma conexión.
//    Sin singleton, cada componente crearía su propia conexión al servidor (ineficiente).
// ============================================================

import { useEffect } from 'react';
import { io } from 'socket.io-client';

// Singleton: conexión única compartida por toda la app
// Se conecta al servidor en localhost:3000 (el backend)
const socket = io('http://localhost:3000');

/**
 * useSocket — Se suscribe a un evento de WebSocket y ejecuta el handler cuando ocurre.
 * Se desuscribe automáticamente cuando el componente se desmonta (limpieza de memoria).
 *
 * @param event   - Nombre del evento a escuchar (ej: 'stock-update')
 * @param handler - Función que se ejecuta cuando el servidor emite ese evento
 *
 * Ejemplo de uso en un componente:
 *   useSocket('stock-update', (productos) => {
 *     setProducts(productos as Product[]);
 *   });
 *
 * ¿Por qué el return dentro de useEffect?
 * → React llama esa función de limpieza cuando el componente se desmonta.
 *   socket.off() cancela la suscripción para evitar memory leaks (fugas de memoria).
 */
export const useSocket = (event: string, handler: (data: unknown) => void) => {
  useEffect(() => {
    // Nos suscribimos al evento
    socket.on(event, handler);

    // Función de limpieza: cancelamos la suscripción al desmontar el componente
    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]); // Solo se re-ejecuta si cambia el evento o el handler
};
