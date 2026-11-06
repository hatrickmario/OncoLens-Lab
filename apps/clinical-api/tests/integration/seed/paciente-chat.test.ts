import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { conectar, type BaseDeTest } from '../../support/db.js';
import { entornoDeClaves, servicioDesdeEntorno } from '../../support/identidad.js';
import {
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';

/** `P-CHAT` (FX-12-b, L1D-315, test después: seed): lo que el seed afirma del paciente sintético del chat. */
describe('Paciente sintético del chat P-CHAT', () => {
  let base: BaseDeTest;
  let cliente: Client;
  let archivos: ArchivosDeContrasena;
  const pacienteId = idSembrado(PACIENTE_CHAT);

  const filas = async <T extends object>(sql: string): Promise<T[]> =>
    (await cliente.query<T>(sql, [pacienteId])).rows;

  beforeAll(async () => {
    base = await crearBaseDelSeed('paciente_chat');
    cliente = await conectar(base.url);
    archivos = escribirArchivosDeContrasena();
    await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
  });

  afterAll(async () => {
    archivos.limpiar();
    await cliente.end();
    await base.destruir();
  });

  it('es sintético, de mama, con diagnóstico activo verificado, grado 2 y el estadio IIB en conflicto con el IIA', async () => {
    const [paciente] = await filas<{ data_origin: string }>(
      'SELECT data_origin::text AS data_origin FROM clinical.patient WHERE id = $1',
    );
    const diagnosticos = await filas<{
      stage_value: string;
      is_active: boolean;
      review_status: string;
      conflicts_with_id: string | null;
      grade: string | null;
      cancer_type: string;
      icd10_code: string | null;
    }>(
      `SELECT stage_value, is_active, review_status::text AS review_status, conflicts_with_id, grade,
              cancer_type::text AS cancer_type, icd10_code
         FROM clinical.diagnosis WHERE patient_id = $1 ORDER BY diagnosed_at`,
    );

    expect(paciente?.data_origin).toBe('sintetico');
    expect(diagnosticos.map((d) => [d.stage_value, d.is_active, d.review_status])).toEqual([
      ['IIA', true, 'verificado'],
      ['IIB', false, 'requiere_revision'],
    ]);
    expect(diagnosticos[0]).toMatchObject({ cancer_type: 'mama', grade: 'Nottingham grado 2' });
    expect(diagnosticos[0]?.icd10_code).not.toBeNull();
    expect(diagnosticos[1]?.conflicts_with_id).toBe(idSembrado(`${PACIENTE_CHAT}/diagnostico-iia`));
  });

  it('tiene HER2 2+ reemplazado por la corrección 3+ con supersedes_id, RE sin revisar y ni Ki-67 ni estado menopáusico', async () => {
    const biomarcadores = await filas<{
      name: string;
      value: string;
      review_status: string;
      supersedes_id: string | null;
    }>(
      `SELECT b.name, b.value, b.review_status::text AS review_status, b.supersedes_id
         FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1 ORDER BY b.value`,
    );
    const atributos = await filas<{ n: number }>(
      'SELECT count(*)::int AS n FROM clinical.clinical_attribute WHERE patient_id = $1',
    );

    expect(biomarcadores.map((b) => [b.name, b.value, b.review_status])).toEqual([
      ['HER2', '2+', 'reemplazado'],
      ['HER2', '3+', 'corregido'],
      ['RE', 'positivo', 'auto_aceptado'],
    ]);
    expect(biomarcadores[1]?.supersedes_id).toBe(idSembrado(`${PACIENTE_CHAT}/her2-2mas`));
    expect(biomarcadores.some((b) => b.name === 'Ki-67')).toBe(false);
    expect(atributos[0]?.n).toBe(0);
  });

  it('tiene la historia clínica completada, el examen con error y ningún examen completado', async () => {
    const documentos = await filas<{ document_type: string; ocr_status: string }>(
      `SELECT document_type::text AS document_type, ocr_status::text AS ocr_status
         FROM clinical.document WHERE patient_id = $1 ORDER BY document_type`,
    );

    expect(documentos.map((d) => [d.document_type, d.ocr_status])).toEqual([
      ['examen', 'error'],
      ['historia_clinica', 'completado'],
    ]);
  });

  it('tiene la línea 1 de quimioterapia neoadyuvante, la cirugía y una nota con el nombre y el documento sintéticos', async () => {
    const [linea] = await filas<{ regimen_name: string; line_number: number; ongoing: boolean }>(
      'SELECT regimen_name, line_number, ongoing FROM clinical.prior_treatment WHERE patient_id = $1',
    );
    const [evento] = await filas<{ description: string }>(
      'SELECT description FROM clinical.clinical_event WHERE patient_id = $1',
    );
    const [nota] = await filas<{ content: string }>(
      'SELECT content FROM clinical.clinical_note WHERE patient_id = $1',
    );

    expect(linea).toMatchObject({
      regimen_name: 'quimioterapia neoadyuvante',
      line_number: 1,
      ongoing: false,
    });
    expect(evento?.description).toBe('cirugía conservadora');
    expect(nota?.content).toContain(NOMBRE_SINTETICO_CHAT);
    expect(nota?.content).toContain(DOCUMENTO_SINTETICO_CHAT);
  });

  it('guarda la identidad sintética cifrada y descifrable, sin el nombre ni el documento en claro', async () => {
    const [fila] = await filas<{ texto: string }>(
      'SELECT patient_identity::text AS texto FROM identity.patient_identity WHERE patient_id = $1',
    );
    const servicio = servicioDesdeEntorno({
      env: entornoDeClaves(archivos.claves, 1),
      db: cliente,
    });

    const identidad = await servicio.descifrar(pacienteId);

    expect(identidad).toMatchObject({
      nombreCompleto: NOMBRE_SINTETICO_CHAT,
      numeroDeDocumento: DOCUMENTO_SINTETICO_CHAT,
    });
    expect(fila?.texto).not.toContain(NOMBRE_SINTETICO_CHAT);
    expect(fila?.texto).not.toContain(DOCUMENTO_SINTETICO_CHAT);
  });
});
