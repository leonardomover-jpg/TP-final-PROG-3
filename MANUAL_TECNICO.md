# Manual Técnico — SH Servicios
## Sistema de Gestión de Inventario y Ventas

---

## Índice

1. [¿Qué es el sistema?](#1-qué-es-el-sistema)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura General](#3-arquitectura-general)
4. [Modelo de Base de Datos](#4-modelo-de-base-de-datos)
5. [Backend — Cómo está organizado](#5-backend--cómo-está-organizado)
6. [Autenticación y Seguridad](#6-autenticación-y-seguridad)
7. [API REST — Endpoints disponibles](#7-api-rest--endpoints-disponibles)
8. [WebSockets — Tiempo Real](#8-websockets--tiempo-real)
9. [Frontend — Cómo está organizado](#9-frontend--cómo-está-organizado)
10. [Descripción de cada pantalla](#10-descripción-de-cada-pantalla)
11. [Flujo completo de una venta](#11-flujo-completo-de-una-venta)
12. [Roles y permisos](#12-roles-y-permisos)

---

## 1. ¿Qué es el sistema?

**SH Servicios** es una aplicación web completa (Full-Stack) para gestionar el stock, los artículos y las ventas de un comercio.

Permite:
- **Administrar artículos**: crear, editar y eliminar productos con su precio y stock.
- **Registrar ventas** desde un punto de venta visual (carrito de compras).
- **Ver el stock en tiempo real**: cuando se hace una venta, el stock se actualiza automáticamente en todas las pantallas abiertas, sin necesidad de recargar la página.
- **Consultar el historial de facturación** con el detalle de cada transacción.
- **Gestionar categorías** para organizar los artículos.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Para qué se usa |
|------|-----------|-----------------|
| **Backend** | Node.js + Express | Servidor HTTP que recibe las peticiones del frontend |
| **Lenguaje** | TypeScript | Tipado estático para evitar errores en tiempo de desarrollo |
| **ORM** | Prisma | Abstracción de la base de datos (se escribe código TypeScript en vez de SQL) |
| **Base de Datos** | SQLite (desarrollo) / PostgreSQL (producción) | Almacena todos los datos del sistema |
| **Autenticación** | JWT (JSON Web Token) | Tokens de sesión que viajan en cada petición |
| **Encriptación** | Bcrypt | Hashea (encripta) las contraseñas antes de guardarlas |
| **Tiempo real** | Socket.io | Canal de comunicación bidireccional entre servidor y cliente |
| **Frontend** | React + TypeScript | Interfaz de usuario dinámica |
| **Estilos** | Tailwind CSS | Framework CSS utilitario para diseñar sin escribir CSS propio |
| **Bundler** | Vite | Compila y sirve el frontend muy rápido en desarrollo |

---

## 3. Arquitectura General

```
┌─────────────────────────────────────────────────────────────┐
│                        NAVEGADOR                            │
│                                                             │
│   React App (http://localhost:5173)                        │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│   │  Componentes │  │   Context    │  │  Socket.io      │ │
│   │  (UI)        │  │   (Estado    │  │  client         │ │
│   │              │  │   global)    │  │  (tiempo real)  │ │
│   └──────┬───────┘  └──────────────┘  └────────┬────────┘ │
│          │ HTTP (Axios)                          │ WS       │
└──────────┼───────────────────────────────────────┼─────────┘
           │                                       │
           ▼                                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js)                        │
│                  http://localhost:3000                        │
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│   │  Routes  │→ │Controller│→ │ Service  │→ │  Prisma  │  │
│   │ (URLs)   │  │(lógica   │  │(reglas de│  │  (ORM)   │  │
│   │          │  │ HTTP)    │  │ negocio) │  │          │  │
│   └──────────┘  └──────────┘  └──────────┘  └────┬─────┘  │
│                                                    │        │
│   ┌────────────────────────────────────────────┐   │        │
│   │  Middleware de Autenticación (JWT)         │   │        │
│   └────────────────────────────────────────────┘   │        │
│                                                    │        │
│   ┌────────────────────────────────────────────┐   │        │
│   │  Socket.io Server (eventos tiempo real)   │   │        │
│   └────────────────────────────────────────────┘   │        │
└────────────────────────────────────────────────────┼────────┘
                                                     │
                                                     ▼
                                         ┌───────────────────┐
                                         │   BASE DE DATOS   │
                                         │     (SQLite)      │
                                         │                   │
                                         │  Users            │
                                         │  Categories       │
                                         │  Products         │
                                         │  Sales            │
                                         │  SaleDetails      │
                                         └───────────────────┘
```

**Flujo de una petición típica:**
1. El usuario hace clic en un botón en el navegador.
2. React llama a la API del backend (con Axios).
3. El backend recibe la petición, verifica el JWT (autenticación).
4. El Controller delega al Service la lógica de negocio.
5. El Service usa Prisma para leer/escribir en la base de datos.
6. El resultado vuelve al frontend y React actualiza la pantalla.

---

## 4. Modelo de Base de Datos

Estas son las 5 tablas del sistema y cómo se relacionan:

```
┌─────────────┐         ┌─────────────┐
│    User     │         │  Category   │
│─────────────│         │─────────────│
│ id (PK)     │         │ id (PK)     │
│ email       │         │ name        │
│ password    │         └──────┬──────┘
│ role        │                │ 1
└──────┬──────┘                │
       │ 1                     │ N
       │ N                ┌────▼────────┐
  ┌────▼────────┐         │   Product   │
  │    Sale     │         │─────────────│
  │─────────────│         │ id (PK)     │
  │ id (PK)     │         │ name        │
  │ total       │         │ price       │
  │ createdAt   │         │ stock       │
  │ userId (FK) │         │ categoryId  │
  └──────┬──────┘         └──────┬──────┘
         │ 1                     │ 1
         │ N                     │ N
    ┌────▼──────────────────────▼──┐
    │         SaleDetail           │
    │──────────────────────────────│
    │ id (PK)                      │
    │ saleId (FK)  → Sale          │
    │ productId (FK) → Product     │
    │ quantity                     │
    │ unitPrice                    │
    └──────────────────────────────┘
```

### Explicación de cada tabla

**User** — Usuarios del sistema
- `id`: número único que identifica al usuario
- `email`: correo electrónico (único, se usa para login)
- `password`: contraseña encriptada con Bcrypt (nunca se guarda en texto plano)
- `role`: puede ser `"Admin"` o `"User"`

**Category** — Categorías de artículos
- `id`: número único
- `name`: nombre de la categoría (ej: "Electrónica", "Ropa")

**Product** — Artículos del inventario
- `id`: número único
- `name`: nombre del artículo
- `price`: precio de venta
- `stock`: cantidad disponible en inventario
- `categoryId`: FK que lo vincula a una categoría

**Sale** — Cabecera de cada venta
- `id`: número de venta
- `total`: importe total de la venta
- `createdAt`: fecha y hora automática
- `userId`: FK que indica qué usuario hizo la venta

**SaleDetail** — Líneas de detalle de cada venta
- Una venta puede tener varios productos → cada fila es un producto de esa venta
- `quantity`: cantidad vendida
- `unitPrice`: precio al momento de la venta (se guarda para no perder historial si el precio cambia)

---

## 5. Backend — Cómo está organizado

El backend usa una **arquitectura de 3 capas**. Cada capa tiene una responsabilidad específica:

```
src/
├── index.ts               ← Punto de entrada: arranca el servidor
├── middlewares/
│   └── auth.ts            ← Verifica el JWT en cada petición protegida
├── routes/
│   ├── auth.routes.ts     ← Define las URLs de autenticación
│   ├── category.routes.ts ← Define las URLs de categorías
│   ├── product.routes.ts  ← Define las URLs de productos
│   └── sale.routes.ts     ← Define las URLs de ventas
├── controllers/
│   ├── auth.controller.ts     ← Maneja la petición HTTP y responde
│   ├── category.controller.ts
│   ├── product.controller.ts
│   └── sale.controller.ts
├── services/
│   ├── auth.service.ts        ← Lógica de negocio: registrar, login
│   ├── category.service.ts    ← Lógica: crear, listar categorías
│   ├── product.service.ts     ← Lógica: CRUD de productos
│   └── sale.service.ts        ← Lógica: crear venta + transacción
└── websocket/
    └── socket.ts              ← Configuración del servidor Socket.io
```

### ¿Por qué separar en capas?

| Capa | Responsabilidad | No sabe de... |
|------|----------------|---------------|
| **Routes** | Define la URL y qué método HTTP acepta | La base de datos |
| **Controller** | Recibe el request, llama al service, devuelve response | La base de datos |
| **Service** | Contiene la lógica del negocio | HTTP, requests, responses |

**Ventaja:** si mañana cambio la base de datos, solo modifico el Service. Si cambio la URL, solo modifico la Route. Cada parte es independiente.

---

## 6. Autenticación y Seguridad

### ¿Cómo funciona el login?

```
1. Usuario envía email + contraseña
         ↓
2. Backend busca el email en la BD
         ↓
3. Bcrypt compara la contraseña con el hash guardado
         ↓
4. Si coincide → genera un JWT firmado con una clave secreta
         ↓
5. El frontend guarda el JWT en localStorage
         ↓
6. Cada petición posterior incluye el JWT en el header:
   Authorization: Bearer <token>
         ↓
7. El middleware auth.ts verifica la firma del token
         ↓
8. Si el token es válido → la petición pasa al controller
   Si no → responde con 401 Unauthorized
```

### ¿Qué es un JWT?

Un JWT (JSON Web Token) tiene 3 partes separadas por puntos:

```
eyJhbGciOiJIUzI1NiJ9  .  eyJpZCI6MSwidHJvbGUiOiJBZG1pbiJ9  .  firma
     HEADER                          PAYLOAD                      SIGNATURE
  (algoritmo)               (datos: id de usuario, rol)         (verificación)
```

El **payload** contiene el `id` y el `role` del usuario. El backend los lee para saber quién está haciendo la petición y qué permisos tiene.

### ¿Por qué Bcrypt?

Las contraseñas **nunca** se guardan en texto plano. Bcrypt genera un "hash" (cadena irreversible). Si alguien roba la base de datos, no puede saber las contraseñas originales.

```
"admin123"  →  Bcrypt  →  "$2b$10$abc123xyz..."   ← esto es lo que se guarda
```

---

## 7. API REST — Endpoints disponibles

### Autenticación (sin token)

| Método | URL | Qué hace |
|--------|-----|---------|
| `POST` | `/api/auth/register` | Registra un usuario nuevo |
| `POST` | `/api/auth/login` | Devuelve un JWT si las credenciales son correctas |

**Body para register:**
```json
{
  "email": "admin@sh.com",
  "password": "admin123",
  "role": "Admin"
}
```

**Respuesta de login:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": { "id": 1, "email": "admin@sh.com", "role": "Admin" }
}
```

---

### Categorías (requiere token)

| Método | URL | Rol requerido | Qué hace |
|--------|-----|--------------|---------|
| `GET` | `/api/categories` | User o Admin | Lista todas las categorías |
| `POST` | `/api/categories` | Solo Admin | Crea una categoría nueva |

---

### Productos (requiere token)

| Método | URL | Rol requerido | Qué hace |
|--------|-----|--------------|---------|
| `GET` | `/api/products` | User o Admin | Lista todos los productos con su categoría |
| `GET` | `/api/products/:id` | User o Admin | Obtiene un producto por ID |
| `POST` | `/api/products` | Solo Admin | Crea un producto nuevo |
| `PUT` | `/api/products/:id` | Solo Admin | Modifica un producto |
| `DELETE` | `/api/products/:id` | Solo Admin | Elimina un producto |

**Body para crear producto:**
```json
{
  "name": "Notebook Lenovo",
  "price": 850000,
  "stock": 12,
  "categoryId": 1
}
```

---

### Ventas (requiere token)

| Método | URL | Rol requerido | Qué hace |
|--------|-----|--------------|---------|
| `POST` | `/api/sales` | User o Admin | Registra una venta nueva |
| `GET` | `/api/sales` | User o Admin | Lista el historial de ventas |

**Body para crear una venta:**
```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 3, "quantity": 1 }
  ]
}
```

---

## 8. WebSockets — Tiempo Real

### ¿Qué es un WebSocket?

HTTP normal: el cliente **pide** → el servidor **responde** → conexión cerrada.

WebSocket: la conexión se mantiene **abierta** y ambos lados pueden enviar mensajes en cualquier momento.

```
HTTP normal:
  Cliente ──── GET /products ──→ Servidor
  Cliente ←─── [lista] ──────── Servidor
  (conexión cerrada)

WebSocket:
  Cliente ←───── conexión abierta ─────→ Servidor
  Cliente ←─── "stock-update" ─────────  Servidor  ← el servidor avisa sin que se lo pidan
```

### ¿Cómo lo usa SH Servicios?

**Cuando se hace una venta:**

```
1. Usuario A hace una venta en su navegador
        ↓
2. Backend procesa la venta con una transacción
        ↓
3. Backend actualiza el stock de cada producto vendido
        ↓
4. Backend emite el evento "stock-update" con la lista actualizada
        ↓
5. TODOS los navegadores conectados reciben el evento
        ↓
6. React actualiza los productos automáticamente (sin recargar)
```

**Código clave en el backend** (`sale.service.ts`):
```typescript
// Dentro de la transacción de Prisma:
const updatedProducts = await tx.product.findMany({ include: { category: true } });
getIO().emit('stock-update', updatedProducts);  // ← avisa a todos los clientes
```

**Código clave en el frontend** (`hooks/useSocket.ts`):
```typescript
const socket = io('http://localhost:3000');  // conexión persistente

export const useSocket = (event: string, handler: Function) => {
  useEffect(() => {
    socket.on(event, handler);   // escucha el evento
    return () => socket.off(event, handler);  // limpia al desmontar
  }, [event, handler]);
};
```

---

## 9. Frontend — Cómo está organizado

```
frontend/src/
├── main.tsx            ← Punto de entrada: monta React en el HTML
├── App.tsx             ← Componente raíz: maneja autenticación y navegación
├── index.css           ← Importa Tailwind CSS
│
├── types/
│   └── index.ts        ← Tipos TypeScript compartidos (Product, Sale, etc.)
│
├── services/
│   └── api.ts          ← Instancia de Axios con el token JWT automático
│
├── context/
│   └── AuthContext.tsx ← Estado global de autenticación (usuario logueado)
│
├── hooks/
│   └── useSocket.ts    ← Hook para escuchar eventos WebSocket
│
├── components/         ← Componentes reutilizables
│   ├── Layout.tsx      ← Estructura: sidebar + header + contenido
│   ├── Sidebar.tsx     ← Menú lateral con secciones y acordeón
│   ├── Login.tsx       ← Formulario de login
│   ├── Register.tsx    ← Formulario de registro
│   ├── ProductForm.tsx ← Modal para crear/editar artículos
│   └── SaleForm.tsx    ← Modal para registrar una venta simple
│
└── pages/              ← Una página por cada sección del sistema
    ├── PuntoDeVenta.tsx    ← Caja registradora con carrito
    ├── Facturacion.tsx     ← Historial de ventas
    ├── Articulos.tsx       ← ABM de productos
    ├── StockListado.tsx    ← Vista de inventario con tabla ordenable
    ├── Alquiler.tsx        ← Módulo en desarrollo
    ├── ServiciosTecnicos.tsx ← Módulo en desarrollo
    └── Configuracion.tsx   ← Categorías y cuenta de usuario
```

### ¿Qué es un Context?

`AuthContext` es un estado **global** que guarda el usuario logueado. Cualquier componente puede leerlo sin necesidad de pasarlo como prop de padre a hijo. Se implementa con la API nativa de React (`createContext` + `useContext`).

### ¿Qué es un Custom Hook?

`useSocket` es un **hook personalizado**: una función que encapsula lógica reutilizable con hooks de React. Se usa en cualquier página que necesite escuchar eventos del WebSocket.

---

## 10. Descripción de cada pantalla

### 10.1 Login y Registro

**Qué hace:** permite ingresar al sistema.
- El formulario envía `POST /api/auth/login`
- Si el login es exitoso, el token JWT se guarda en `localStorage`
- La aplicación guarda el usuario en el `AuthContext`
- React redirige automáticamente al panel principal

---

### 10.2 Punto de Venta

**Sección:** Ventas › Punto de Venta

**Qué hace:** es la caja registradora del sistema. Permite hacer una venta de forma visual.

**Cómo funciona:**
1. Se muestran todos los artículos disponibles como tarjetas clicables.
2. Al hacer clic en una tarjeta, el artículo se agrega al **carrito** (panel derecho).
3. Se puede ajustar la cantidad con los botones `+` y `−`.
4. El total se calcula en tiempo real (`precio × cantidad` de cada ítem).
5. Al confirmar la venta, se envía `POST /api/sales` con la lista de ítems.
6. El backend descuenta el stock y emite `stock-update` vía WebSocket.
7. Las tarjetas de productos se actualizan automáticamente.

**Reglas de negocio:**
- No se puede agregar más unidades de las disponibles en stock.
- Los productos sin stock aparecen desactivados (no clicables).
- Si dos personas usan el sistema al mismo tiempo, ambas ven el stock actualizado al instante.

---

### 10.3 Facturación

**Sección:** Ventas › Facturación

**Qué hace:** muestra el historial completo de todas las ventas registradas.

**Características:**
- Resumen en la parte superior: total de ventas, total facturado, ticket promedio.
- Tabla con: número de venta, fecha, usuario, cantidad de ítems y total.
- Cada fila tiene un botón "Detalle" que despliega los productos vendidos, cantidades y subtotales.

---

### 10.4 Artículos

**Sección:** Ventas › Artículos

**Qué hace:** permite gestionar el catálogo completo de artículos (solo Admin puede modificar).

**Operaciones disponibles (CRUD):**
- **Crear** (Admin): abre un modal con formulario.
- **Editar** (Admin): precarga los datos del artículo en el mismo modal.
- **Eliminar** (Admin): pide confirmación antes de borrar.
- **Listar**: todos pueden ver los artículos.

**Filtro por categoría:** botones tipo "tabs" que filtran la grilla instantáneamente (filtrado local, sin llamadas adicionales al servidor).

---

### 10.5 Stock — Listado

**Sección:** Ventas › Stock › Listado

**Qué hace:** vista de solo lectura del inventario completo. Ideal para consultar el estado del stock.

**Características:**
- Tabla con: artículo, categoría, precio, stock actual, valor en stock.
- **Ordenable** por cualquier columna (clic en el encabezado).
- **Buscador** por nombre o categoría (filtrado local).
- Código de colores: verde (normal), amarillo (≤20), rojo (sin stock).
- Total del valor del inventario en el pie de la tabla.
- Se actualiza en tiempo real vía WebSocket cuando hay una venta.

---

### 10.6 Alquiler y Servicios Técnicos

**Estado:** módulos en desarrollo.

Muestran las funcionalidades planificadas para futuras versiones del sistema.

---

### 10.7 Configuración

**Sección:** menú inferior del sidebar.

**Qué hace:** administración de categorías y datos de cuenta.

- Muestra el usuario logueado y su rol.
- (Admin) Formulario para crear nuevas categorías.
- Lista todas las categorías con la cantidad de artículos que tiene cada una.

---

## 11. Flujo completo de una venta

Este es el proceso más importante del sistema. Involucra todas las capas:

```
[FRONTEND]                    [BACKEND]                  [BASE DE DATOS]

Usuario hace clic
"Confirmar Venta"
       │
       │ POST /api/sales
       │ { items: [...] }
       │ + JWT en header
       ▼
                         Middleware auth.ts
                         verifica el JWT
                              │
                         sale.controller.ts
                         extrae userId del token
                              │
                         sale.service.ts
                         inicia transacción Prisma ─────────────────────┐
                              │                                          │
                         Para cada ítem:                     Transacción en SQLite:
                         1. Busca el producto ──────────────── SELECT Product WHERE id=?
                         2. Verifica el stock ◄─────────────── ¿stock >= quantity?
                              │ Si no hay stock:
                              │ lanza Error → HTTP 400
                              │
                         3. Descuenta el stock ─────────────── UPDATE Product SET stock -= qty
                         4. Calcula subtotal
                              │
                         5. Crea la venta ───────────────────── INSERT Sale (total, userId)
                         6. Crea los detalles ──────────────── INSERT SaleDetails (...)
                              │
                         ─────────── FIN DE TRANSACCIÓN ──────────────────┘
                              │  (si algo falla, se revierte TODO)
                              │
                         Emite "stock-update"
                         vía Socket.io ────────────────────────────────────────────┐
                              │                                                    │
       ◄──── HTTP 201 ────────┘                                                    │
       Venta creada ✓                                                              │
                                                                         [TODOS LOS]
                                                                         [NAVEGADORES]
                                                                              │
                                                                    React recibe "stock-update"
                                                                    setProducts(updatedProducts)
                                                                    La UI se actualiza solo ✓
```

### ¿Qué es una transacción de Prisma?

Una transacción garantiza que **todas las operaciones se ejecuten juntas o ninguna**. Si hay un error a mitad (por ejemplo, el segundo producto no tiene stock), **todo se revierte** y la venta no se registra. Esto evita inconsistencias en la base de datos.

---

## 12. Roles y permisos

El sistema tiene dos roles. Se definen al registrarse y se incluyen en el JWT.

| Funcionalidad | User | Admin |
|---|:---:|:---:|
| Ver artículos | ✓ | ✓ |
| Ver stock | ✓ | ✓ |
| Registrar ventas | ✓ | ✓ |
| Ver historial de ventas | ✓ | ✓ |
| Crear artículos | ✗ | ✓ |
| Editar artículos | ✗ | ✓ |
| Eliminar artículos | ✗ | ✓ |
| Crear categorías | ✗ | ✓ |

**¿Cómo se aplica en el backend?**

El middleware `requireAdmin` verifica el rol dentro del JWT antes de permitir el acceso a esas rutas:

```typescript
// product.routes.ts
router.get('/',    authenticate, getAll);         // cualquier usuario
router.post('/',   authenticate, requireAdmin, create);   // solo Admin
router.put('/:id', authenticate, requireAdmin, update);   // solo Admin
router.delete('/:id', authenticate, requireAdmin, remove); // solo Admin
```

---

## Glosario rápido para la exposición

| Término | Definición simple |
|---------|------------------|
| **API REST** | Conjunto de URLs del backend que el frontend puede consultar |
| **JWT** | Token firmado que prueba que el usuario está autenticado |
| **Bcrypt** | Función que convierte contraseñas en hashes irreversibles |
| **ORM** | Herramienta que permite trabajar con la base de datos usando código TypeScript en vez de SQL |
| **Prisma** | El ORM que usa este proyecto |
| **Transacción** | Grupo de operaciones en la BD que se ejecutan todas juntas o ninguna |
| **WebSocket** | Conexión persistente que permite enviar datos sin que el cliente los pida |
| **Socket.io** | Librería que facilita el uso de WebSockets |
| **Middleware** | Función que se ejecuta entre la petición y el controller (ej: verificar el JWT) |
| **Hook** | Función de React que encapsula lógica reutilizable |
| **Context** | Estado global de React accesible desde cualquier componente |
| **Tailwind CSS** | Framework CSS de clases utilitarias |
| **Vite** | Herramienta que compila y sirve el frontend en desarrollo |
| **HMR** | Hot Module Replacement: Vite actualiza el navegador al guardar un archivo |
| **TypeScript** | JavaScript con tipado estático que detecta errores antes de ejecutar |

---

*Manual técnico — SH Servicios — TIF Programación III*
