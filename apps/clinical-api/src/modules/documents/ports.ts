/**
 * Puerto del almacén de documentos (`clinical-minio`). El service lo recibe por parámetro; el adapter real vive en
 * `infrastructure/` y el fake de los unitarios cumple el mismo contrato (incluido el error).
 */
export interface AlmacenDeDocumentos {
  /** Escribe el binario bajo `clave`. Sin metadatos ni nombre de archivo (RN-10). */
  guardar(clave: string, contenido: Buffer): Promise<void>;
  /** Borra el objeto; ausente no es un error (compensación idempotente). */
  borrar(clave: string): Promise<void>;
}

/** El almacén no respondió o rechazó la operación. El mensaje es fijo: nunca host, bucket, clave ni causa. */
export class AlmacenNoDisponible extends Error {
  constructor() {
    super('Almacén de documentos no disponible');
    this.name = 'AlmacenNoDisponible';
  }
}
