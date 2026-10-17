import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Client } from 'pg';
import { tablasAusentes, tablasDelCatalogo } from '../../support/catalogo.js';
import { conectar, ejecutarPrisma } from '../../support/db.js';

// Lista LITERAL de la tabla de schemas de docs/architecture/data-model.md §1 (design D5): no se deriva del código.
const TABLAS_DEL_MODELO = [
  'auth.user',
  'auth.role',
  'auth.permission',
  'auth.role_permission',
  'auth.session',
  'identity.patient_identity',
  'identity.legal_representative',
  'clinical.patient',
  'clinical.care_episode',
  'clinical.care_team_member',
  'clinical.patient_opt_out',
  'clinical.intake_draft',
  'clinical.diagnosis',
  'clinical.diagnosis_grading',
  'clinical.clinical_note',
  'clinical.exam',
  'clinical.biomarker',
  'clinical.document',
  'clinical.treatment',
  'clinical.prior_treatment',
  'clinical.clinical_event',
  'clinical.clinical_attribute',
  'clinical.clinical_data_source',
  'clinical.ai_analysis_record',
  'clinical.analysis_follow_up',
  'clinical.analysis_feedback',
  'clinical.research_subject_map',
  'audit.audit_log',
  'research.episode_snapshot',
];

describe('Migración inicial init_full_schema', () => {
  let cliente: Client;
  const urlBase = inject('urlBaseDeTest');

  beforeAll(async () => {
    cliente = await conectar(urlBase);
  });
  afterAll(async () => {
    await cliente.end();
  });

  it('crea los cinco schemas con las 29 tablas del modelo cuando se aplica sobre una base vacía [US-038 AC-1]', async () => {
    const reales = await tablasDelCatalogo(cliente);

    expect(tablasAusentes(TABLAS_DEL_MODELO, reales)).toEqual([]);
    expect(reales).toEqual([...TABLAS_DEL_MODELO].sort());
    expect(TABLAS_DEL_MODELO).toHaveLength(29);
  });

  it('crea el schema corpus vacío y sin tablas de Prisma cuando se aplica la migración [US-038 AC-1]', async () => {
    const schema = await cliente.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'corpus'`,
    );
    const tablas = await cliente.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'corpus'`,
    );

    expect(schema.rowCount).toBe(1);
    expect(tablas.rowCount).toBe(0);
  });

  it('no aplica nada y no deja diferencias con schema.prisma cuando se reaplica la migración [US-038 AC-1]', () => {
    const redeploy = ejecutarPrisma(urlBase, ['migrate', 'deploy']);
    const diferencias = ejecutarPrisma(urlBase, [
      'migrate',
      'diff',
      '--from-config-datasource',
      '--to-schema',
      'prisma/schema.prisma',
      '--exit-code',
    ]);

    expect(redeploy.codigo).toBe(0);
    expect(redeploy.salida).toContain('No pending migrations to apply');
    expect(diferencias.salida).toContain('No difference detected');
    expect(diferencias.codigo).toBe(0);
  });

  it('no existe patient_consent en ningún schema cuando la migración está aplicada [US-038 AC-2]', async () => {
    const resultado = await cliente.query(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = 'patient_consent'`,
    );

    expect(resultado.rows).toEqual([]);
  });
});
