export const CODIGO_DE_INTEGRIDAD_DE_IDENTIDAD = 'IDENTITY_INTEGRITY_ERROR';

/**
 * El texto cifrado de la identidad no es íntegro (etiqueta GCM inválida, contexto que no corresponde o versión de clave
 * desconocida, D4). El mensaje es fijo: nunca lleva bytes ni texto del paciente (RN-10).
 */
export class IdentityIntegrityError extends Error {
  readonly code = CODIGO_DE_INTEGRIDAD_DE_IDENTIDAD;

  constructor() {
    super(CODIGO_DE_INTEGRIDAD_DE_IDENTIDAD);
    this.name = 'IdentityIntegrityError';
  }
}
