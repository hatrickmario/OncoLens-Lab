/** El paciente pedido no existe; la ficha responde 404 sin distinguirlo de un identificador mal formado (D7). */
export class PacienteNoEncontradoError extends Error {
  constructor() {
    super('Paciente no encontrado');
    this.name = 'PacienteNoEncontradoError';
  }
}
