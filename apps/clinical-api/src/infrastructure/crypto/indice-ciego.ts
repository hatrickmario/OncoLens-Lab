import { createHmac } from 'node:crypto';

/** Separa el dominio del índice del documento de futuros índices (p. ej. el del nombre) que usen la misma clave (D2). */
const PREFIJO_DE_DOCUMENTO = 'doc';

export interface IndiceCiego {
  /** HMAC-SHA256 en hex de `idType` y el número normalizado; el país emisor no entra (D2). */
  indiceDeDocumento(idType: string, numeroDeDocumento: string): string;
}

/** Mayúsculas y sin espacios, puntos ni guiones: `1.234.567` y `1234567` son el mismo documento. */
export function normalizarNumeroDeDocumento(numeroDeDocumento: string): string {
  return numeroDeDocumento.replace(/[\s.-]/g, '').toUpperCase();
}

export function crearIndiceCiego(clave: Buffer): IndiceCiego {
  return {
    indiceDeDocumento(idType, numeroDeDocumento) {
      const mensaje = `${PREFIJO_DE_DOCUMENTO}|${idType}|${normalizarNumeroDeDocumento(numeroDeDocumento)}`;
      return createHmac('sha256', clave).update(mensaje).digest('hex');
    },
  };
}
