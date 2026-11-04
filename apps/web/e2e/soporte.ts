import { readdirSync, readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };

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

/** Paciente semilla (d): mama sin exámenes, tratamientos ni atributos (casi todo el checklist en «Faltante»); `idSembrado('paciente-d')`. */
export const ID_SEMILLA_D = 'c257f30f-8341-5f51-a219-8e4bca373918';

/** Paciente semilla (f) = FX-T3-a (L1D-196): mama con avisos clínicos acumulados; `idSembrado('paciente-f')`. */
export const ID_SEMILLA_F = '380dd24c-0458-55f7-bd22-23b87d965c86';

/**
 * Pacientes semilla (g)–(m) de US-254 por su momento de la enfermedad: `idSembrado('paciente-<letra>')`, el mismo UUID
 * determinista del seed. `web` no importa código de `clinical-api`: el test unitario `seed-pacientes-semilla` compara estos
 * ids con `idSembrado` y detecta una deriva.
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

/**
 * Cuántos pacientes siembra el seed: un archivo `<letra>.ts` por paciente en `prisma/seed/pacientes/`. Se lee del
 * sistema de archivos, como `ejemplo()`: `web` no importa código de `clinical-api` (`web-solo-por-bff`).
 */
export const TOTAL_PACIENTES_SEMILLA = readdirSync(
  new URL('../../clinical-api/prisma/seed/pacientes/', import.meta.url),
).filter((archivo) => /^[a-z]\.ts$/.test(archivo)).length;

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

/** Abre el panel del paciente semilla (a), escribe la pregunta y presiona "Analizar evidencia". */
export async function analizar(page: Page, pregunta: string) {
  await iniciarSesion(page);
  await page.getByLabel('Pregunta clínica').fill(pregunta);
  await page.getByRole('button', { name: 'Analizar evidencia' }).click();
}

export async function esperarResultado(page: Page) {
  await expect(page.getByTestId('analysis-result')).toBeVisible();
}
