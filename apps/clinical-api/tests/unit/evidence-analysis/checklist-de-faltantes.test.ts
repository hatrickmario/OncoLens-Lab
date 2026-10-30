import { describe, expect, it } from 'vitest';
import type {
  ChecklistDelPaciente,
  CompletenessService,
  EstadoDelChecklist,
} from '../../../src/modules/completeness/ports.js';
import { crearChecklistDeFaltantes } from '../../../src/modules/evidence-analysis/evidence-analysis.module.js';
import { ChecklistNoDisponibleError } from '../../../src/modules/evidence-analysis/ports.js';

const checklistCon = (...items: [string, EstadoDelChecklist][]): ChecklistDelPaciente => ({
  catalogVersion: 'test-1.0.0',
  cancerTypeEnabled: true,
  items: items.map(([key, status]) => {
    const presente = status === 'presente_verificado' || status === 'presente_sin_verificar';
    return {
      key,
      label: key,
      status,
      origin: presente ? 'seed' : 'regla',
      provenance: presente
        ? { entryMethod: 'seed', reviewStatus: 'verificado', sourceDocumentId: null }
        : null,
      destination: { entity: 'Diagnosis', field: key },
      condition: null,
    };
  }),
});

const completitudCon = (checklist: ChecklistDelPaciente): CompletenessService => ({
  calcular: () => Promise.resolve(checklist),
});

describe('crearChecklistDeFaltantes', () => {
  it('devuelve una lista vacía cuando ningún ítem está faltante', async () => {
    const checklist = completitudCon(
      checklistCon(['histologia', 'presente_verificado'], ['grado', 'presente_verificado']),
    );

    expect(await crearChecklistDeFaltantes(checklist).faltantes('p-1')).toEqual([]);
  });

  it('conserva el orden del catálogo cuando hay varios faltantes', async () => {
    const checklist = completitudCon(
      checklistCon(
        ['histologia', 'faltante'],
        ['grado', 'presente_verificado'],
        ['rp', 'faltante'],
      ),
    );

    expect(await crearChecklistDeFaltantes(checklist).faltantes('p-1')).toEqual([
      'histologia',
      'rp',
    ]);
  });

  it('excluye presente_sin_verificar y no_aplica cuando hay un faltante', async () => {
    const checklist = completitudCon(
      checklistCon(
        ['re', 'presente_sin_verificar'],
        ['her2_ish', 'no_aplica'],
        ['ki67', 'faltante'],
      ),
    );

    expect(await crearChecklistDeFaltantes(checklist).faltantes('p-1')).toEqual(['ki67']);
  });

  it('lanza ChecklistNoDisponibleError sin el mensaje original cuando el cálculo falla', async () => {
    const roto: CompletenessService = {
      calcular: () => Promise.reject(new Error('detalle interno del catálogo')),
    };

    const resultado = crearChecklistDeFaltantes(roto).faltantes('p-1');

    await expect(resultado).rejects.toBeInstanceOf(ChecklistNoDisponibleError);
    await expect(resultado).rejects.not.toThrow('detalle interno');
  });

  it('pasa el patientId al cálculo cuando se piden los faltantes', async () => {
    const pedidos: string[] = [];
    const espia: CompletenessService = {
      calcular: (patientId) => {
        pedidos.push(patientId);
        return Promise.resolve(checklistCon());
      },
    };

    await crearChecklistDeFaltantes(espia).faltantes('p-77');

    expect(pedidos).toEqual(['p-77']);
  });
});
