import { readdirSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type {
  ConversationTurn,
  EvidenceAnalysis,
} from '../../../packages/api-contracts/src/types/clinical-api';
import es from '../messages/es.json' with { type: 'json' };
import { opcionDelRotulo, type OpcionVisible } from './orden-rn28';

/** Ejemplos del contrato: el E2E lee de ahí lo que sirve el modo falso, sin literales fijos (`[S1 resp. 18]`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de ejemplos sin tipo: el E2E lee campos concretos
export function ejemplo<T = Record<string, any>>(nombre: string): T {
  const ruta = new URL(`../../../contracts/examples/${nombre}`, import.meta.url);
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

/** Títulos de nivel 3 que no son la Base del análisis (p. ej. las tarjetas de opción). */
export const SIN_BASE = /^(?!Base del análisis$)/;

export const { evidence: textos, pacientes, ficha, alcance } = es;

/** Paciente semilla (a), de mama (L1D-169): el mismo UUID determinista que `WEB_HOME_PATH` en `scripts/e2e/ejecutar.sh`. */
export const ID_SEMILLA_A = '0fd028e2-f8b0-56c7-a748-2a4e473d879d';

/**
 * Paciente semilla (d): mama sin exámenes, tratamientos ni atributos (casi todo el checklist en «Faltante»); `idSembrado('paciente-d')`.
 * Lo MUTAN dos specs, en este orden (un worker, orden alfabético; `ejecutar.sh` re-siembra con `down -v` al empezar la corrida):
 * `datos-criticos-vista-caso.spec.ts` (registra Ki-67) y luego `declaracion-sin-tratamiento.spec.ts` (declara «Sin tratamiento
 * previo» y después registra un tratamiento; sus dos tests van en serie). Un spec nuevo que lo use debe asumir ese estado.
 */
export const ID_SEMILLA_D = 'c257f30f-8341-5f51-a219-8e4bca373918';

/** Paciente semilla (f) = FX-T3-a (L1D-196): mama con avisos clínicos acumulados; `idSembrado('paciente-f')`. */
export const ID_SEMILLA_F = '380dd24c-0458-55f7-bd22-23b87d965c86';

/**
 * Pacientes semilla (g)–(m) de US-254 por su momento de la enfermedad: `idSembrado('paciente-<letra>')`, el mismo UUID
 * determinista del seed. `web` no importa código de `clinical-api`: el test unitario `seed-pacientes-semilla` compara estos
 * ids con `idSembrado` y detecta una deriva.
 *
 * Mutan estos pacientes, en este orden de corrida (un worker, orden alfabético; `ejecutar.sh` re-siembra con `down -v`):
 * (g) `g-demo.spec.ts` (corrige un biomarcador y registra el faltante; pide el seed sin tocar) y (h)
 * `vista-de-caso-correccion.spec.ts` (corrige el esquema del tratamiento y el valor del atributo; dos tests en serie, va
 * después de `demo-s5-pacientes.spec.ts`, que solo lee). Un spec nuevo que use (g) o (h) debe asumir ese estado.
 */
export const IDS_SEMILLA_S5 = {
  'g-inicial': 'eae9ce34-3ec2-5e5d-ae96-be3f767f7467',
  'h-adyuvante': '70189996-cf62-5a0a-af54-c1dd82ab8daf',
  'i-recaida': '0a209e51-6730-59a5-aaf0-d32c9f64dc5d',
  'j-metastasica-1l': '4d601eb2-b0b1-5926-811e-5641a892281c',
  'k-her2-tras-tdm1': '7d4a70db-1ff3-5b20-ada2-5389f0fa4ae8',
  'l-hspc': '5fc9c4ac-4c78-581e-ad25-10c185627932',
  'm-crpc': 'd8fc5ac0-4cbe-522c-9220-db949d7c2085',
} as const;

/** Paciente semilla (h): mama adyuvante con letrozol en curso y estado menopáusico; lo muta `vista-de-caso-correccion.spec.ts`. */
export const ID_SEMILLA_H = IDS_SEMILLA_S5['h-adyuvante'];

/**
 * Cuántos pacientes siembra el seed: un archivo `<letra>.ts` por paciente en `prisma/seed/pacientes/`. Se lee del
 * sistema de archivos, como `ejemplo()`: `web` no importa código de `clinical-api` (`web-solo-por-bff`).
 */
export const TOTAL_PACIENTES_SEMILLA = readdirSync(
  new URL('../../clinical-api/prisma/seed/pacientes/', import.meta.url),
).filter((archivo) => /^[a-z]\.ts$/.test(archivo)).length;

/**
 * Filas del listado: los pacientes (a)–(m) más `P-CHAT` (L1D-315), que el seed crea aparte (`chat.ts`) y cuya identidad
 * sintética no sigue el patrón `Prueba Sintética n` / `SINT-n`.
 */
export const TOTAL_PACIENTES_DEL_LISTADO = TOTAL_PACIENTES_SEMILLA + 1;

/** Usuario sintético sembrado (L1D-197); la contraseña de la fixture llega por entorno, nunca versionada. */
export const CORREO_DOC1 = process.env.E2E_DOC_CORREO ?? 'doc1@test.local';

export async function iniciarSesion(page: Page) {
  const contrasena = process.env.E2E_DOC_CONTRASENA;
  if (!contrasena)
    throw new Error('E2E_DOC_CONTRASENA es obligatoria (fixture sintética de L1D-197)');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(CORREO_DOC1);
  await page.getByLabel('Contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL(/\/pacientes\/[^/]+\/analisis$/);
}

/** Escribe la pregunta en el chat del paciente y pulsa «Preguntar» (US-267: sustituye al formulario de una pregunta). */
export async function preguntarEnElChat(page: Page, pregunta: string) {
  await page.getByLabel(es.conversacion.campo).fill(pregunta);
  await page.getByRole('button', { name: es.conversacion.preguntar }).click();
}

/** Tarjetas de los turnos del asistente: grupos «Turno n» (las tarjetas de opción del análisis son `article`). */
export const tarjetasDelChat = (page: Page) => page.getByRole('group', { name: /^Turno \d+$/ });

/** Abre el chat del paciente semilla (a) y le hace la pregunta. */
export async function analizar(page: Page, pregunta: string) {
  await iniciarSesion(page);
  await preguntarEnElChat(page, pregunta);
}

/** Respuesta del `POST /api/conversations/{id}/turns`. */
export const esRespuestaDeTurno = (r: { url(): string; request(): { method(): string } }) =>
  r.request().method() === 'POST' && /\/api\/conversations\/[^/]+\/turns$/.test(r.url());

/** El `evidenceAnalysis` del turno de evidencia (el mismo `EvidenceAnalysis` que antes devolvía `/api/evidence-analyses`). */
export async function analisisDelTurno(respuesta: { json(): Promise<unknown> }) {
  return ((await respuesta.json()) as ConversationTurn).evidenceAnalysis as EvidenceAnalysis;
}

/** Espera `n` tarjetas de turno (por defecto, una). */
export async function esperarTarjeta(page: Page, n = 1) {
  await expect(tarjetasDelChat(page)).toHaveCount(n);
}

export async function esperarResultado(page: Page) {
  await expect(page.getByTestId('analysis-result')).toBeVisible();
}

/** Lo que el recorrido del gate G-Demo (US-142) lee del bloque `g-demo` de `docs/demo/guia-demo-S5.md`: una sola fuente con la demo. */
export interface DatosDelGate {
  paciente: keyof typeof IDS_SEMILLA_S5;
  correccion: { biomarcador: string; valorAnterior: string; valorNuevo: string };
  faltante: {
    nombre: string;
    valor: string;
    unidad: string;
    tipoDeResultado: 'cuantitativo' | 'cualitativo';
    fecha: string;
  };
  pregunta: string;
  seguimientos: string[];
}

export function datosDelGate(): DatosDelGate {
  const guia = readFileSync(new URL('../../../docs/demo/guia-demo-S5.md', import.meta.url), 'utf8');
  const bloque = guia
    .split('<!-- g-demo:inicio -->')[1]
    ?.split('<!-- g-demo:fin -->')[0]
    ?.replace(/```json|```/g, '');
  if (!bloque) throw new Error('la guía no trae el bloque g-demo del recorrido del gate');
  return JSON.parse(bloque) as DatosDelGate;
}

const { caso, datosCriticos, registroManual, evidence } = es;
const { correccion } = ficha;
const columnaDeDatosCriticos = (page: Page) =>
  page.getByRole('region', { name: datosCriticos.titulo });
const filaDeDatoCritico = (page: Page, etiqueta: string) =>
  columnaDeDatosCriticos(page).getByRole('listitem').filter({ hasText: etiqueta });

/** Ficha → «Corregir dato» → «Guardar mi corrección»: el valor nuevo con «Corrección manual» y el anterior en el histórico. */
export async function pasoCorreccion(page: Page, idPaciente: string, datos: DatosDelGate) {
  const { biomarcador, valorAnterior, valorNuevo } = datos.correccion;
  await page.goto(`/pacientes/${idPaciente}`);
  const tabla = page.getByRole('region', { name: ficha.biomarcadores.titulo });
  await tabla.getByRole('button', { name: `${correccion.accion} · ${biomarcador}` }).click();
  await tabla.getByLabel(correccion.formulario.valor).fill(valorNuevo);
  await tabla.getByRole('button', { name: correccion.formulario.guardar }).click();

  const fila = tabla.getByRole('row', { name: new RegExp(biomarcador) }).first();
  await expect(fila).toContainText(valorNuevo);
  await expect(fila).toContainText(ficha.origen.manual_correction);
  await tabla.getByRole('button', { name: /Histórico/ }).click();
  const historico = tabla.getByRole('list', { name: correccion.historico.etiqueta });
  await expect(historico).toContainText(valorAnterior);
  await expect(historico).toContainText(correccion.historico.reemplazado);
}

/** Ficha → «Ver caso clínico»: línea de tiempo con ≥ 1 evento y el faltante en «Datos críticos» (que no bloquea). */
export async function pasoVistaDeCaso(page: Page, idPaciente: string, datos: DatosDelGate) {
  await page.getByRole('link', { name: caso.verCaso }).click();
  await expect(page).toHaveURL(new RegExp(`/pacientes/${idPaciente}/caso$`));
  const linea = page.getByRole('region', { name: caso.secciones.lineaDeTiempo });
  await expect(linea.getByRole('listitem').first()).toBeVisible();
  await expect(filaDeDatoCritico(page, datos.faltante.nombre)).toContainText(
    datosCriticos.estado.faltante,
  );
  await expect(columnaDeDatosCriticos(page).getByText(datosCriticos.nota)).toBeVisible();
}

/** «Registrar a mano» desde la fila del faltante: la fila deja de ser «Faltante» y sigue así tras recargar. */
export async function pasoRegistroManual(page: Page, datos: DatosDelGate) {
  const { nombre, valor, unidad, tipoDeResultado, fecha } = datos.faltante;
  const { biomarcador } = registroManual;
  await columnaDeDatosCriticos(page)
    .getByRole('link', { name: `${datosCriticos.acciones.registrarAMano} ${nombre}` })
    .click();
  const dialogo = page.getByRole('dialog', { name: biomarcador.titulo });
  await dialogo.getByLabel(biomarcador.valor).fill(valor);
  await dialogo.getByLabel(biomarcador.unidad).fill(unidad);
  await dialogo.getByLabel(biomarcador.tipoDeResultado).selectOption(tipoDeResultado);
  await dialogo.getByLabel(biomarcador.fecha).fill(fecha);
  await dialogo.getByRole('button', { name: caso.registro.guardar }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  for (const recargar of [false, true]) {
    // Recargar con `?item=` reabriría el diálogo del faltante: se vuelve a cargar la vista de caso sin él.
    if (recargar) await page.goto(new URL('caso', `${page.url().split('/caso')[0]}/`).toString());
    const fila = filaDeDatoCritico(page, nombre);
    await expect(fila).toContainText(datosCriticos.estado.presente_verificado);
    await expect(fila).not.toContainText(datosCriticos.estado.faltante);
  }
  return columnaDeDatosCriticos(page)
    .getByRole('listitem')
    .filter({ hasText: datosCriticos.estado.faltante })
    .count();
}

/** Una pregunta de seguimiento en el chat: el turno `n + 1` (el 1 es el análisis) trae ≥ 1 cita `[E<n> · frag. <m>]`, los avisos del turno y la etiqueta académica en la página. */
export async function pasoSeguimiento(
  page: Page,
  pregunta: string,
  n: number,
  /** Espera de la generación (D5-57): sin valor, el `expect` conserva su plazo por defecto. */
  plazoDeGeneracion?: number,
) {
  await preguntarEnElChat(page, pregunta);

  const turno = tarjetasDelChat(page).nth(n);
  await expect(turno).toBeVisible({ timeout: plazoDeGeneracion });
  const etiquetaDeCita = { name: /^\[E\d+ · frag\. \d+\]/ };
  await expect(turno.getByRole('button', etiquetaDeCita).first()).toBeVisible({
    timeout: plazoDeGeneracion,
  });
  // Cada cita es un elemento de lista con su fuente y fragmento; el gate no pasa con un turno sin avisos de IA (RN-19).
  await expect(
    turno
      .getByRole('listitem')
      .filter({ has: page.getByRole('button', etiquetaDeCita) })
      .first(),
  ).toBeVisible();
  const avisos = turno.getByRole('region', { name: es.conversacion.avisosTitulo });
  await expect(avisos.getByRole('listitem')).not.toHaveCount(0);
  await expect(page.getByRole('banner').getByText(es.app.academicUseLabel)).toBeVisible();
}

/** Los conteos que muestra cada tarjeta («Coincide 2, Parcial 0, No coincide 0, Desconocido 3») y su etiqueta de no comparable. */
export async function opcionesVisibles(page: Page): Promise<OpcionVisible[]> {
  const tarjetas = page
    .getByRole('list', { name: evidence.resultado.encabezado })
    .getByRole('article');
  const { aplicabilidad } = evidence;
  const opciones: OpcionVisible[] = [];
  for (const tarjeta of await tarjetas.all()) {
    const grupo = tarjeta.getByRole('group', {
      name: new RegExp(`${aplicabilidad.coincide} \\d+,`),
    });
    const rotulo = (await grupo.getAttribute('aria-label')) ?? '';
    const noComparable = (await tarjeta.getByText(aplicabilidad.etiquetaNoComparable).count()) > 0;
    opciones.push(opcionDelRotulo(rotulo, noComparable));
  }
  return opciones;
}

/**
 * El recorrido del gate muta al paciente (corrige un biomarcador y registra el faltante): solo corre sobre un seed
 * recién sembrado. Si el faltante ya está presente, falla con la causa y no con un paso posterior confuso.
 */
export async function exigirPacienteSinModificar(
  page: Page,
  idPaciente: string,
  datos: DatosDelGate,
) {
  await page.goto(`/pacientes/${idPaciente}/caso`);
  await expect(
    filaDeDatoCritico(page, datos.faltante.nombre),
    `${datos.faltante.nombre} ya no está faltante: el recorrido necesita el seed intacto; reiniciar el seed (scripts/e2e/ejecutar.sh hace down -v)`,
  ).toContainText(datosCriticos.estado.faltante);
}
