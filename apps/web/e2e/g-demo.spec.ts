import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  IDS_SEMILLA_S5,
  datosDelGate,
  iniciarSesion,
  opcionesVisibles,
  pasoCorreccion,
  pasoRegistroManual,
  pasoSeguimiento,
  pasoVistaDeCaso,
  textos,
  violacionesDeOrdenRn28,
} from './soporte';
import es from '../messages/es.json' with { type: 'json' };

/**
 * Recorrido del gate G-Demo (L1D-248, US-142 AC-1): la hipótesis caso reconstruido → faltantes → opciones más aplicables
 * sobre un solo caso sintético, el de la guía de la Demo 5 (bloque `g-demo`). Las aserciones son estructurales y nunca
 * leen texto generado (design D2): el mismo spec corre con el LLM fingido en la CI y con el real en la demo.
 * El adjunto `g-demo-resultado` (y `reports/gates/e2e-g-demo.json`, ignorado por Git) es la entrada `--e2e-resultado`
 * de `scripts/verify-g-demo`: solo nombres de paso, su resultado y la versión del catálogo; sin PII ni texto generado.
 * `corpusRelease` no se adjunta: el contrato que ve el navegador no lo expone (solo `corpusCutoffDate`, que no es lo mismo);
 * `verify-g-demo` lo toma del reporte de `evaluate`, que sí lo trae (`configuracion.corpusRelease`).
 */
const datos = datosDelGate();
const idPaciente = IDS_SEMILLA_S5[datos.paciente];
const NUMERO_EN_EL_LISTADO = datos.paciente.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
const RUTA_DEL_RESULTADO = new URL('../../../reports/gates/e2e-g-demo.json', import.meta.url);

interface PasoDelGate {
  paso: string;
  resultado: 'ok' | 'fallo';
}
interface ResultadoDelGate {
  pasos: PasoDelGate[];
  catalogVersion?: string;
}

/** Un `test.step` que deja constancia de su resultado aunque falle: el fallo nombra el paso (US-142 AC-1). */
function crearRegistroDePasos() {
  const resultado: ResultadoDelGate = { pasos: [] };
  async function paso(nombre: string, cuerpo: () => Promise<void>) {
    try {
      await test.step(nombre, cuerpo);
      resultado.pasos.push({ paso: nombre, resultado: 'ok' });
    } catch (error) {
      resultado.pasos.push({ paso: nombre, resultado: 'fallo' });
      throw error;
    }
  }
  return { resultado, paso };
}

async function adjuntarResultado(resultado: ResultadoDelGate, testInfo: TestInfo) {
  const cuerpo = JSON.stringify(resultado, null, 2);
  await testInfo.attach('g-demo-resultado', { body: cuerpo, contentType: 'application/json' });
  mkdirSync(new URL('./', RUTA_DEL_RESULTADO), { recursive: true });
  writeFileSync(RUTA_DEL_RESULTADO, `${cuerpo}\n`);
}

/** Cada opción con ≥ 1 cita, su resumen de aplicabilidad y su posición; el criterio de orden y el aviso de IA visibles. */
async function comprobarOpcionesDescritas(page: Page, maxOpciones: number, aviso: string) {
  await expect(
    page.getByRole('heading', { level: 2, name: textos.resultado.encabezado }),
  ).toBeVisible();
  const tarjetas = page
    .getByRole('list', { name: textos.resultado.encabezado })
    .getByRole('article');
  const total = await tarjetas.count();
  expect(total).toBeGreaterThanOrEqual(1);
  expect(total).toBeLessThanOrEqual(maxOpciones);
  for (const tarjeta of await tarjetas.all()) {
    await expect(
      tarjeta.getByRole('list', { name: textos.cita.lista }).getByRole('listitem').first(),
    ).toBeVisible();
    await expect(tarjeta.getByRole('group', { name: /Coincide \d+, Parcial/ })).toBeVisible();
  }
  const criterio = es.evidence.orderCriterion;
  await expect(
    page.getByText(criterio.applicability).or(page.getByText(criterio.relevance)),
  ).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: aviso }).first()).toBeVisible();
  await expect(page.getByText(es.app.academicUseLabel).first()).toBeVisible();
}

/** Los faltantes de la Base son los que la columna «Datos críticos» seguía mostrando como «Faltante» (no bloquean, RN-26). */
async function comprobarBaseConFaltantes(page: Page, esperados: number) {
  expect(esperados).toBeGreaterThan(0);

  await expect(page.getByRole('heading', { level: 3, name: textos.base.titulo })).toBeVisible();
  await expect(
    page.getByText(new RegExp(`${esperados} datos? críticos? faltantes?`)),
  ).toBeVisible();
  await page.getByRole('button', { name: textos.base.verDetalle }).click();
  const bloque = page
    .getByRole('heading', { level: 4, name: textos.base.datosCriticosFaltantes })
    .locator('..');
  await expect(bloque.getByText(textos.base.notaFaltantes)).toBeVisible();
  await expect(bloque.getByRole('listitem')).toHaveCount(esperados);
}

