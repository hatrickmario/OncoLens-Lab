import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { componerCompletitud } from '../../../src/modules/completeness/completeness.module.js';
import {
  TIPOS_HABILITADOS_DE_TEST,
  leerTexto,
  nuevoPaciente,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarDiagnostico,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';

/**
 * BRCA (mama) y HRR (próstata) son biomarcadores moleculares opcionales para el MVP (criterios: RE/RP/HER2). El
 * modelo guarda su resultado como texto libre en `Biomarker.value`: admite los cuatro estados sin migración ni cambio
 * de contrato (decisión del usuario, 2026-10-30). Con el catálogo REAL, los cuatro cuentan como dato registrado.
 */
const ESPACIO_DE_IDS = 9430;
const ESTADOS_MOLECULARES = ['positivo', 'negativo', 'no realizado', 'desconocido'] as const;

let cliente: Client;
let siembra: ContextoDeSiembra;

beforeAll(async () => {
  cliente = await conectar(inject('urlBaseDeTest'));
  siembra = await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS));
});
afterAll(() => cliente.end());

const checklistDe = (patientId: string) =>
  componerCompletitud({
    db: cliente,
    rutaDelCatalogo: RUTA_DEL_CATALOGO,
    leerArchivo: leerTexto,
    tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
  }).calcular(patientId);

async function pacienteCon(tipo: 'mama' | 'prostata', gen: string | null, valor?: string) {
  const paciente = await nuevoPaciente(siembra);
  await sembrarDiagnostico(paciente, {
    cancerType: tipo,
    histology: tipo === 'mama' ? 'carcinoma ductal infiltrante' : 'adenocarcinoma',
    grade: '2',
    stagingSystem: 'TNM_8',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  if (gen !== null && valor !== undefined) {
    await sembrarBiomarcador(paciente, {
      name: gen,
      value: valor,
      reviewStatus: 'requiere_revision',
      entryMethod: 'manual',
    });
  }
  return paciente.patientId;
}

describe('biomarcadores moleculares opcionales con el catálogo real', () => {
  it.each(ESTADOS_MOLECULARES)(
    'cuenta BRCA como registrado y sin verificar cuando su resultado es "%s"',
    async (estado) => {
      const checklist = await checklistDe(await pacienteCon('mama', 'BRCA', estado));

      const item = checklist.items.find((i) => i.key === 'brca_germinal');
      expect(item?.status).toBe('presente_sin_verificar');
    },
  );

  it.each(ESTADOS_MOLECULARES)(
    'cuenta HRR como registrado y sin verificar cuando su resultado es "%s"',
    async (estado) => {
      const checklist = await checklistDe(await pacienteCon('prostata', 'HRR', estado));

      const item = checklist.items.find((i) => i.key === 'hrr_brca');
      expect(item?.status).toBe('presente_sin_verificar');
    },
  );

  it('deja BRCA en faltante cuando el paciente no tiene ningún resultado registrado', async () => {
    const checklist = await checklistDe(await pacienteCon('mama', null));

    expect(checklist.items.find((i) => i.key === 'brca_germinal')?.status).toBe('faltante');
  });
});
