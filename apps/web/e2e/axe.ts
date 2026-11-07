import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const fuenteDeAxe = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

interface ResultadoDeAxe {
  violations: { id: string; impact: string | null }[];
}

/**
 * Ids de las violaciones `serious` o `critical` de WCAG 2.1 A/AA en la página. Inyecta `axe-core` con `page.evaluate`
 * (CDP) y no con `addScriptTag`: la CSP de US-216 no admite scripts en línea y no se relaja para el E2E.
 */
export async function violacionesGraves(page: Page): Promise<string[]> {
  await page.evaluate(fuenteDeAxe);
  const resultado = await page.evaluate(async (): Promise<ResultadoDeAxe> => {
    const axe = (
      window as unknown as { axe: { run: (c: Document, o: object) => Promise<ResultadoDeAxe> } }
    ).axe;
    return axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
  });
  return resultado.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id);
}
