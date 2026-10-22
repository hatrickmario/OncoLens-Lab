import { createHmac } from 'node:crypto';

/** Separa el dominio del índice del documento del del nombre, que usan la misma clave (D2 de L1D-200, D1 de L1D-202). */
const PREFIJO_DE_DOCUMENTO = 'doc';
const PREFIJO_DE_NOMBRE = 'nombre';

export interface IndiceCiego {
  /** HMAC-SHA256 en hex de `idType` y el número normalizado; el país emisor no entra (D2). */
  indiceDeDocumento(idType: string, numeroDeDocumento: string): string;
  /** HMAC-SHA256 en hex del nombre completo normalizado (sin tildes, en minúsculas, espacios colapsados). */
  indiceDeNombre(nombreCompleto: string): string;
}

/** Mayúsculas y sin espacios, puntos ni guiones: `1.234.567` y `1234567` son el mismo documento. */
export function normalizarNumeroDeDocumento(numeroDeDocumento: string): string {
  return numeroDeDocumento.replace(/[\s.-]/g, '').toUpperCase();
}

/** Sin marcas diacríticas (Unicode NFD), en minúsculas y con los espacios colapsados a uno: `Lucía  PEÑA` y `lucia peña` son el mismo nombre. */
export function normalizarNombre(nombreCompleto: string): string {
  return nombreCompleto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((palabra) => palabra !== '')
    .join(' ');
}

export function crearIndiceCiego(clave: Buffer): IndiceCiego {
  const hmacDe = (mensaje: string): string =>
    createHmac('sha256', clave).update(mensaje).digest('hex');
  return {
    indiceDeDocumento: (idType, numeroDeDocumento) =>
      hmacDe(`${PREFIJO_DE_DOCUMENTO}|${idType}|${normalizarNumeroDeDocumento(numeroDeDocumento)}`),
    indiceDeNombre: (nombreCompleto) =>
      hmacDe(`${PREFIJO_DE_NOMBRE}|${normalizarNombre(nombreCompleto)}`),
  };
}
