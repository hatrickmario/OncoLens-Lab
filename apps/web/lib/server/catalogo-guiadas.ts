import 'server-only';
import escalas from '../../../../packages/clinical-catalogs/escalas.json';
import marcosDePregunta from '../../../../packages/clinical-catalogs/lenguaje/marcos-de-pregunta.json';
import manifest from '../../../../packages/clinical-catalogs/manifest.json';
import codigosMama from '../../../../packages/clinical-catalogs/mama/codigos.json';
import datosCriticosMama from '../../../../packages/clinical-catalogs/mama/datos-criticos.json';
import plantillasMama from '../../../../packages/clinical-catalogs/mama/plantillas.json';
import codigosProstata from '../../../../packages/clinical-catalogs/prostata/codigos.json';
import datosCriticosProstata from '../../../../packages/clinical-catalogs/prostata/datos-criticos.json';
import plantillasProstata from '../../../../packages/clinical-catalogs/prostata/plantillas.json';
import type { CatalogosDeLasPreguntas } from '../conversacion/preguntas-guiadas';

/**
 * Lo que `armarPreguntasGuiadas` consulta del catálogo versionado (RN-27, ADR-52). Se importa en servidor, como
 * `texto-si-permitido.ts` con `terminos-prohibidos.json`: el catálogo nunca entra al bundle del navegador y no hay
 * ruta de lectura nueva. `web` y `clinical-api` se construyen del mismo commit con el mismo paquete (design D7).
 */
export const catalogosGuiadas = {
  plantillas: { mama: plantillasMama, prostata: plantillasProstata },
  codigos: { mama: codigosMama, prostata: codigosProstata },
  escalas,
  datosCriticos: { mama: datosCriticosMama, prostata: datosCriticosProstata },
  biomarcadoresNoAnclables: marcosDePregunta.expansion.biomarcadoresNoAnclables,
} as unknown as CatalogosDeLasPreguntas;

/** Versión del catálogo importado: la comprueba un test contra `packages/clinical-catalogs`. */
export const VERSION_DEL_CATALOGO_GUIADAS: string = manifest.version;
