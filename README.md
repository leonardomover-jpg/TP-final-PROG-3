# Stock Manager — TIF

Sistema de Gestión de Inventario y Ventas con actualizaciones en tiempo real.

## Stack
- **Backend:** Node.js + Express + TypeScript + Prisma ORM
- **Base de datos:** PostgreSQL
- **Frontend:** React + TypeScript + Tailwind CSS
- **Tiempo real:** Socket.io
- **Auth:** JWT + Bcrypt

---

## Setup paso a paso

### 1. Requisitos previos
- Node.js (v18 o superior)
- PostgreSQL corriendo localmente (o en la nube)

---

### 2. Backend

```bash
cd backend
npm install
```

Crear el archivo `.env` (copiar de `.env.example`):
```bash
cp .env.example .env
```

Editar `.env` con tus datos de PostgreSQL:
```
DATABASE_URL="postgresql://TU_USUARIO:TU_CONTRASEÑA@localhost:5432/stockdb"
JWT_SECRET="cualquier-clave-secreta"
PORT=3000
```

Crear la base de datos y correr las migraciones:
```bash
npm run prisma:migrate
```

Iniciar el servidor:
```bash
npm run dev
```

El backend queda en `http://localhost:3000`

---

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

El frontend queda en `http://localhost:5173`

---

## Uso

1. Abrir `http://localhost:5173`
2. Registrarse como **Admin** para poder crear/editar/eliminar productos
3. Registrarse como **User** para hacer ventas y ver el stock
4. Al hacer una venta, el stock se actualiza automáticamente en **todos los navegadores abiertos** (WebSocket)

---

## Endpoints de la API

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /api/auth/register | No | Registrar usuario |
| POST | /api/auth/login | No | Login |
| GET | /api/categories | JWT | Listar categorías |
| POST | /api/categories | JWT + Admin | Crear categoría |
| GET | /api/products | JWT | Listar productos |
| POST | /api/products | JWT + Admin | Crear producto |
| PUT | /api/products/:id | JWT + Admin | Editar producto |
| DELETE | /api/products/:id | JWT + Admin | Eliminar producto |
| POST | /api/sales | JWT | Registrar venta |
| GET | /api/sales | JWT | Ver historial de ventas |

---

## WebSocket

El servidor emite el evento `stock-update` con la lista completa de productos actualizada cada vez que se registra una venta exitosa.

---

## Estructura de carpetas

```
TPF_PROG3/
├── backend/
│   ├── prisma/schema.prisma
│   └── src/
│       ├── controllers/
│       ├── services/
│       ├── routes/
│       ├── middlewares/
│       └── websocket/
└── frontend/
    └── src/
        ├── components/
        ├── context/
        ├── hooks/
        └── services/
```
