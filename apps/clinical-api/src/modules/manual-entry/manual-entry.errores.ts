/*
 * Errores de dominio del registro manual. Llevan el NOMBRE de la propiedad del cuerpo que los causó (`campo`), nunca su
 * valor (RN-10): el controller los traduce a 422 y, cuando el contrato declare `field` (l1d-80, D9), lo emite.
 */

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

export class GradacionIncoherenteError extends Error {
  constructor(readonly campo: 'gleasonScore' | 'isupGradeGroup') {
    super('Gradación incoherente');
    this.name = 'GradacionIncoherenteError';
  }
}

/** El cuerpo cumple el schema pero no lo que el caso exige (p. ej. faltan los campos mínimos del primer diagnóstico). */
export class CuerpoIncompletoError extends Error {
  constructor(readonly campo: string) {
    super('Cuerpo incompleto');
    this.name = 'CuerpoIncompletoError';
  }
}
