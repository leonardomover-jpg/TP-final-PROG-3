// ============================================================
//  SERVICIO DE AUTENTICACIÓN (auth.service.ts)
//  Contiene la lógica de negocio para registrar e iniciar sesión.
//  Los servicios son la capa intermedia entre los controladores y la base de datos.
//  Nunca deben manejar req/res — eso es responsabilidad del controlador.
// ============================================================

import bcrypt      from 'bcryptjs';        // Librería para hashear contraseñas de forma segura
import jwt         from 'jsonwebtoken';    // Librería para crear y verificar tokens de sesión
import { PrismaClient } from '@prisma/client'; // Cliente generado por Prisma para acceder a la BD

const prisma     = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

/**
 * register — Registra un nuevo usuario en la base de datos.
 *
 * @param email    - Email único del usuario
 * @param password - Contraseña en texto plano (se hashea antes de guardar)
 * @param role     - Rol asignado: "Admin" o "User" (por defecto "User")
 * @returns        El usuario creado (sin la contraseña hasheada en la respuesta del controlador)
 *
 * Proceso:
 *  1. Genera un hash de la contraseña con bcrypt (salt rounds = 10)
 *     → Cuanto mayor el número, más seguro pero más lento (10 es el estándar)
 *  2. Guarda el usuario con la contraseña hasheada en la tabla User
 */
export const register = async (email: string, password: string, role: string = 'User') => {
  // bcrypt.hash convierte "1234" en algo como "$2a$10$Xk..." que no se puede revertir
  const hashed = await bcrypt.hash(password, 10);
  return prisma.user.create({ data: { email, password: hashed, role } });
};

/**
 * login — Verifica credenciales y devuelve un token JWT si son correctas.
 *
 * @param email    - Email del usuario
 * @param password - Contraseña ingresada en texto plano
 * @returns        Un objeto con el token JWT y los datos públicos del usuario
 * @throws         Error si el usuario no existe o la contraseña no coincide
 *
 * Proceso:
 *  1. Busca el usuario por email en la base de datos
 *  2. Compara la contraseña ingresada con el hash guardado usando bcrypt.compare
 *  3. Si es válida, genera un token JWT firmado que expira en 1 día
 *     → El token lleva el ID y rol del usuario "dentro" para que los middlewares lo lean
 */
export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error('Usuario no encontrado');

  // bcrypt.compare compara la contraseña ingresada con el hash guardado
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error('Contraseña incorrecta');

  // jwt.sign crea un token que contiene { id, role } y expira en 1 día
  // El frontend lo guarda en localStorage y lo envía en cada petición
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

  return { token, user: { id: user.id, email: user.email, role: user.role } };
};
