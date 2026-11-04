import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import {
  CONTRASENA_FICTICIA_ADMIN,
  CONTRASENA_FICTICIA_DOCTOR,
  TRACE_ID_DE_PRUEBA,
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
  type SeedEnProceso,
} from '../../support/seed.js';
import { createPasswordHasher } from '../../../src/modules/auth/password-hasher.js';
import { ARGON2_DE_PRUEBA } from '../../support/usuarios.js';

const PACIENTES = PACIENTES_SEMILLA.map((paciente) => paciente.clave.replace('paciente-', ''));
const idDe = (letra: string): string => idSembrado(`paciente-${letra}`);

describe('Contenido del seed sintético', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;
  let seed: SeedEnProceso;

  async function filas<T extends object>(sql: string, parametros: unknown[] = []): Promise<T[]> {
    return (await cliente.query<T>(sql, parametros)).rows;
  }

  beforeAll(async () => {
    base = await crearBaseDelSeed('contenido');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    seed = seedContraLaBase(base.url);
    await seed.ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('existen los pacientes (a)–(f) sintéticos con convenio, episodio abierto y datos seed verificados [US-039 AC-1]', async () => {
    const pacientes = await filas<{ id: string; data_origin: string; agreement_reference: string }>(
      'SELECT id, data_origin, agreement_reference FROM clinical.patient ORDER BY id',
    );
    expect(pacientes.map((p) => p.id).sort()).toEqual(PACIENTES.map(idDe).sort());
    expect(pacientes.every((p) => p.data_origin === 'sintetico')).toBe(true);
    expect(pacientes.every((p) => p.agreement_reference !== null)).toBe(true);

    const abiertos = await filas<{ patient_id: string; n: number }>(
      'SELECT patient_id, count(*)::int AS n FROM clinical.care_episode WHERE closed_at IS NULL GROUP BY patient_id',
    );
    expect(abiertos).toHaveLength(PACIENTES_SEMILLA.length);
    expect(abiertos.every((e) => e.n === 1)).toBe(true);

    for (const tabla of [
      'diagnosis',
      'diagnosis_grading',
      'prior_treatment',
      'clinical_event',
      'clinical_attribute',
    ]) {
      const ajenas = await filas(
        `SELECT 1 FROM clinical.${tabla} WHERE entry_method <> 'seed' OR review_status <> 'verificado'`,
      );
      expect(ajenas, tabla).toEqual([]);
    }
    expect(await filas(`SELECT 1 FROM clinical.exam WHERE entry_method <> 'seed'`)).toEqual([]);
    // Todo biomarcador está verificado salvo los de (f) = FX-T3-a, que acumula avisos a propósito (US-071).
    expect(
      await filas(
        `SELECT 1 FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
          WHERE b.review_status <> 'verificado' AND e.patient_id <> $1`,
        [idDe('f')],
      ),
    ).toEqual([]);
  });

  it('los usuarios de demo tienen hash Argon2id y ninguna contraseña en claro [US-039 AC-1]', async () => {
    const usuarios = await filas<{
      email: string;
      password_hash: string;
      account_status: string;
      rol: string;
    }>(
      `SELECT u.email, u.password_hash, u.account_status, r.name AS rol
         FROM auth."user" u JOIN auth.role r ON r.id = u.role_id ORDER BY u.email`,
    );
    expect(usuarios.map((u) => [u.email, u.rol, u.account_status])).toEqual([
      ['admin@test.local', 'admin', 'activo'],
      ['doc1@test.local', 'doctor', 'activo'],
    ]);
    const hasher = createPasswordHasher(ARGON2_DE_PRUEBA);
    for (const usuario of usuarios) {
      expect(usuario.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(usuario.password_hash).not.toContain(CONTRASENA_FICTICIA_DOCTOR);
      expect(usuario.password_hash).not.toContain(CONTRASENA_FICTICIA_ADMIN);
    }
    expect(await hasher.verify(usuarios[1]!.password_hash, CONTRASENA_FICTICIA_DOCTOR)).toBe(true);
    expect(await hasher.verify(usuarios[0]!.password_hash, CONTRASENA_FICTICIA_ADMIN)).toBe(true);
  });

  it('el registro del seed solo lleva conteos: ni correos ni contraseñas [US-039 AC-1]', () => {
    const texto = seed.registro.texto();

    expect(texto).toContain('seed_completo');
    expect(texto).toContain(TRACE_ID_DE_PRUEBA);
    expect(texto).not.toContain('test.local');
    expect(texto).not.toContain(CONTRASENA_FICTICIA_DOCTOR);
    expect(texto).not.toContain(CONTRASENA_FICTICIA_ADMIN);
  });

  it('(a) tiene el contenido de OL-01: mama TNM_8 IIA, ECOG 1, HER2 3+, RE positivo, menopausia, histología y grado [US-039 AC-2]', async () => {
    const [dx] = await filas<Record<string, unknown>>(
      `SELECT cancer_type, staging_system, stage_value, performance_scale, performance_value, histology, grade, id
         FROM clinical.diagnosis WHERE patient_id = $1 AND is_active`,
      [idDe('a')],
    );
    expect(dx).toMatchObject({
      cancer_type: 'mama',
      staging_system: 'TNM_8',
      stage_value: 'IIA',
      performance_scale: 'ECOG',
      performance_value: 1,
      grade: 'Nottingham grado 2',
    });
    expect(String(dx?.histology)).not.toBe('');
    const gradaciones = await filas<{ grading_system: string; is_reference: boolean }>(
      'SELECT grading_system, is_reference FROM clinical.diagnosis_grading WHERE diagnosis_id = $1',
      [dx?.id],
    );
    expect(gradaciones).toEqual([{ grading_system: 'nottingham', is_reference: true }]);
    const biomarcadores = await filas<{ name: string; value: string }>(
      `SELECT b.name, b.value FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 ORDER BY b.name`,
      [idDe('a')],
    );
    expect(biomarcadores).toEqual([
      { name: 'HER2', value: '3+ (IHQ)' },
      { name: 'RE', value: 'Positivo (80%)' },
    ]);
    const atributos = await filas<{ attribute_key: string }>(
      'SELECT attribute_key FROM clinical.clinical_attribute WHERE patient_id = $1',
      [idDe('a')],
    );
    expect(atributos.map((a) => a.attribute_key)).toContain('estado_menopausico');
  });

  it('(a) tiene una nota comorbilidad y una nota_libre sintéticas, sin PII, vigentes y del seed [US-253 AC-2]', async () => {
    const notas = await filas<{ note_type: string; content: string; supersedes_id: string | null }>(
      `SELECT note_type::text AS note_type, content, supersedes_id FROM clinical.clinical_note
        WHERE patient_id = $1 AND is_active AND review_status = 'verificado' AND entry_method = 'seed'
        ORDER BY note_type`,
      [idDe('a')],
    );

    expect(notas.map((nota) => nota.note_type)).toEqual(['comorbilidad', 'nota_libre']);
    expect(notas.every((nota) => nota.supersedes_id === null)).toBe(true);
    // Sin nombres propios, documentos ni teléfonos: ninguna secuencia de 6 o más dígitos ni un correo (RN-13, RN-14).
    for (const nota of notas) expect(nota.content).not.toMatch(/\d{6,}|@/);
  });

  it('(b) tiene el contenido de OL-01: próstata ISUP 3, tres PSA fechados, ADT y progresión [US-039 AC-2]', async () => {
    const [dx] = await filas<Record<string, unknown>>(
      `SELECT id, cancer_type, grade FROM clinical.diagnosis WHERE patient_id = $1 AND is_active`,
      [idDe('b')],
    );
    expect(dx).toMatchObject({ cancer_type: 'prostata', grade: 'Gleason 4+3=7 · ISUP 3' });
    const gradaciones = await filas<Record<string, unknown>>(
      `SELECT grading_system, specimen_type, grade_scope, gleason_primary_pattern,
              gleason_secondary_pattern, gleason_score, isup_grade_group, is_reference
         FROM clinical.diagnosis_grading WHERE diagnosis_id = $1`,
      [dx?.id],
    );
    expect(gradaciones).toEqual([
      {
        grading_system: 'gleason_isup',
        specimen_type: 'biopsia',
        grade_scope: 'peor',
        gleason_primary_pattern: 4,
        gleason_secondary_pattern: 3,
        gleason_score: 7,
        isup_grade_group: 3,
        is_reference: true,
      },
    ]);
    const psa = await filas<{ performed_at: Date }>(
      `SELECT e.performed_at FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 AND b.name = 'PSA'`,
      [idDe('b')],
    );
    expect(psa).toHaveLength(3);
    expect(new Set(psa.map((p) => p.performed_at.toISOString())).size).toBe(3);
    const tratamientos = await filas<{ regimen_name: string }>(
      'SELECT regimen_name FROM clinical.prior_treatment WHERE patient_id = $1',
      [idDe('b')],
    );
    expect(tratamientos).toEqual([{ regimen_name: 'Deprivación androgénica' }]);
    const eventos = await filas<{ event_type: string }>(
      'SELECT event_type FROM clinical.clinical_event WHERE patient_id = $1',
      [idDe('b')],
    );
    expect(eventos.map((e) => e.event_type)).toContain('progresion');
  });

  it('(c) tiene un diagnóstico inactivo y uno activo [US-039 AC-2]', async () => {
    const diagnosticos = await filas<{ is_active: boolean }>(
      'SELECT is_active FROM clinical.diagnosis WHERE patient_id = $1 ORDER BY is_active',
      [idDe('c')],
    );

    expect(diagnosticos.map((d) => d.is_active)).toEqual([false, true]);
  });

  it('(d) tiene un opt-out de analisis_ia registrado por el administrador [US-039 AC-2]', async () => {
    const optOuts = await filas<{ opt_out_type: string; action: string; recorded_by: string }>(
      'SELECT opt_out_type, action, recorded_by FROM clinical.patient_opt_out WHERE patient_id = $1',
      [idDe('d')],
    );
    const [admin] = await filas<{ id: string }>(
      `SELECT id FROM auth."user" WHERE email = 'admin@test.local'`,
    );

    expect(optOuts).toEqual([
      { opt_out_type: 'analisis_ia', action: 'registrado', recorded_by: admin?.id },
    ]);
  });

  it('(e) es mama sin estado menopáusico ni Ki-67 [US-039 AC-2]', async () => {
    const [dx] = await filas<{ cancer_type: string }>(
      'SELECT cancer_type FROM clinical.diagnosis WHERE patient_id = $1 AND is_active',
      [idDe('e')],
    );
    const menopausia = await filas(
      `SELECT 1 FROM clinical.clinical_attribute WHERE patient_id = $1 AND attribute_key = 'estado_menopausico'`,
      [idDe('e')],
    );
    const ki67 = await filas(
      `SELECT 1 FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 AND b.name ILIKE 'Ki-67%'`,
      [idDe('e')],
    );

    expect(dx?.cancer_type).toBe('mama');
    expect(menopausia).toEqual([]);
    expect(ki67).toEqual([]);
  });

  it('(f) es FX-T3-a: Ki-67 requiere_revision, dos RE en conflicto y sin estado menopáusico, con HER2 3+ verificado [US-071 FX-T3-a]', async () => {
    const biomarcadores = await filas<{
      id: string;
      name: string;
      value: string;
      review_status: string;
      conflicts_with_id: string | null;
    }>(
      `SELECT b.id, b.name, b.value, b.review_status, b.conflicts_with_id
         FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 ORDER BY b.name, b.value`,
      [idDe('f')],
    );
    const menopausia = await filas(
      `SELECT 1 FROM clinical.clinical_attribute WHERE patient_id = $1 AND attribute_key = 'estado_menopausico'`,
      [idDe('f')],
    );
    const porNombre = (nombre: string) => biomarcadores.filter((b) => b.name === nombre);
    const [reBase, reEnConflicto] = [
      porNombre('RE').find((b) => b.conflicts_with_id === null),
      porNombre('RE').find((b) => b.conflicts_with_id !== null),
    ];

    expect(porNombre('HER2')).toMatchObject([{ value: '3+ (IHQ)', review_status: 'verificado' }]);
    expect(porNombre('Ki-67')).toMatchObject([
      { value: '20 %', review_status: 'requiere_revision' },
    ]);
    expect(porNombre('RE')).toHaveLength(2);
    expect(reEnConflicto?.conflicts_with_id).toBe(reBase?.id);
    expect(reEnConflicto?.review_status).toBe('requiere_revision');
    expect(menopausia).toEqual([]);
  });
});