test.describe('Gate G-Demo: la hipótesis de punta a punta (L1D-248)', () => {
  test.setTimeout(180_000);

  test('el doctor recorre login, ficha con corrección, vista de caso, registro del faltante, análisis, Base del análisis con los faltantes como desconocido y 2 seguimientos con citas [US-142 AC-1]', async ({
    page,
    baseURL,
  }, testInfo) => {
    const { resultado, paso } = crearRegistroDePasos();
    const origen = new URL(baseURL ?? 'http://127.0.0.1:3000').origin;
    const peticiones: string[] = [];
    const erroresDeConsola: string[] = [];
    page.on('request', (peticion) => peticiones.push(peticion.url()));
    page.on('console', (mensaje) => {
      if (mensaje.type() === 'error') erroresDeConsola.push(mensaje.text());
    });
    page.on('pageerror', (error) => erroresDeConsola.push(error.message));

    try {
      await paso('inicio de sesión y paciente en el listado', async () => {
        await iniciarSesion(page);
        await page.goto('/pacientes');
        const enmascarado = String(NUMERO_EN_EL_LISTADO).padStart(2, '0');
        await page
          .getByRole('link', {
            name: new RegExp(
              `P\\. S\\. ${String(NUMERO_EN_EL_LISTADO)[0]}\\. •••• ${enmascarado}\\b`,
            ),
          })
          .click();
        await expect(page).toHaveURL(new RegExp(`/pacientes/${idPaciente}$`));
        await expect(page.getByText('SINTÉTICO').first()).toBeVisible();
      });

      await paso('ficha con la corrección del biomarcador y su histórico', () =>
        pasoCorreccion(page, idPaciente, datos),
      );

      await paso('vista de caso con línea de tiempo y datos críticos', async () => {
        await pasoVistaDeCaso(page, idPaciente, datos);
        const version = await page
          .getByRole('region', { name: es.datosCriticos.titulo })
          .getByText(/^catálogo /)
          .first()
          .innerText();
        const [, catalogVersion] = /^catálogo (\S+)/.exec(version) ?? [];
        expect(catalogVersion).toBeTruthy();
        resultado.catalogVersion = catalogVersion;
      });

      let faltantesRestantes = 0;
      await paso('registro a mano del faltante', async () => {
        faltantesRestantes = await pasoRegistroManual(page, datos);
      });

      let maxOpciones = 0;
      let aviso = '';
      await paso(
        'análisis con opciones citadas bajo «Opciones descritas en la evidencia»',
        async () => {
          await page.getByRole('link', { name: es.caso.analizar }).click();
          await expect(page).toHaveURL(new RegExp(`/pacientes/${idPaciente}/analisis$`));
          await expect(
            page.getByRole('status').filter({ hasText: /datos críticos/ }),
          ).toBeVisible();
          const respuesta = page.waitForResponse(
            (r) => r.url().endsWith('/api/evidence-analyses') && r.request().method() === 'POST',
          );
          await page.getByLabel(textos.formulario.pregunta).fill(datos.pregunta);
          await page.getByRole('button', { name: textos.formulario.analizar }).click();
          await expect(page.getByTestId('analysis-result')).toBeVisible();
          const analisis = await (await respuesta).json();
          expect(analisis.status).toBe('con_evidencia');
          maxOpciones = analisis.analysisBasis.maxOptions;
          aviso = analisis.disclaimer;
          await comprobarOpcionesDescritas(page, maxOpciones, aviso);
        },
      );

      await paso('orden por aplicabilidad (RN-28) desde los conteos visibles', async () => {
        const opciones = await opcionesVisibles(page);
        expect(opciones.length).toBeGreaterThanOrEqual(1);
        expect(violacionesDeOrdenRn28(opciones)).toEqual([]);
      });

      await paso('Base del análisis con los faltantes como desconocido', () =>
        comprobarBaseConFaltantes(page, faltantesRestantes),
      );

      for (const [i, pregunta] of datos.seguimientos.entries())
        await paso(`pregunta de seguimiento ${i + 1} con citas`, () =>
          pasoSeguimiento(page, pregunta, i + 1),
        );

      await paso('consola sin errores y peticiones solo al origen de web', async () => {
        expect(erroresDeConsola).toEqual([]);
        expect(peticiones.length).toBeGreaterThan(0);
        expect(peticiones.filter((u) => new URL(u).origin !== origen)).toEqual([]);
        expect(
          peticiones.filter((u) => /Sint%C3%A9tica|Sintética|SINT-/.test(decodeURIComponent(u))),
        ).toEqual([]);
      });
    } finally {
      await adjuntarResultado(resultado, testInfo);
    }
  });
});
