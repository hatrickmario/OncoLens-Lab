import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import es from '../messages/es.json' with { type: 'json' };

/** Ejemplos del contrato: el E2E lee de ahí lo que sirve el modo falso, sin literales fijos (`[S1 resp. 18]`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON de ejemplos sin tipo: el E2E lee campos concretos
export function ejemplo<T = Record<string, any>>(nombre: string): T {
  const ruta = new URL(`../../../contracts/examples/${nombre}`, import.meta.url);
  return JSON.parse(readFileSync(ruta, 'utf8')) as T;
}

export const { evidence: textos } = es;

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
