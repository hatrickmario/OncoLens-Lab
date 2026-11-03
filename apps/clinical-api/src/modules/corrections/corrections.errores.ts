/*
 * Errores de dominio de la corrección con histórico. Llevan el NOMBRE de la propiedad del cuerpo que los causó
 * (`campo`), nunca su valor (RN-10): el controller los traduce al 422 del contrato con `field`.
 */

/** El cuerpo cumple el schema pero no lo que la corrección exige (fecha futura, texto vacío o largo, sin cambios). */
export class CorreccionInvalidaError extends Error {
  /** Ausente cuando el error no es de un campo (p. ej. una corrección sin cambios). */
  readonly campo: string | undefined;

  constructor(campo?: string) {
    super('Corrección inválida');
    this.name = 'CorreccionInvalidaError';
    this.campo = campo;
  }
}

/** La fila ya fue reemplazada o rechazada: solo se corrige un dato vigente (RN-08, 409). */
export class DatoNoVigenteError extends Error {
  constructor() {
    super('El dato ya no está vigente');
    this.name = 'DatoNoVigenteError';
  }
}

/** El dato no existe o es de otro paciente: ambos son 404 indistinguibles para el cliente. */
export class DatoNoEncontradoError extends Error {
  constructor() {
    super('Dato no encontrado');
    this.name = 'DatoNoEncontradoError';
  }
}
