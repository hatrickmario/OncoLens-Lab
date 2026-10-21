export interface SpecProblem {
  path: string;
  message: string;
}

/** Errores de validación del cuerpo contra el schema de `pointer` en el spec de `provider` (vacío si cumple). */
export function matchesSpec(provider: 'clinical-api' | 'rag-orchestrator', pointer: string, body: unknown): SpecProblem[];

/** Lanza nombrando cada campo incumplido si el cuerpo no cumple el schema de `pointer`. */
export function assertMatchesSpec(provider: 'clinical-api' | 'rag-orchestrator', pointer: string, body: unknown): void;

export interface RespuestaAVerificar {
  proveedor: 'clinical-api' | 'rag-orchestrator';
  metodo: string;
  /** Ruta concreta (con o sin query string). */
  ruta: string;
  status: number;
  /** Cabeceras de la respuesta (nombres en cualquier capitalización). */
  cabeceras: Record<string, unknown>;
  /** Cuerpo ya parseado; `undefined` si la respuesta no trae cuerpo. */
  cuerpo: unknown;
}

/** Lanza nombrando proveedor, método, plantilla, código y ruta JSON (nunca el valor) si la respuesta incumple el spec. */
export function verificarRespuesta(respuesta: RespuestaAVerificar): { plantilla: string; codigo: string };

/** La ruta concreta sin valores (ids ni query), apta para un mensaje. */
export function describirRuta(proveedor: 'clinical-api' | 'rag-orchestrator', ruta: string): string;

/** ¿Alguna operación del spec del proveedor (con cualquier método) corresponde a esta ruta concreta? */
export function rutaExisteEnElSpec(proveedor: 'clinical-api' | 'rag-orchestrator', ruta: string): boolean;

/** Verificador de respuestas sobre unos specs ya empaquetados (los tests de `verificarRespuesta` usan specs sintéticos). */
export function crearVerificadorDeRespuestas(specs: Record<string, { bundled: unknown }>): (respuesta: RespuestaAVerificar) => { plantilla: string; codigo: string };
