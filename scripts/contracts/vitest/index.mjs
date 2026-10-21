/** Configuración de Vitest para los tests que validan respuestas contra `openapi.yaml`: rutas absolutas y clave compartida. */
import path from 'node:path';

/** Clave con la que `globalSetup.mjs` reparte el empaquetado y `setupFile.mjs` lo recibe. */
export const CLAVE_SPECS_EMPAQUETADOS = 'specsEmpaquetados';

/** `globalSetup` y `setupFiles` de la config de Vitest de cualquier workspace (rutas absolutas: la `--root` puede variar). */
export const vitestEmpaquetado = {
  globalSetup: [path.join(import.meta.dirname, 'globalSetup.mjs')],
  setupFiles: [path.join(import.meta.dirname, 'setupFile.mjs')],
};
