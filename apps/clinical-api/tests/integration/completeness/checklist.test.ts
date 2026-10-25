import type { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { componerCompletitud } from '../../../src/modules/completeness/completeness.module.js';
import type {
  ChecklistDelPaciente,
  EstadoDelChecklist,
} from '../../../src/modules/completeness/ports.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  RUTA_CATALOGO_TEST_1_1_0,
  leerTexto,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarFM1,
  sembrarFM2,
  sembrarFM3,
  sembrarFP1,
  sembrarKi67NoMapeado,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { ragSimulado } from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9401;
const rag = ragSimulado();
let cliente: Client;
let siembra: ContextoDeSiembra;

beforeAll(async () => {
  rag.iniciar();
  cliente = await conectar(inject('urlBaseDeTest'));
  siembra = await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS));
});
beforeEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await cliente.end();
});

const servicioCon = (rutaDelCatalogo: string) =>
  componerCompletitud({ db: cliente, rutaDelCatalogo, leerArchivo: leerTexto });

const claves = (checklist: ChecklistDelPaciente, estado: EstadoDelChecklist): string[] =>
  checklist.items.filter((item) => item.status === estado).map((item) => item.key);

describe('checklist determinista de datos críticos', () => {
  it('devuelve 12 ítems con nueve presente_verificado y tres no_aplica cuando F-M1 está completo [US-002 AC-1]', async () => {
    const fm1 = await sembrarFM1(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm1.patientId);

    expect(checklist.catalogVersion).toBe('test-1.0.0');
    expect(checklist.items.map((item) => item.key)).toEqual([
      'histologia',
      'grado',
      'tnm',
      'ecog',
      're',
      'rp',
      'her2_ihq',
      'her2_ish',
      'ki67',
      'estado_menopausico',
      'tratamientos_previos',
      'brca_germinal',
    ]);
    expect(claves(checklist, 'presente_verificado')).toEqual([
      'histologia',
      'grado',
      'tnm',
      'ecog',
      're',
      'rp',
      'her2_ihq',
      'ki67',
      'estado_menopausico',
    ]);
    expect(claves(checklist, 'no_aplica')).toEqual([
      'her2_ish',
      'tratamientos_previos',
      'brca_germinal',
    ]);
  });

  it('clasifica exactamente cada ítem de F-M2 con re en presente_sin_verificar y seis faltantes cuando los estados son mixtos [US-002 AC-2]', async () => {
    const fm2 = await sembrarFM2(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm2.patientId);

    expect(claves(checklist, 'presente_verificado')).toEqual([
      'histologia',
      'tnm',
      'ecog',
      'her2_ihq',
      'tratamientos_previos',
    ]);
    expect(claves(checklist, 'presente_sin_verificar')).toEqual(['re']);
    expect(claves(checklist, 'faltante')).toEqual([
      'grado',
      'rp',
      'her2_ish',
      'ki67',
      'estado_menopausico',
      'brca_germinal',
    ]);
    expect(claves(checklist, 'no_aplica')).toEqual([]);
  });

  it('deja re en presente_sin_verificar cuando un receptor posterior en requiere_revision sigue a uno verificado [US-002 AC-2]', async () => {
    const fm1 = await sembrarFM1(siembra);
    await sembrarBiomarcador(fm1, {
      name: 'Receptor de estrógeno',
      value: 'Positivo',
      reviewStatus: 'requiere_revision',
      performedAt: '2026-10-20', // posterior al examen sembrado de F-M1 (2026-10-16)
    });

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm1.patientId);

    expect(claves(checklist, 'presente_sin_verificar')).toEqual(['re']);
  });

  it('deja rp en faltante cuando su único registro está rechazado [US-002 AC-3]', async () => {
    const fm2 = await sembrarFM2(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm2.patientId);

    expect(checklist.items.find((item) => item.key === 'rp')?.status).toBe('faltante');
  });

  it('aplica el whenConditionUnknown de cada ítem cuando F-M3 no tiene TNM ni HER2 [US-002 AC-4]', async () => {
    const fm3 = await sembrarFM3(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm3.patientId);

    const estadoDe = (clave: string) => checklist.items.find((item) => item.key === clave)?.status;
    expect(estadoDe('her2_ish')).toBe('no_aplica');
    expect(estadoDe('brca_germinal')).toBe('no_aplica');
    expect(estadoDe('tratamientos_previos')).toBe('faltante');
    expect(estadoDe('tnm')).toBe('faltante');
    expect(estadoDe('her2_ihq')).toBe('faltante');
  });

  it('da dos serializaciones idénticas y cero llamadas a rag-orchestrator cuando se calcula dos veces F-M2 [US-002 AC-5]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const servicio = servicioCon(RUTA_CATALOGO_TEST_1_0_0);

    const primero = await servicio.calcular(fm2.patientId);
    const segundo = await servicio.calcular(fm2.patientId);

    expect(JSON.stringify(segundo)).toBe(JSON.stringify(primero));
    expect(segundo.catalogVersion).toBe('test-1.0.0');
    expect(rag.llamadas()).toBe(0);
  });

  it('devuelve 11 ítems sin ki67, 5 faltantes y catalogVersion test-1.1.0 cuando la misma build arranca con test-1.1.0 [US-002 AC-6]', async () => {
    const fm2 = await sembrarFM2(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_1_0).calcular(fm2.patientId);

    expect(checklist.items).toHaveLength(11);
    expect(checklist.items.map((item) => item.key)).not.toContain('ki67');
    expect(claves(checklist, 'faltante')).toHaveLength(5);
    expect(checklist.catalogVersion).toBe('test-1.1.0');
  });

  it('devuelve solo psa_serie y ecog en presente_verificado cuando el paciente es F-P1 de próstata [US-002 AC-7]', async () => {
    const fp1 = await sembrarFP1(siembra);

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fp1.patientId);

    expect(checklist.items).toEqual([
      { key: 'psa_serie', status: 'presente_verificado' },
      { key: 'ecog', status: 'presente_verificado' },
    ]);
  });

  it('deja ki67 en presente_sin_verificar cuando el único Ki-67 de F-M2 está no_mapeado con name del catálogo [US-002 AC-8]', async () => {
    const fm2 = await sembrarFM2(siembra);
    await sembrarKi67NoMapeado(fm2, 'Ki-67');

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm2.patientId);

    expect(checklist.items.find((item) => item.key === 'ki67')?.status).toBe(
      'presente_sin_verificar',
    );
  });

  it('deja ki67 en faltante cuando el Ki-67 no_mapeado de F-M2 tiene un name que no coincide con el catálogo [US-002 AC-8]', async () => {
    const fm2 = await sembrarFM2(siembra);
    await sembrarKi67NoMapeado(fm2, 'Ki67 índice');

    const checklist = await servicioCon(RUTA_CATALOGO_TEST_1_0_0).calcular(fm2.patientId);

    expect(checklist.items.find((item) => item.key === 'ki67')?.status).toBe('faltante');
  });
});
