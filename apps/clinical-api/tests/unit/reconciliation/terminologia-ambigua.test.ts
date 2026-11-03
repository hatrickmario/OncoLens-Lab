import { describe, expect, it } from 'vitest';
import type { CatalogoTerminologico } from '../../../src/modules/reconciliation/ports.js';
import { createReconciliationService } from '../../../src/modules/reconciliation/reconciliation.service.js';
import type { LineaDeLog } from '../../../src/infrastructure/logger.js';

/** Catálogo en memoria con dos términos que comparten un sinónimo (el validador del paquete no lo impide, D4). */
const catalogoAmbiguo: CatalogoTerminologico = {
  version: () => 'test-x-1.0.0',
  entradas: (_tipo, estandar) =>
    estandar === 'loinc'
      ? [
          { terminoCanonico: 'A', estandar, codigo: 'C-A', nombreOficial: 'A', etiquetaEs: 'A' },
          { terminoCanonico: 'B', estandar, codigo: 'C-B', nombreOficial: 'B', etiquetaEs: 'B' },
        ]
      : [],
  sinonimos: () => [
    { terminoCanonico: 'A', textos: ['marcador secreto'] },
    { terminoCanonico: 'B', textos: ['marcador secreto'] },
  ],
};

describe('ReconciliationService: terminología ambigua', () => {
  it('devuelve no_mapeado y registra terminologia_ambigua sin el texto clínico cuando dos términos comparten sinónimo', () => {
    const logs: LineaDeLog[] = [];
    const servicio = createReconciliationService({
      catalogo: catalogoAmbiguo,
      registrar: (linea) => logs.push(linea),
    });

    const decision = servicio.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: 'mama',
      textoOriginal: 'marcador secreto',
    });

    expect(decision).toMatchObject({ mappingStatus: 'no_mapeado', loincCode: null });
    expect(logs).toEqual([
      { event: 'terminologia_ambigua', entidad: 'Biomarker', estandar: 'loinc' },
    ]);
    expect(JSON.stringify(logs)).not.toContain('secreto');
  });
});
