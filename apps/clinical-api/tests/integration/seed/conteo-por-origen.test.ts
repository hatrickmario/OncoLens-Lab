import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { contarPacientesPorOrigen } from '../../../prisma/seed/contar.js';
import { PACIENTES_ADICIONALES_DEL_SEED } from '../../../prisma/seed/pacientes/chat.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import {
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

describe('contarPacientesPorOrigen', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  beforeAll(async () => {
    base = await crearBaseDelSeed('por_origen');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('cuenta todos los pacientes del seed como sintéticos y los otros dos orígenes en cero [US-142 AC-3]', async () => {
    await expect(contarPacientesPorOrigen(cliente)).resolves.toEqual({
      sintetico: PACIENTES_SEMILLA.length + PACIENTES_ADICIONALES_DEL_SEED,
      real_anonimizado: 0,
      real_identificado: 0,
    });
  });

  it('cuenta aparte al paciente real_anonimizado insertado solo en la BD de test sin devolver filas [US-142 AC-3]', async () => {
    await cliente.query(
      `UPDATE clinical.patient SET data_origin = 'real_anonimizado'
       WHERE id = (SELECT id FROM clinical.patient ORDER BY id LIMIT 1)`,
    );

    const conteo = await contarPacientesPorOrigen(cliente);

    expect(conteo).toEqual({
      sintetico: PACIENTES_SEMILLA.length + PACIENTES_ADICIONALES_DEL_SEED - 1,
      real_anonimizado: 1,
      real_identificado: 0,
    });
    expect(Object.keys(conteo).sort()).toEqual([
      'real_anonimizado',
      'real_identificado',
      'sintetico',
    ]);
  });
});
