export type ResultadoDePaso = 'ok' | 'fallo' | 'no_verificable';
export type ModoDelLlm = 'fingido' | 'real' | 'desconocido';

/** Forma que consume `scripts/verify-g-demo --e2e-resultado` (docs/gates/README.md): sin PII ni texto generado. */
export interface ResultadoDelGate {
  pasos: { paso: string; resultado: ResultadoDePaso }[];
  catalogVersion?: string;
  modoLlm: ModoDelLlm;
  generadoEn: string;
}

/** `LLM_PROVIDER` de la corrida (lo fija `ejecutar.sh` o quien corre la demo): `fake`/`fingido` → fingido, `local` → real; otro valor o ninguno, falla cerrado. */
export function modoDelLlm(proveedor: string | undefined): ModoDelLlm {
  if (proveedor === 'fake' || proveedor === 'fingido') return 'fingido';
  if (proveedor === 'local') return 'real';
  return 'desconocido';
}

/** Plazos del recorrido de G-Demo en ms (D5-57). */
export interface PlazosDelGate {
  /** Tiempo máximo de todo el test (`test.setTimeout`). */
  recorrido: number;
  /** Espera de un `expect` que depende de una generación del LLM (análisis y seguimientos). */
  generacion: number;
}

export function plazosDelGate(_modo: ModoDelLlm): PlazosDelGate {
  return { recorrido: 0, generacion: 0 };
}
