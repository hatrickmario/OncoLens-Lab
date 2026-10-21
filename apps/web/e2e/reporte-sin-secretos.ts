import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import {
  depurarAdjuntoDeTexto,
  depurarOBorrar,
  depurarTraza,
  secretosDeE2e,
} from './depurar-traza';

/** La traza es un zip; `error-context.md` (instantánea de la página al fallar) copia el valor de los `input` en texto. */
const depuradorDe = (adjunto: TestResult['attachments'][number]) =>
  adjunto.name === 'trace'
    ? depurarTraza
    : adjunto.contentType.startsWith('text/')
      ? depurarAdjuntoDeTexto
      : undefined;

/**
 * Reporter de depuración (L1D-278, ARR-02): al terminar cada intento depura en el sitio su `trace.zip` y sus adjuntos
 * de texto. Va PRIMERO en la lista de reporters de `playwright.config.ts`, para que el informe HTML (que copia los
 * adjuntos al terminar la corrida) y `test-results/` solo vean adjuntos ya depurados. No imprime nunca un secreto.
 */
export default class ReporteSinSecretos implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    const secretos = secretosDeE2e(process.env);
    for (const adjunto of result.attachments) {
      if (!adjunto.path) continue;
      const depurador = depuradorDe(adjunto);
      if (depurador && !depurarOBorrar(adjunto.path, secretos, depurador))
        console.error(
          `reporte-sin-secretos: el adjunto "${adjunto.name}" de "${test.title}" no se pudo depurar; se borró`,
        );
    }
  }
}
