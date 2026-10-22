import { z } from 'zod';

/**
 * Forma de `manifest.json` del catálogo clínico (`packages/clinical-catalogs/schemas/manifest.schema.json`): una sola
 * definición para el arranque (versión y tipos habilitados) y para el seed. `cancerTypes` es obligatorio, como en
 * rag-orchestrator: un manifiesto sin él es un catálogo no disponible, no un catálogo sin tipos.
 */
export const esquemaDeManifest = z.object({
  version: z.string().min(1),
  cancerTypes: z.array(z.string()),
});
