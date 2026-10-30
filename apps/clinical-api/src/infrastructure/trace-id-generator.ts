/** Generador de identificadores de correlación inyectable (nada de `Date.now()` ni `Math.random()` en el dominio). */
export interface TraceIdGenerator {
  /** `req_` + alfanumérico (patrón `^req_[A-Za-z0-9]{8,32}$` del contrato). */
  traceId(): string;
}
