import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as erroresDeDocumentos from '../../../src/modules/documents/documents.errores.js';
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

  it('no se exporta una segunda clase de paciente no encontrado desde los errores de documentos', () => {
    expect(Object.keys(erroresDeDocumentos).filter((nombre) => /Paciente/.test(nombre))).toEqual(
      [],
    );
  });

  it('se declara una sola vez en todo el código fuente cuando se buscan las clases de paciente no encontrado', () => {
    const raiz = join(__dirname, '../../../src');
    const archivosTs = (carpeta: string): string[] =>
      readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
        const ruta = join(carpeta, entrada.name);
        if (entrada.isDirectory()) return archivosTs(ruta);
        return ruta.endsWith('.ts') ? [ruta] : [];
      });

    const declaraciones = archivosTs(raiz).filter((ruta) =>
      /class\s+PacienteNoEncontrado\w*/.test(readFileSync(ruta, 'utf8')),
    );

    expect(declaraciones.map((ruta) => ruta.slice(raiz.length + 1))).toEqual([
      join('modules', 'compartido', 'pacientes.errores.ts'),
    ]);
  });
});
