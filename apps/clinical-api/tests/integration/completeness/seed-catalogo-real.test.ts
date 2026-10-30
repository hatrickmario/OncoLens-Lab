import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { componerCompletitud } from '../../../src/modules/completeness/completeness.module.js';
import type { ChecklistDelPaciente } from '../../../src/modules/completeness/ports.js';
import {
  TIPOS_HABILITADOS_DE_TEST,
  leerTexto,
  nuevoPaciente,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarDiagnostico,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from '../../support/completitud.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  RUTA_DEL_CATALOGO,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

const ESPACIO_DE_IDS = 9420;
const VERSION_DEL_CATALOGO_REAL = '1.1.0';

interface ItemDelCatalogo {
  key: string;
  destination: { match: { name: string } };
}

/** Nombre canónico (`destination.match.name`) que el catálogo real 1.1.0 espera para un ítem de mama. */
function nombreDelCatalogo(clave: string): string {
  const { items } = JSON.parse(
    readFileSync(resolve(RUTA_DEL_CATALOGO, 'mama/datos-criticos.json'), 'utf8'),
  ) as { items: ItemDelCatalogo[] };
  const item = items.find((candidato) => candidato.key === clave);
  if (item === undefined) throw new Error(`el catálogo real no tiene el ítem ${clave}`);
  return item.destination.match.name;
}

/** Paciente de mama con diagnóstico activo: sin él el checklist no sabe qué ítems del catálogo aplican. */
async function nuevaPacienteDeMama(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(contexto);
  await sembrarDiagnostico(paciente, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: '2',
    stagingSystem: 'TNM_8',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  return paciente;
}

const estadoDe = (checklist: ChecklistDelPaciente, clave: string): string | undefined =>
  checklist.items.find((item) => item.key === clave)?.status;

describe('checklist del seed sintético con el catálogo real 1.1.0', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;
  let siembra: ContextoDeSiembra;

  const checklistDe = (patientId: string): Promise<ChecklistDelPaciente> =>
    componerCompletitud({
      db: cliente,
      rutaDelCatalogo: RUTA_DEL_CATALOGO,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    }).calcular(patientId);

  beforeAll(async () => {
    base = await crearBaseDelSeed('catalogo_real');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
    siembra = await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('deja re presente en la semilla (a), rp en la (c) y her2_ihq en la (a) y la (e) y faltante en la (c) [US-003 AC-1]', async () => {
    const a = await checklistDe(idSembrado('paciente-a'));
    const c = await checklistDe(idSembrado('paciente-c'));
    const e = await checklistDe(idSembrado('paciente-e'));

    expect(a.catalogVersion).toBe(VERSION_DEL_CATALOGO_REAL);
    expect(estadoDe(a, 're')).toBe('presente_verificado');
    expect(estadoDe(c, 'rp')).toBe('presente_verificado');
    expect(estadoDe(a, 'her2_ihq')).toBe('presente_verificado');
    expect(estadoDe(e, 'her2_ihq')).toBe('presente_verificado');
    expect(estadoDe(c, 'her2_ihq')).toBe('faltante');
  });

  it('deja re, rp y brca_germinal presentes cuando el paciente trae los nombres leídos del catálogo real', async () => {
    const paciente = await nuevaPacienteDeMama(siembra);
    for (const clave of ['re', 'rp', 'brca_germinal']) {
      await sembrarBiomarcador(paciente, {
        name: nombreDelCatalogo(clave),
        value: 'Positivo',
        reviewStatus: 'verificado',
      });
    }

    const checklist = await checklistDe(paciente.patientId);

    expect(estadoDe(checklist, 're')).toBe('presente_verificado');
    expect(estadoDe(checklist, 'rp')).toBe('presente_verificado');
    expect(estadoDe(checklist, 'brca_germinal')).toBe('presente_verificado');
  });

  it('deja re faltante cuando el biomarcador usa el nombre antiguo Receptor de estrógeno', async () => {
    const paciente = await nuevaPacienteDeMama(siembra);
    await sembrarBiomarcador(paciente, {
      name: 'Receptor de estrógeno',
      value: 'Positivo',
      reviewStatus: 'verificado',
    });

    const checklist = await checklistDe(paciente.patientId);

    expect(estadoDe(checklist, 're')).toBe('faltante');
  });
});
