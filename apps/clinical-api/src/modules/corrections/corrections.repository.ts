import type { FuenteDeConexiones } from '../manual-entry/manual-entry.repository.js';
import type { RepositorioDeCorrecciones } from './ports.js';

export function createCorrectionsRepository(
  _fuente: FuenteDeConexiones,
): RepositorioDeCorrecciones {
  const noImplementado = (): never => {
    throw new Error('no implementado');
  };
  return {
    enTransaccion: noImplementado,
    notasVigentes: noImplementado,
    historialDeBiomarcador: noImplementado,
    historialDeNota: noImplementado,
  };
}
