export interface IndiceCiego {
  /** HMAC-SHA256 en hex de `idType` y el número normalizado; el país emisor no entra (D2). */
  indiceDeDocumento(idType: string, numeroDeDocumento: string): string;
}

export function crearIndiceCiego(_clave: Buffer): IndiceCiego {
  throw new Error('no implementado');
}
