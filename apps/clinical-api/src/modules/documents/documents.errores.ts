/** Errores de dominio de la carga; el controller los traduce a HTTP. Ninguno lleva datos del archivo (RN-10). */

export class ArchivoNoPdf extends Error {
  constructor() {
    super('El archivo no es un PDF');
    this.name = 'ArchivoNoPdf';
  }
}
