/** Errores de dominio de la carga; el controller los traduce a HTTP. Ninguno lleva datos del archivo (RN-10). */

export class ArchivoNoPdf extends Error {
  constructor() {
    super('El archivo no es un PDF');
    this.name = 'ArchivoNoPdf';
  }
}

export class ArchivoDemasiadoGrande extends Error {
  constructor() {
    super('El archivo supera el tamaño máximo');
    this.name = 'ArchivoDemasiadoGrande';
  }
}

export class DocumentoDuplicado extends Error {
  constructor() {
    super('El paciente ya tiene un documento con el mismo checksum');
    this.name = 'DocumentoDuplicado';
  }
}

export class PacienteNoEncontrado extends Error {
  constructor() {
    super('El paciente no existe');
    this.name = 'PacienteNoEncontrado';
  }
}
