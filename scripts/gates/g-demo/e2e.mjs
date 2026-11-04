/**
 * Comprobación del resultado del E2E (US-142 AC-1, AC-6). El adjunto de `g-demo.spec.ts` declara `modoLlm`
 * (`fingido|real`), `generadoEn` (ISO) y el resultado de cada `test.step`; el gate lo compara con el `--modo` pedido para
 * que un E2E fingido nunca respalde un registro real.
 */
import { MODOS } from './resultado.mjs';

/** Nombre de paso que puede llegar al registro: sin saltos de línea ni caracteres de control. */
const NOMBRE_DE_PASO = /^[\p{L}\p{N} .:,()/«»→_-]{1,80}$/u;

function motivoDelPasoFallido(pasos) {
  const fallido = pasos.find((p) => p?.resultado !== 'ok');
  if (!fallido) return null;
  const nombre = NOMBRE_DE_PASO.test(fallido.paso) ? fallido.paso : 'paso sin nombre válido';
  return `paso fallido: ${nombre}`;
}

export function comprobarE2e(e2e, modo) {
  if (!e2e || typeof e2e !== 'object') {
    return { ok: false, motivos: ['recorrido E2E sin resultado'] };
  }
  const motivos = [];
  if (!MODOS.includes(e2e.modoLlm)) motivos.push('el E2E no declara su modo');
  else if (e2e.modoLlm !== modo) {
    motivos.push(`el modo del E2E (${e2e.modoLlm}) no es el modo pedido (${modo})`);
  }
  if (typeof e2e.generadoEn !== 'string' || Number.isNaN(Date.parse(e2e.generadoEn))) {
    motivos.push('el E2E no declara cuándo se generó');
  }
  const pasos = Array.isArray(e2e.pasos) ? e2e.pasos : [];
  if (pasos.length === 0) motivos.push('el recorrido E2E no trae pasos');
  const pasoFallido = motivoDelPasoFallido(pasos);
  if (pasoFallido) motivos.push(pasoFallido);
  return { ok: motivos.length === 0, motivos };
}
