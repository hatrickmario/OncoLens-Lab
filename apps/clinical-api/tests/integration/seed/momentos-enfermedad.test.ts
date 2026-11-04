import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { leerCatalogo } from '../../../prisma/seed/catalogo.js';
import { idDeTratamiento, idSembrado } from '../../../prisma/seed/determinismo.js';
import { ejecutarSeed } from '../../../prisma/seed/principal.js';
import { SeedBloqueadoError } from '../../../prisma/seed/guarda.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { servicioDesdeEntorno, entornoDeClaves } from '../../support/identidad.js';
import {
  RUTA_DEL_CATALOGO,
  contarFilasDeTodasLasTablas,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

/**
 * Los pacientes semilla en distintos momentos de la enfermedad (US-254, tipo test después: seed): (a)–(f) son los
 * anteriores y (g)–(m) los nuevos. El literal de pacientes se fija aquí a propósito: es lo que este test verifica.
 */
const TOTAL_PACIENTES_SEMILLA = 13;
const NUEVOS = ['g', 'h', 'i', 'j', 'k', 'l', 'm'] as const;
const idDe = (letra: string): string => idSembrado(`paciente-${letra}`);

interface Tratamiento {
  line_number: number;
  regimen_name: string;
  atc_codes: string[];
  mapping_status: string;
  ongoing: boolean;
  ended_at: Date | null;
  end_reason: string;
}

describe('Pacientes semilla por momento de la enfermedad', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;

  async function filas<T extends object>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    return (await cliente.query<T>(sql, parametros)).rows;
  }

  const tratamientosDe = (letra: string) =>
    filas<Tratamiento>(
      `SELECT line_number, regimen_name, atc_codes, mapping_status::text AS mapping_status, ongoing, ended_at,
              end_reason::text AS end_reason
         FROM clinical.prior_treatment WHERE patient_id = $1 ORDER BY line_number`,
      [idDe(letra)],
    );

  beforeAll(async () => {
    base = await crearBaseDelSeed('momentos');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('carga los 7 pacientes nuevos con su tipo de cáncer y 13 pacientes semilla [US-254 AC-1]', async () => {
    const tipos = await filas<{ patient_id: string; cancer_type: string }>(
      'SELECT patient_id, cancer_type::text AS cancer_type FROM clinical.diagnosis WHERE is_active',
    );
    const tipoDe = (letra: string) =>
      tipos.filter((t) => t.patient_id === idDe(letra)).map((t) => t.cancer_type);
    const [total] = await filas<{ n: number }>('SELECT count(*)::int AS n FROM clinical.patient');

    expect(total?.n).toBe(TOTAL_PACIENTES_SEMILLA);
    expect(PACIENTES_SEMILLA).toHaveLength(TOTAL_PACIENTES_SEMILLA);
    for (const letra of ['g', 'h', 'i', 'j', 'k']) expect(tipoDe(letra)).toEqual(['mama']);
    for (const letra of ['l', 'm']) expect(tipoDe(letra)).toEqual(['prostata']);
  });

  it('(k) tiene trastuzumab, pertuzumab y trastuzumab emtansina por línea; (l) sensible y (m) resistente a la castración [US-254 AC-1]', async () => {
    const lineas = await tratamientosDe('k');
    const castracion = (letra: string) =>
      filas<{ value: string }>(
        `SELECT value FROM clinical.clinical_attribute WHERE patient_id = $1 AND attribute_key = 'estado_castracion'`,
        [idDe(letra)],
      );

    expect(lineas.map((l) => l.line_number)).toEqual([1, 2]);
    expect(lineas[0]?.atc_codes).toEqual(expect.arrayContaining(['L01FD01', 'L01FD02']));
    expect(lineas[1]?.atc_codes).toEqual(['L01FD03']);
    expect(await castracion('l')).toEqual([{ value: 'sensible_castracion' }]);
    expect(await castracion('m')).toEqual([{ value: 'resistente_castracion' }]);
  });

  it('la leuprorelina de (l) y (m) lleva L02AE02 y ningún tratamiento lleva un ATC fuera del subconjunto del catálogo [US-254 AC-1] [RN-27]', async () => {
    const subconjunto = new Set(
      leerCatalogo(RUTA_DEL_CATALOGO, (ruta) => readFileSync(ruta, 'utf8'))
        .entradas.filter((entrada) => entrada.estandar === 'atc')
        .map((entrada) => entrada.codigo),
    );
    const todos = await filas<{ atc_codes: string[] }>(
      'SELECT atc_codes FROM clinical.prior_treatment WHERE patient_id = ANY($1)',
      [NUEVOS.map(idDe)],
    );

    for (const letra of ['l', 'm']) {
      const linea1 = (await tratamientosDe(letra))[0];
      expect(linea1?.regimen_name).toContain('Leuprorelina');
      expect(linea1?.atc_codes).toContain('L02AE02');
    }
    expect(todos.length).toBeGreaterThan(0);
    for (const fila of todos)
      for (const codigo of fila.atc_codes) expect(subconjunto).toContain(codigo);
  });

  it('un régimen combinado con un fármaco fuera del catálogo conserva el código del que sí está y queda no_mapeado [US-254 AC-1] [RN-27]', async () => {
    const [letrozolConPalbociclib] = await tratamientosDe('j');
    const [leuprorelinaConAbiraterona] = await tratamientosDe('l');

    expect(letrozolConPalbociclib).toMatchObject({
      atc_codes: ['L02BG04'],
      mapping_status: 'no_mapeado',
    });
    expect(leuprorelinaConAbiraterona).toMatchObject({
      atc_codes: ['L02AE02'],
      mapping_status: 'no_mapeado',
    });
  });

  it('un régimen sin ATC en el catálogo queda no_mapeado y sin código [US-254 AC-1] [RN-27]', async () => {
    const tamoxifeno = (await tratamientosDe('i'))[0];
    const enzalutamida = (await tratamientosDe('m'))[1];

    for (const linea of [tamoxifeno, enzalutamida]) {
      expect(linea?.atc_codes).toEqual([]);
      expect(linea?.mapping_status).toBe('no_mapeado');
    }
  });

  it('deja terminada con fecha y motivo la línea que cerró una progresión y en curso la última [US-254 AC-2]', async () => {
    const [primera, segunda] = await tratamientosDe('k');
    const [cierre] = await filas<{ prior_treatment_id: string | null }>(
      `SELECT prior_treatment_id FROM clinical.clinical_event
        WHERE patient_id = $1 AND description = 'Progresión hepática'`,
      [idDe('k')],
    );
    const [enCurso] = await tratamientosDe('j');

    expect(primera).toMatchObject({ ongoing: false, end_reason: 'progresion' });
    expect(primera?.ended_at).toBeInstanceOf(Date);
    expect(segunda).toMatchObject({ ongoing: false, end_reason: 'progresion' });
    expect(cierre?.prior_treatment_id).toBe(idDeTratamiento('paciente-k', 'linea-1'));
    expect(enCurso).toMatchObject({ ongoing: true, ended_at: null, end_reason: 'desconocido' });
  });

  it('los ids son deterministas y la segunda ejecución no cambia conteos ni identidades SINT-0000007…13 [US-254 AC-5] [RN-13]', async () => {
    const consultaDeIds = `SELECT id FROM clinical.prior_treatment UNION ALL SELECT id FROM clinical.clinical_event
                           UNION ALL SELECT id FROM clinical.clinical_attribute ORDER BY id`;
    const antes = await contarFilasDeTodasLasTablas(cliente);
    const idsAntes = await filas(consultaDeIds);

    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));

    expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(antes);
    expect(await filas(consultaDeIds)).toEqual(idsAntes);
    expect(
      (
        await filas<{ id: string }>('SELECT id FROM clinical.patient WHERE id = ANY($1)', [
          NUEVOS.map(idDe),
        ])
      ).length,
    ).toBe(NUEVOS.length);
    const identidad = servicioDesdeEntorno({
      env: entornoDeClaves(archivos.claves, 1),
      db: cliente,
    });
    const numeros: string[] = [];
    for (const letra of NUEVOS) {
      const descifrada = await identidad.descifrar(idDe(letra));
      numeros.push(descifrada?.numeroDeDocumento ?? '');
      expect(descifrada?.nombreCompleto).toMatch(/^Prueba Sintética \d+$/);
    }
    expect(numeros).toEqual(
      ['7', '8', '9', '10', '11', '12', '13'].map((n) => `SINT-${n.padStart(7, '0')}`),
    );
    const tipos = await filas<{ id_type: string }>(
      'SELECT id_type::text AS id_type FROM identity.patient_identity WHERE patient_id = ANY($1)',
      [NUEVOS.map(idDe)],
    );
    expect(tipos.every((t) => t.id_type === 'sintetico')).toBe(true);
  });

  it('en piloto el seed se niega sin escribir ninguna fila de los pacientes (a)–(m) [US-254 AC-5] [RN-13]', async () => {
    const antes = await contarFilasDeTodasLasTablas(cliente);

    await expect(
      ejecutarSeed(entornoDelSeed(archivos, { APP_ENV: 'piloto' }), {
        conectar: () => Promise.reject(new Error('la guarda debía impedir esta conexión')),
        leerArchivo: () => 'contenido-ficticio',
        hasher: { hash: () => Promise.resolve('hash'), verify: () => Promise.resolve(false) },
        registrar: () => undefined,
        traceId: 'req_momentos01',
      }),
    ).rejects.toBeInstanceOf(SeedBloqueadoError);

    expect(await contarFilasDeTodasLasTablas(cliente)).toEqual(antes);
  });
});
