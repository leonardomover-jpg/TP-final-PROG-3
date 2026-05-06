// ============================================================
//  PUNTO DE ENTRADA DEL SERVIDOR (index.ts)
//  Configura Express, conecta los módulos y arranca el servidor.
//  Todo el flujo de la app comienza acá.
// ============================================================

import 'dotenv/config';           // Carga las variables de entorno del archivo .env
import express from 'express';    // Framework HTTP para crear el servidor web
import cors from 'cors';          // Permite peticiones desde otros dominios (ej: el frontend)
import { createServer } from 'http'; // Servidor HTTP nativo de Node.js
import { initSocket } from './websocket/socket'; // Inicialización de WebSocket (tiempo real)

// Importamos los módulos de rutas — cada uno maneja un grupo de endpoints
import authRoutes     from './routes/auth.routes';
import categoryRoutes from './routes/category.routes';
import productRoutes  from './routes/product.routes';
import saleRoutes     from './routes/sale.routes';

// Creamos la app de Express
const app = express();

// Envolvemos Express en un servidor HTTP nativo para poder usar Socket.io
const httpServer = createServer(app);

// Iniciamos Socket.io sobre el servidor HTTP (necesario para tiempo real)
initSocket(httpServer);

// ── Middlewares globales ──────────────────────────────────────
// CORS: permite que el frontend (en otro puerto) llame a esta API
app.use(cors({ origin: '*' }));

// Parsea el cuerpo de las peticiones como JSON automáticamente
app.use(express.json());

// ── Rutas de la API ───────────────────────────────────────────
// Cada prefijo agrupa sus endpoints:
//   /api/auth       → registro e inicio de sesión
//   /api/categories → ABM de categorías
//   /api/products   → ABM de productos
//   /api/sales      → registro y consulta de ventas
app.use('/api/auth',       authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products',   productRoutes);
app.use('/api/sales',      saleRoutes);

// ── Arranque del servidor ─────────────────────────────────────
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
