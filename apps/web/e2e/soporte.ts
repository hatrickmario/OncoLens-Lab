import { readFileSync } from 'node:fs';
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
