import { rmSync } from 'node:fs';
import path from 'node:path';
import type { FullConfig, Reporter } from '@playwright/test/reporter';
import { buscarSecretos } from './buscar-secretos';
import { secretosDeE2e } from './depurar-traza';

const CARPETAS_POR_DEFECTO = ['playwright-report', 'test-results'];

/**
 * Verificador de informe (L1D-278, RN-14): va el ÚLTIMO de la lista de reporters, después de `html`. El informe HTML se
 * escribe en `onExit` (tras todos los `onEnd`), así que aquí se vuelve a escanear lo que saldría como artefacto público
 * —zips anidados y el zip que el informe incrusta en base64, incluidos— y, si queda algún secreto de E2E, se borra la
 * carpeta y la corrida termina con error (falla cerrado). Nunca imprime el valor del secreto, solo las rutas.
 */
export default class VerificadorDeInforme implements Reporter {
  private readonly carpetas: string[];
  private base = process.cwd();

  constructor(opciones: { carpetas?: string[] } = {}) {
    this.carpetas = opciones.carpetas ?? CARPETAS_POR_DEFECTO;
  }

  onBegin(config: FullConfig): void {
    this.base = path.dirname(config.configFile ?? path.join(process.cwd(), 'playwright.config.ts'));
  }

  onExit(): Promise<void> {
    const secretos = secretosDeE2e(process.env);
    const carpetas = this.carpetas.map((carpeta) => path.resolve(this.base, carpeta));
    const coincidencias = carpetas.flatMap((carpeta) => buscarEnCarpeta(carpeta, secretos));
    if (coincidencias.length > 0) {
      carpetas.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true }));
      console.error(
        `verificador-de-informe: quedaba un secreto de E2E en ${coincidencias.length} archivo(s) del informe; se borraron ${this.carpetas.join(' y ')}: ${coincidencias.join(', ')}`,
      );
      process.exit(1);
    }
    return Promise.resolve();
  }
}

function buscarEnCarpeta(carpeta: string, secretos: string[]): string[] {
  try {
    return buscarSecretos(carpeta, secretos).map((ruta) => `${path.basename(carpeta)}/${ruta}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}
