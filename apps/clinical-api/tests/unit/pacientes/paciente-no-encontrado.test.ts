import { describe, expect, it } from 'vitest';
import { PacienteNoEncontradoError as DelAnalisis } from '../../../src/modules/evidence-analysis/evidence-analysis.service.js';
import { PacienteNoEncontradoError as DePacientes } from '../../../src/modules/compartido/pacientes.errores.js';

describe('PacienteNoEncontradoError', () => {
  it('es la misma clase en pacientes y en el análisis cuando se importa desde cada módulo', () => {
    expect(DelAnalisis).toBe(DePacientes);
  });

  it('es reconocida por instanceof en ambos módulos cuando se lanza desde pacientes', () => {
    const error = new DePacientes();

    expect(error instanceof DelAnalisis).toBe(true);
  });
});
