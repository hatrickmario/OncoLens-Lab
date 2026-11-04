/**
 * Comprobación del resultado del E2E (US-142 AC-1, AC-6). El adjunto de `g-demo.spec.ts` declara `modoLlm`
 * (`fingido|real`), `generadoEn` (ISO) y el resultado de cada `test.step` (`ok | fallo | no_verificable`); el gate lo
 * compara con el `--modo` pedido para que un E2E fingido nunca respalde un registro real.
 *
 * Un paso `no_verificable` (p. ej., el orden RN-28 con menos de 2 opciones visibles) no se da por comprobado: bloquea en
 * modo real y solo avisa en modo fingido (decidido por el orquestador, Q2). Nunca se nombra como «paso fallido».
 */
import { MODO, MODOS } from './resultado.mjs';

/** Nombre de paso que puede llegar al registro: sin saltos de línea ni caracteres de control. */
const NOMBRE_DE_PASO = /^[\p{L}\p{N} .:,()/«»→_-]{1,80}$/u;
const SIN_NOMBRE_VALIDO = 'paso sin nombre válido';
const RESULTADO_NO_VERIFICABLE = 'no_verificable';

const nombreSeguro = (paso) => (NOMBRE_DE_PASO.test(paso) ? paso : SIN_NOMBRE_VALIDO);

function motivosDeLosPasos(pasos, modo) {
  const motivos = [];
  const avisos = [];
  for (const { paso, resultado } of pasos) {
    const nombre = nombreSeguro(paso);
    if (resultado === 'ok') continue;
    if (resultado !== RESULTADO_NO_VERIFICABLE) motivos.push(`paso fallido: ${nombre}`);
    else if (modo === MODO.REAL) {
      motivos.push(
        `paso no verificable: ${nombre} (menos de 2 opciones visibles; no se da por comprobado)`,
      );
    } else avisos.push(`RN-28 no verificable con 1 opción: ${nombre}`);
  }
  return { motivos, avisos };
}

export function comprobarE2e(e2e, modo) {
  if (!e2e || typeof e2e !== 'object') {
    return { ok: false, motivos: ['recorrido E2E sin resultado'], avisos: [] };
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
  const delosPasos = motivosDeLosPasos(pasos, modo);
  motivos.push(...delosPasos.motivos);
  return { ok: motivos.length === 0, motivos, avisos: delosPasos.avisos };
}
