/** El paciente no tiene un diagnóstico vigente: sin tipo de cáncer no se puede validar el atributo contra el catálogo. */
export class TipoDeCancerNoRegistradoError extends Error {
  constructor() {
    super('El paciente no tiene tipo de cáncer');
    this.name = 'TipoDeCancerNoRegistradoError';
  }
}
