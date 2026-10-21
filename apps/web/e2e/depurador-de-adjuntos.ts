import { rmSync } from 'node:fs';
import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter';
import {
  depurarAdjuntoDeTexto,
  depurarOBorrar,
  depurarTraza,
  formasDe,
  redactarTexto,
  secretosDeE2e,
} from './depurar-traza';

type Adjunto = TestResult['attachments'][number];

const esDeTexto = (adjunto: Adjunto) =>
  adjunto.contentType.startsWith('text/') || adjunto.contentType === 'application/json';

/** La traza es un zip; `error-context.md` copia el valor de los `input` en texto; de cualquier otro tipo no se sabe qué hay. */
const depuradorDe = (adjunto: Adjunto) =>
  adjunto.name === 'trace' ? depurarTraza : esDeTexto(adjunto) ? depurarAdjuntoDeTexto : undefined;

/**
 * Depurador de adjuntos y títulos de paso (L1D-278, RN-14). MUTA y BORRA lo que Playwright ha producido, antes de que el
 * informe HTML lo copie (por eso va PRIMERO en la lista de reporters):
 *   - `onStepEnd`: sustituye el secreto en el título del paso (`Fill "<contraseña>"`), que el informe incrusta.
 *   - `onTestEnd`: depura en el sitio cada `trace.zip` y cada adjunto de texto (en disco o en memoria); borra los de
 *     tipo desconocido o que no se puedan depurar (falla cerrado). No imprime nunca un secreto.
 */
export default class DepuradorDeAdjuntos implements Reporter {
  onStepEnd(_test: TestCase, _result: TestResult, step: TestStep): void {
    const formas = formasDe(secretosDeE2e(process.env));
    (step as { title: string }).title = redactarTexto(step.title, formas);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const secretos = secretosDeE2e(process.env);
    for (const adjunto of result.attachments) {
      const depurado = adjunto.path
        ? depurarArchivo(adjunto, secretos)
        : depurarContenido(adjunto, secretos);
      if (!depurado)
        console.error(
          `depurador-de-adjuntos: el adjunto "${adjunto.name}" de "${test.title}" no se pudo depurar; se descartó`,
        );
    }
  }
}

function depurarArchivo(adjunto: Adjunto, secretos: string[]): boolean {
  const ruta = adjunto.path as string;
  const depurador = depuradorDe(adjunto);
  if (depurador) return depurarOBorrar(ruta, secretos, depurador);
  rmSync(ruta, { force: true });
  return false;
}

function depurarContenido(adjunto: Adjunto, secretos: string[]): boolean {
  if (!adjunto.body) return true;
  if (!esDeTexto(adjunto)) {
    delete adjunto.body;
    return false;
  }
  adjunto.body = Buffer.from(
    redactarTexto(adjunto.body.toString('utf8'), formasDe(secretos)),
    'utf8',
  );
  return true;
}
