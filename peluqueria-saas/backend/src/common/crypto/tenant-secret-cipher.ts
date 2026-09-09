import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { InternalServerErrorException } from '@nestjs/common';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recomendado para GCM

/**
 * Cifrado a nivel de aplicación de credenciales POR TENANT (Mercado Pago
 * de cada negocio, Etapa 15 — doc `05-OBSERVACIONES-Y-RIESGOS.md` §6).
 * Distinto de un hash (Argon2id de contraseñas, Etapa 2): acá el texto
 * plano se necesita de vuelta para llamar a la API de Mercado Pago, así
 * que es cifrado reversible, nunca texto plano en la base.
 *
 * Clave desde `TENANT_SECRETS_ENCRYPTION_KEY` (32 bytes en hex, ej.
 * `openssl rand -hex 32`) — un secreto de LA PLATAFORMA (variable de
 * entorno, punto 92 del pedido), distinto del secreto de cada tenant que
 * cifra. Formato guardado: `iv:authTag:ciphertext` (los tres en hex).
 */
function getKey(): Buffer {
  const hex = process.env.TENANT_SECRETS_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new InternalServerErrorException(
      'TENANT_SECRETS_ENCRYPTION_KEY no está configurada (se espera un valor de 32 bytes en hex).',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptTenantSecret(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decryptTenantSecret(stored: string): string {
  const key = getKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new InternalServerErrorException('Credencial cifrada con formato inválido.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
