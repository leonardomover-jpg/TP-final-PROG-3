// ============================================================
//  TIPOS E INTERFACES GLOBALES (types/index.ts)
//  Define la forma (estructura) de los datos que usa el frontend.
//  TypeScript usa estas interfaces para detectar errores de tipo
//  en tiempo de compilación antes de ejecutar el código.
// ============================================================

/** Representa una categoría de productos */
export interface Category {
  id:   number; // ID único en la base de datos
  name: string; // Nombre de la categoría (ej: "Electrónica")
}

/** Representa un producto del inventario */
export interface Product {
  id:       number;   // ID único en la base de datos
  name:     string;   // Nombre del producto
  price:    number;   // Precio unitario de venta
  stock:    number;   // Cantidad disponible en inventario
  category: Category; // Categoría a la que pertenece (relación JOIN)
}

/** Representa una línea de detalle dentro de una venta */
export interface SaleDetail {
  id:        number;  // ID único del detalle
  quantity:  number;  // Unidades vendidas de este producto
  unitPrice: number;  // Precio al momento de la venta (histórico)
  product:   Product; // Datos del producto vendido
}

/** Representa una venta completa (cabecera + detalles) */
export interface Sale {
  id:        number;             // ID único de la venta
  total:     number;             // Monto total de la venta
  createdAt: string;             // Fecha/hora de la venta (string ISO 8601)
  user:      { email: string };  // Solo el email del vendedor (sin contraseña)
  details:   SaleDetail[];       // Lista de productos vendidos en esta venta
}

/**
 * PageId — Identificadores de páginas del sistema.
 * Se usa en el Sidebar y App.tsx para controlar qué página mostrar.
 * Cada valor corresponde a una sección del menú lateral.
 */
export type PageId =
  | 'punto-de-venta'      // Registrar nueva venta con carrito
  | 'facturacion'         // Historial de ventas y facturas
  | 'articulos'           // Gestión de productos (Admin)
  | 'stock-listado'       // Ver stock actual con búsqueda
  | 'alquiler'            // Módulo de alquiler (en desarrollo)
  | 'servicios-tecnicos'  // Módulo de servicios técnicos (en desarrollo)
  | 'configuracion';      // Configuración del sistema y usuarios
