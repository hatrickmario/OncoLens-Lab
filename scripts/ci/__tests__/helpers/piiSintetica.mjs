/**
 * Constructores de PII sintética en tiempo de ejecución: ningún archivo versionado lleva un número con la forma de un
 * documento tras su palabra clave (el propio escáner lo vería), solo plantillas que lo componen al ejecutarse.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { detectarPii } from '../../pii-scan.mjs';
import { compilarFormatos } from '../../../lib/formatosPii.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');

export const formatosReales = () => compilarFormatos(JSON.parse(readFileSync(path.join(RAIZ, 'config/pii-formats.json'), 'utf8')));

/** `n` dígitos sintéticos, siempre iguales. */
export const digitos = (n, digito = '7') => digito.repeat(n);

export const documentoConPalabraClave = (n = 8, palabra = 'documento') => `${palabra}: ${digitos(n)}`;
export const correo = (local, dominio) => `${local}@${dominio}`;
export const telefonoE164 = (n = 10) => `+${digitos(n, '5')}`;
export const telefonoLocal = () => `teléfono ${digitos(3, '3')} ${digitos(3, '1')} ${digitos(4, '2')}`;

/** Hash (sha256 del valor normalizado) del único hallazgo de `texto`, como lo guardaría la allowlist. */
export function hashDelHallazgo(texto) {
  const [hallazgo] = detectarPii(texto, formatosReales());
  return { formato: hallazgo.formato, sha256: hallazgo.sha256 };
}
