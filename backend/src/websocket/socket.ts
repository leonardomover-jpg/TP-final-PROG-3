// ============================================================
//  WEBSOCKET — COMUNICACIÓN EN TIEMPO REAL (socket.ts)
//  Socket.io permite comunicación bidireccional entre servidor y clientes.
//  En este sistema se usa para avisar a todos los navegadores conectados
//  cuando el stock de un producto cambia (al registrar una venta).
//
//  ¿Por qué WebSocket en lugar de que el frontend recargue la página?
//  → Con WebSocket el cambio aparece INSTANTÁNEAMENTE sin necesidad de
//    que el usuario recargue o haga polling manual.
// ============================================================

import { Server }           from 'socket.io';
import { Server as HttpServer } from 'http';

// Instancia global de Socket.io — se inicializa una sola vez al arrancar el servidor
let io: Server;

/**
 * initSocket — Inicializa el servidor de WebSocket sobre el servidor HTTP.
 * Se llama una sola vez en index.ts al arrancar la aplicación.
 *
 * @param httpServer - El servidor HTTP de Node.js (que también sirve la API REST)
 *
 * Eventos que maneja:
 *  - 'connection'   → Se dispara cuando un cliente (navegador) se conecta
 *  - 'disconnect'   → Se dispara cuando un cliente cierra el navegador o pierde conexión
 */
export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: { origin: '*' }, // Permite conexiones desde cualquier origen (frontend)
  });

  io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('disconnect', () =>
      console.log('Cliente desconectado:', socket.id)
    );
  });
};

/**
 * getIO — Devuelve la instancia de Socket.io para emitir eventos desde otros módulos.
 * Se usa en sale.service.ts para emitir el evento 'stock-update' después de cada venta.
 *
 * @returns La instancia activa de Socket.io
 * @throws  Error si se llama antes de que initSocket() haya sido ejecutado
 *
 * Ejemplo de uso:
 *   getIO().emit('stock-update', listaDeProductos)
 *   → Envía el evento a TODOS los clientes conectados al mismo tiempo
 */
export const getIO = () => {
  if (!io) throw new Error('Socket.io no inicializado');
  return io;
};
