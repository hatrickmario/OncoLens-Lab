/*
 * Errores de dominio de toda escritura clínica del oncólogo (registro manual y corrección). Llevan el NOMBRE de la
 * propiedad del cuerpo que los causó (`campo`), nunca su valor (RN-10): el controller los traduce a 422.
 */

/** RN-17: un paciente egresado no admite ningún registro hasta su reactivación. */
export class PacienteEgresadoError extends Error {
  constructor() {
    super('El paciente está egresado');
    this.name = 'PacienteEgresadoError';
  }
}

export class ValorFueraDeCatalogoError extends Error {
  constructor(readonly campo: string) {
    super('Valor fuera del catálogo');
    this.name = 'ValorFueraDeCatalogoError';
  }
}

/** La declaración de ausencia de tratamiento contradice los tratamientos vigentes (design D4): una sola verdad. */
export class DeclaracionIncoherenteError extends Error {
  constructor(readonly campo: string) {
    super('Declaración incoherente con los tratamientos registrados');
    this.name = 'DeclaracionIncoherenteError';
  }
}
