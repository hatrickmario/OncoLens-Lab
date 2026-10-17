/** Generador de identificadores inyectable: los services no llaman a `uuid()` ni a `randomUUID()` directamente. */
export type GeneradorDeIds = () => string;
