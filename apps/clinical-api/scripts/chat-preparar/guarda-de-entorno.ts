import { assertSeedPermitido } from '../../prisma/seed/guarda.js';

const VALORES_DE_ACTIVADO = new Set(['true', '1', 'yes']);

const estaActivada = (valor: string | undefined): boolean =>
  valor !== undefined && VALORES_DE_ACTIVADO.has(valor.trim().toLowerCase());

/**
 * RN-13: `eval:chat-preparar` siembra pacientes sintéticos en una BD de test; se niega con datos reales habilitados o
 * en el entorno `piloto`. Reutiliza la guarda del seed: una sola regla de «dónde se pueden sembrar datos sintéticos».
 */
export function exigirEntornoDeTest(entorno: NodeJS.ProcessEnv): void {
  assertSeedPermitido({
    appEnv: entorno.APP_ENV,
    entornosPermitidos: ['test'],
    realAnonymizedEnabled: estaActivada(entorno.REAL_ANONYMIZED_ENABLED),
    realIdentifiedEnabled: estaActivada(entorno.REAL_IDENTIFIED_ENABLED),
  });
}
