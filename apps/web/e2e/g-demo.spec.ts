import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  IDS_SEMILLA_S5,
  analisisDelTurno,
  datosDelGate,
  exigirPacienteSinModificar,
  iniciarSesion,
  opcionesVisibles,
  pasoCorreccion,
  pasoRegistroManual,
  pasoSeguimiento,
  pasoVistaDeCaso,
  esRespuestaDeTurno,
  preguntarEnElChat,
  textos,
} from './soporte';
import { estadoDelOrden, violacionesDeOrdenRn28 } from './orden-rn28';
import { modoDelLlm, type ResultadoDelGate, type ResultadoDePaso } from './resultado-del-gate';
import es from '../messages/es.json' with { type: 'json' };

/**
 * Recorrido del gate G-Demo (L1D-248, US-142 AC-1): la hipótesis caso reconstruido → faltantes → opciones más aplicables
 * sobre un solo caso sintético, el de la guía de la Demo 5 (bloque `g-demo`). Las aserciones son estructurales y nunca
 * leen texto generado (design D2): el mismo spec corre con el LLM fingido en la CI y con el real en la demo.
 * El adjunto `g-demo-resultado` (y `reports/gates/e2e-g-demo.json`, ignorado por Git) es la entrada `--e2e-resultado`
 * de `scripts/verify-g-demo`: solo nombres de paso, su resultado y la versión del catálogo; sin PII ni texto generado.
 * `corpusRelease` no se adjunta: el contrato que ve el navegador no lo expone (solo `corpusCutoffDate`, que no es lo mismo);
 * `verify-g-demo` lo toma del reporte de `evaluate`, que sí lo trae (`configuracion.corpusRelease`).
 * El JSON lleva también `modoLlm` (de `LLM_PROVIDER`) y `generadoEn`; el paso del orden RN-28 es `no_verificable` con menos
 * de 2 opciones visibles (en modo fingido, el paciente (g) devuelve una): el gate no lo da por superado.
 *
 * Depende del orden: muta al paciente (corrige un biomarcador y registra el faltante), así que necesita el seed recién
 * sembrado y corre después de `demo-s5-pacientes.spec.ts` (orden alfabético, `workers: 1`). Sin reintentos: un segundo
 * intento ya no encontraría el paciente sin modificar.
 */
const RUTA_DEL_RESULTADO = new URL('../../../reports/gates/e2e-g-demo.json', import.meta.url);
/**
 * Plazos únicos (D5-57): G-Demo siempre corre con LLM real, donde el análisis tarda ~30 s y el recorrido ~55 s. Un
 * `expect` con plazo largo termina en cuanto se cumple, así que no vuelve lenta la corrida con el LLM fingido.
 */
const PLAZO_DE_GENERACION_MS = 120_000;
const PLAZO_DEL_RECORRIDO_MS = 300_000;

/** Un `test.step` que deja constancia de su resultado aunque falle: el fallo nombra el paso (US-142 AC-1). */
function crearRegistroDePasos() {
  const resultado: ResultadoDelGate = {
    pasos: [],
    modoLlm: modoDelLlm(process.env.LLM_PROVIDER),
    generadoEn: new Date().toISOString(),
  };
  async function paso(nombre: string, cuerpo: () => Promise<ResultadoDePaso | void>) {
    let estado: ResultadoDePaso = 'ok';
    try {
      await test.step(nombre, async () => {
        estado = (await cuerpo()) ?? 'ok';
      });
    } catch (error) {
      estado = 'fallo';
      throw error;
    } finally {
      resultado.pasos.push({ paso: nombre, resultado: estado });
    }
  }
  return { resultado, paso };
}

async function publicarResultado(resultado: ResultadoDelGate, testInfo: TestInfo) {
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
    await expect(
      tarjeta.getByRole('group', {
        name: new RegExp(`${textos.aplicabilidad.coincide} \\d+, ${textos.aplicabilidad.parcial}`),
      }),
    ).toBeVisible();
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
  const resumen =
    esperados === 1
      ? textos.base.faltantesUno
      : textos.base.faltantesVarios.replace('{n}', String(esperados));
  await expect(page.getByText(resumen)).toBeVisible();
  await page.getByRole('button', { name: textos.base.verDetalle }).click();
  const bloque = page
    .getByRole('heading', { level: 4, name: textos.base.datosCriticosFaltantes })
    .locator('..');
  await expect(bloque.getByText(textos.base.notaFaltantes)).toBeVisible();
  await expect(bloque.getByRole('listitem')).toHaveCount(esperados);
}

test.describe('Gate G-Demo: la hipótesis de punta a punta (L1D-248)', () => {
  test.setTimeout(PLAZO_DEL_RECORRIDO_MS);
  test.describe.configure({ retries: 0 });

  test('el doctor recorre login, ficha con corrección, vista de caso, registro del faltante, análisis, Base del análisis con los faltantes como desconocido y 2 seguimientos con citas [US-142 AC-1]', async ({
    page,
    baseURL,
  }, testInfo) => {
    // El JSON anterior se borra al inicio: si esta corrida falla antes de publicar, no queda uno viejo que parezca de hoy.
    rmSync(RUTA_DEL_RESULTADO, { force: true });
    const datos = datosDelGate();
    const idPaciente = IDS_SEMILLA_S5[datos.paciente];
    // Los pacientes (g)–(m) del seed son «Prueba Sintética 7»…«13», en el orden de `IDS_SEMILLA_S5`.
    const numeroEnElListado = Object.keys(IDS_SEMILLA_S5).indexOf(datos.paciente) + 7;
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
      await paso('inicio de sesión y paciente sin modificar', async () => {
        await iniciarSesion(page);
        await exigirPacienteSinModificar(page, idPaciente, datos);
      });

      await paso('paciente en el listado', async () => {
        await page.goto('/pacientes');
        const enmascarado = String(numeroEnElListado).padStart(2, '0');
        await page
          .getByRole('link', {
            name: new RegExp(`P\\. S\\. ${String(numeroEnElListado)[0]}\\. •••• ${enmascarado}\\b`),
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
          await expect(page.getByLabel(es.conversacion.campo)).toBeVisible();
          const respuesta = page.waitForResponse(esRespuestaDeTurno);
          await preguntarEnElChat(page, datos.pregunta);
          await expect(page.getByTestId('analysis-result')).toBeVisible({
            timeout: PLAZO_DE_GENERACION_MS,
          });
          const analisis = await analisisDelTurno(await respuesta);
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
        return estadoDelOrden(opciones) === 'no_verificable' ? 'no_verificable' : undefined;
      });

      await paso('Base del análisis con los faltantes como desconocido', () =>
        comprobarBaseConFaltantes(page, faltantesRestantes),
      );

      for (const [i, pregunta] of datos.seguimientos.entries())
        await paso(`pregunta de seguimiento ${i + 1} con citas`, () =>
          pasoSeguimiento(page, pregunta, i + 1, PLAZO_DE_GENERACION_MS),
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
      await publicarResultado(resultado, testInfo);
    }
  });
});
