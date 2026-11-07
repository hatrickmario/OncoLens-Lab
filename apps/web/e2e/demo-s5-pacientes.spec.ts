import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  IDS_SEMILLA_S5,
  alcance,
  analisisDelTurno,
  ejemplo,
  esperarResultado,
  esRespuestaDeTurno,
  iniciarSesion,
  preguntarEnElChat,
} from './soporte';

/**
 * Prueba de aceptación de la demo del S5 (L1D-310, US-254 AC-4): contra Compose con `LLM_PROVIDER=fake` y las
 * respuestas de `contracts/examples/rag-query-demo-s5-*.json`, cada paciente (g)–(m) con su pregunta sugerida devuelve
 * los conteos de `applicabilitySummary` que escribe `docs/demo/guia-demo-S5.md`. La guía es la FUENTE ÚNICA de los
 * conteos (bloque JSON entre marcadores); los ejemplos solo fijan lo que el modo fingido sirve.
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
interface PacienteDeLaGuia {
  ejemplo: keyof typeof IDS_SEMILLA_S5;
  opciones: OpcionEsperada[];
}

const guia = readFileSync(new URL('../../../docs/demo/guia-demo-S5.md', import.meta.url), 'utf8');

function pacientesDeLaGuia(): Record<string, PacienteDeLaGuia> {
  const bloque = guia
    .split('<!-- conteos-demo-s5:inicio -->')[1]
    ?.split('<!-- conteos-demo-s5:fin -->')[0]
    ?.replace(/```json|```/g, '');
  if (!bloque) throw new Error('la guía no trae el bloque de conteos de la demo del S5');
  return JSON.parse(bloque) as Record<string, PacienteDeLaGuia>;
}

const pacientes = pacientesDeLaGuia();
const preguntaDe = (nombre: string): string =>
  ejemplo(`rag-query-request-demo-s5-${nombre}.json`).query as string;
const preguntasDeLaDemo4 = ['mama-her2-adyuvante', 'mama-cdk46-excluyente'].map(
  (nombre) => ejemplo(`rag-query-request-demo-s4-${nombre}.json`).query as string,
);

test.describe('Pacientes de la demo del S5 (L1D-310)', () => {
  test.setTimeout(60_000);

  test('la guía documenta los 7 pacientes nuevos, cada uno con una pregunta exacta distinta de las demás y de las de la Demo 4 [US-254 AC-4]', () => {
    const nombres = Object.keys(IDS_SEMILLA_S5);
    const preguntas = nombres.map(preguntaDe);

    expect(Object.keys(pacientes).sort()).toEqual([...nombres].sort());
    expect(new Set(preguntas).size).toBe(nombres.length);
    for (const pregunta of preguntas) {
      expect(preguntasDeLaDemo4).not.toContain(pregunta);
      expect(guia).toContain(pregunta);
    }
  });

  test('los conteos de la guía coinciden con los ejemplos fijos que sirve el modo fingido [US-254 AC-4]', () => {
    for (const paciente of Object.values(pacientes)) {
      const fijo = ejemplo(`rag-query-demo-s5-${paciente.ejemplo}.json`);

      expect(
        fijo.evidenceOptions.map((o: { applicabilitySummary: Conteos }) => o.applicabilitySummary),
      ).toEqual(paciente.opciones.map((o) => o.conteos));
      expect(
        fijo.evidenceOptions.map(
          (o: { populationNotComparable: boolean }) => o.populationNotComparable,
        ),
      ).toEqual(paciente.opciones.map((o) => o.poblacionNoComparable));
    }
  });

  // El stack del E2E corre con ENABLED_CANCER_TYPES=mama (scripts/e2e/ejecutar.sh): los pacientes de próstata no admiten
  // análisis aquí (US-043 AC-3); sus conteos se comprueban contra los ejemplos fijos (arriba) y en la demo con ambos tipos.
  const tipoDe = (nombre: string): string =>
    ejemplo(`rag-query-request-demo-s5-${nombre}.json`).clinicalContext.diagnosis.cancerType;
  const deMama = Object.entries(pacientes).filter(([, p]) => tipoDe(p.ejemplo) === 'mama');
  const deProstata = Object.entries(pacientes).filter(([, p]) => tipoDe(p.ejemplo) === 'prostata');

  for (const [nombre, paciente] of deProstata) {
    test(`abre la ficha de ${nombre} con su diagnóstico y avisa que el tipo está fuera del alcance de este stack sin bloquear [US-254 AC-4] [US-043 AC-3]`, async ({
      page,
    }) => {
      await iniciarSesion(page);
      await page.goto(`/pacientes/${IDS_SEMILLA_S5[paciente.ejemplo]}`);

      await expect(
        page.getByRole('status').filter({ hasText: alcance.tipoNoHabilitado }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Analizar evidencia' })).toBeVisible();
    });
  }

  for (const [nombre, paciente] of deMama) {
    test(`devuelve los conteos de applicabilitySummary de la guía y la marca de no comparable para ${nombre} [US-254 AC-4]`, async ({
      page,
    }) => {
      const respuesta = page.waitForResponse(esRespuestaDeTurno);
      await iniciarSesion(page);
      await page.goto(`/pacientes/${IDS_SEMILLA_S5[paciente.ejemplo]}/analisis`);
      await preguntarEnElChat(page, preguntaDe(paciente.ejemplo));
      await esperarResultado(page);
      const analisis = await analisisDelTurno(await respuesta);

      expect(analisis.status).toBe('con_evidencia');
      expect(
        analisis.evidenceOptions.map(
          (o: { applicabilitySummary: Conteos }) => o.applicabilitySummary,
        ),
      ).toEqual(paciente.opciones.map((o) => o.conteos));
      expect(
        analisis.evidenceOptions.map(
          (o: { populationNotComparable: boolean; warnings: string[] }) => ({
            populationNotComparable: o.populationNotComparable,
            conAviso: o.warnings.includes('poblacion_no_comparable'),
          }),
        ),
      ).toEqual(
        paciente.opciones.map((o) => ({
          populationNotComparable: o.poblacionNoComparable,
          conAviso: o.poblacionNoComparable,
        })),
      );
    });
  }
});
