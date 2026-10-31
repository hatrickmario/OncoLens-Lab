import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { analizar, ejemplo, esperarResultado } from './soporte';

/**
 * Prueba de aceptación de la demo del S4 (L1D-297, US-247 AC-2 y AC-3): contra Compose con `LLM_PROVIDER=fake` y las
 * respuestas de `contracts/examples/rag-query-demo-s4-*.json`, cada par de la guía devuelve los conteos de
 * `applicabilitySummary` que escribe `docs/demo/guia-demo-S4.md`. La guía es la FUENTE ÚNICA de los conteos (bloque JSON
 * entre marcadores); los ejemplos solo fijan lo que el modo fingido sirve.
 */
interface Conteos {
  coincide: number;
  parcial: number;
  noCoincide: number;
  desconocido: number;
}
interface OpcionEsperada {
  conteos: Conteos;
  poblacionNoComparable: boolean;
}
interface ParDeLaGuia {
  ejemplo: string;
  opciones: OpcionEsperada[];
}

function paresDeLaGuia(): Record<string, ParDeLaGuia> {
  const guia = readFileSync(
    new URL('../../../docs/demo/guia-demo-S4.md', import.meta.url),
    'utf8',
  );
  const bloque = guia
    .split('<!-- conteos-demo-s4:inicio -->')[1]
    ?.split('<!-- conteos-demo-s4:fin -->')[0]
    ?.replace(/```json|```/g, '');
  if (!bloque) throw new Error('la guía no trae el bloque de conteos de la demo del S4');
  return JSON.parse(bloque) as Record<string, ParDeLaGuia>;
}

const pares = paresDeLaGuia();

test.describe('Pares de la demo del S4 (L1D-297)', () => {
  test.setTimeout(60_000);

  test('la guía documenta al menos dos pares y uno con conteos Coincide y otro con Parcial [US-247 AC-2]', () => {
    const opciones = Object.values(pares).flatMap((par) => par.opciones);

    expect(Object.keys(pares).length).toBeGreaterThanOrEqual(2);
    expect(opciones.some((o) => o.conteos.coincide > 0)).toBe(true);
    expect(opciones.some((o) => o.conteos.parcial > 0)).toBe(true);
  });

  for (const [nombre, par] of Object.entries(pares)) {
    const pregunta = ejemplo(`rag-query-request-demo-s4-${par.ejemplo}.json`).query as string;

    test(`devuelve los conteos de applicabilitySummary de la guía para el par ${nombre} [US-247 AC-2]`, async ({
      page,
    }) => {
      const respuesta = page.waitForResponse(
        (r) => r.url().endsWith('/api/evidence-analyses') && r.request().method() === 'POST',
      );
      await analizar(page, pregunta);
      await esperarResultado(page);
      const analisis = await (await respuesta).json();

      expect(
        analisis.evidenceOptions.map((o: { applicabilitySummary: Conteos }) => o.applicabilitySummary),
      ).toEqual(par.opciones.map((o) => o.conteos));
    });

    test(`marca populationNotComparable y poblacion_no_comparable exactamente en las opciones que la guía indica para el par ${nombre} [US-247 AC-3]`, async ({
      page,
    }) => {
      const respuesta = page.waitForResponse(
        (r) => r.url().endsWith('/api/evidence-analyses') && r.request().method() === 'POST',
      );
      await analizar(page, pregunta);
      await esperarResultado(page);
      const analisis = await (await respuesta).json();

      expect(
        analisis.evidenceOptions.map(
          (o: { populationNotComparable: boolean; warnings: string[] }) => ({
            populationNotComparable: o.populationNotComparable,
            conAviso: o.warnings.includes('poblacion_no_comparable'),
          }),
        ),
      ).toEqual(
        par.opciones.map((o) => ({
          populationNotComparable: o.poblacionNoComparable,
          conAviso: o.poblacionNoComparable,
        })),
      );
    });
  }
});
