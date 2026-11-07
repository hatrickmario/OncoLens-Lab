import type { MundoDeGateway, RagSimulado } from '../../tests/support/gateway.js';

/** Métricas de faltantes de un paciente sembrado (M-04.1, M-04.2 y exactitud de `gapType`, US-269 AC-4). */
export interface MetricasDeFaltantes {
  esperados: number;
  sensibilidad: number | null;
  especificidad: number | null;
  gapType: { correctos: number; total: number };
}

export interface EntradaDeLaPreparacion {
  mundo: MundoDeGateway;
  rag: RagSimulado;
  cookie: string;
  /** Directorio del dataset `chat-v1` (`manifest.yaml` y `casos.yaml`). */
  dataset: string;
  /** Directorio donde se escriben las peticiones (`<id-del-caso>.json`). */
  salida: string;
}

export interface ResultadoDeLaPreparacion {
  /** Ids de los casos y controles para los que se escribió una petición. */
  peticiones: string[];
  /** Por clave de paciente del seed. */
  faltantes: Record<string, MetricasDeFaltantes>;
}

export function prepararPeticionesDeChat(
  _entrada: EntradaDeLaPreparacion,
): Promise<ResultadoDeLaPreparacion> {
  return Promise.reject(new Error('no implementado'));
}
