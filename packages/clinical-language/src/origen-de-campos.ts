import { readFileSync } from 'node:fs';
import { z } from 'zod';

/** `origen-de-campos.json` vive en la raíz del paquete: a la misma distancia de `src/` y de `dist/`. */
const RUTA_ORIGEN_DE_CAMPOS = new URL('../origen-de-campos.json', import.meta.url);

const esquemaOrigen = z.object({
  camposCopiadosDelCorpus: z.array(z.string().min(1)).min(1),
  camposGenerados: z.array(z.string().min(1)).min(1),
});

const origen = esquemaOrigen.parse(JSON.parse(readFileSync(RUTA_ORIGEN_DE_CAMPOS, 'utf8')));

/** Campos del contrato copiados literalmente del corpus (RN-04, RN-25): el recorrido de UI los excluye. */
export const CAMPOS_COPIADOS_DEL_CORPUS: readonly string[] = Object.freeze([
  ...origen.camposCopiadosDelCorpus,
]);

/** Campos del contrato generados por el LLM: el Nivel A se aplica siempre y nunca con `frasesPermitidas`. */
export const CAMPOS_GENERADOS: readonly string[] = Object.freeze([...origen.camposGenerados]);
