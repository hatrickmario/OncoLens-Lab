import type { Client } from 'pg';

/**
 * Builders de filas SINTÉTICAS para la integración del esquema (RN-13, RN-14): ningún dato real, bytes y HMAC fijos de
 * prueba. Los ids vienen de un generador inyectado y el reloj está congelado, para que cada test sea determinista.
 */

export const INSTANTE_FIJO = '2026-10-16T12:00:00.000Z';
export const FECHA_FIJA = '2026-10-16';

export type Fila = Record<string, unknown>;
export type GeneradorDeIds = () => string;

/**
 * UUID con forma de v4, determinista (sin `uuid()` ni `Math.random()`). El `espacio` (un entero por archivo de test)
 * ocupa el primer grupo: los archivos corren en paralelo sobre una sola base y no deben compartir PK ni valores únicos
 * derivados de los ids (email, nombre de rol, HMAC), que bloquearían o harían interbloquear sus transacciones.
 */
export function generadorDeIds(espacio: number): GeneradorDeIds {
  let n = 0;
  const prefijo = espacio.toString(16).padStart(8, '0');
  return () => `${prefijo}-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

export function sqlInsertar(tabla: string, fila: Fila): { sql: string; valores: unknown[] } {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map((_, i) => `$${i + 1}`);
  return { sql: `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores.join(', ')})`, valores: Object.values(fila) };
}

/** Inserta una fila y devuelve la fila insertada. Los valores jsonb se pasan ya serializados (JSON.stringify). */
export async function insertar(cliente: Client, tabla: string, fila: Fila): Promise<Fila> {
  const { sql, valores } = sqlInsertar(tabla, fila);
  const resultado = await cliente.query(`${sql} RETURNING *`, valores);
  return resultado.rows[0] as Fila;
}

export function filaDeUsuario(ids: GeneradorDeIds, roleId: string, resto: Fila = {}): Fila {
  const id = ids();
  return {
    id,
    email: `doctor-${id}@example.invalid`,
    password_hash: 'hash-sintetico-no-real',
    full_name: 'Doctor Sintetico',
    role_id: roleId,
    account_status: 'activo',
    failed_login_count: 0,
    created_at: INSTANTE_FIJO,
    updated_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDePaciente(ids: GeneradorDeIds, resto: Fila = {}): Fila {
  return {
    id: ids(),
    data_origin: 'sintetico',
    source_dataset: 'seed-sintetico',
    birth_year: 1960,
    sex: 'masculino',
    population: 'adulto',
    lifecycle_status: 'activo',
    retention_start: FECHA_FIJA,
    retention_until: '2036-10-16',
    retention_max: '2046-10-16',
    requires_ratification: false,
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDeIdentidad(patientId: string, resto: Fila = {}): Fila {
  return {
    patient_id: patientId,
    id_type: 'sintetico',
    issuing_country: null,
    national_id_ciphertext: Buffer.from('cifrado-sintetico-01'),
    national_id_hmac: `hmac-sintetico-${patientId}`,
    full_name_ciphertext: Buffer.from('nombre-cifrado-sintetico'),
    key_version: 1,
    ...resto,
  };
}

export function filaDeEpisodio(ids: GeneradorDeIds, patientId: string, openedBy: string, resto: Fila = {}): Fila {
  return { id: ids(), patient_id: patientId, opened_at: INSTANTE_FIJO, opened_by: openedBy, ...resto };
}

export function filaDeDiagnostico(ids: GeneradorDeIds, patientId: string, episodeId: string, resto: Fila = {}): Fila {
  return {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    entry_method: 'seed',
    cancer_type: 'prostata',
    mapping_status: 'mapeado',
    histology: 'adenocarcinoma',
    diagnosed_at: FECHA_FIJA,
    is_active: true,
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDeGradacionGleason(ids: GeneradorDeIds, diagnosisId: string, resto: Fila = {}): Fila {
  return {
    id: ids(),
    diagnosis_id: diagnosisId,
    grading_system: 'gleason_isup',
    specimen_type: 'biopsia',
    grade_scope: 'peor',
    gleason_primary_pattern: 4,
    gleason_secondary_pattern: 3,
    gleason_score: 7,
    isup_grade_group: 3,
    is_reference: false,
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDeGradacionNottingham(ids: GeneradorDeIds, diagnosisId: string, resto: Fila = {}): Fila {
  return {
    ...filaDeGradacionGleason(ids, diagnosisId),
    grading_system: 'nottingham',
    specimen_type: null,
    grade_scope: null,
    gleason_primary_pattern: null,
    gleason_secondary_pattern: null,
    gleason_score: null,
    isup_grade_group: null,
    nottingham_grade: 2,
    ...resto,
  };
}

export function filaDeMiembroDeEquipo(ids: GeneradorDeIds, patientId: string, doctorId: string, resto: Fila = {}): Fila {
  return {
    id: ids(),
    patient_id: patientId,
    doctor_id: doctorId,
    care_role: 'oncologo',
    is_primary: false,
    is_active: true,
    assigned_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDeSeguimiento(ids: GeneradorDeIds, analysisId: string, resto: Fila = {}): Fila {
  return {
    id: ids(),
    analysis_id: analysisId,
    turn_number: 1,
    question_text: 'pregunta sintética',
    status: 'sin_evidencia',
    answer: JSON.stringify([]),
    cited_sources: JSON.stringify([]),
    patient_data_links: JSON.stringify({}),
    data_classification: 'sintetico',
    llm_provider: 'local',
    llm_model: 'modelo-fingido',
    nli_model: 'nli-fingido',
    prompt_version: 'prompt-v0',
    catalog_version: 'catalogo-v0',
    trace_id: 'traza-sintetica-seguimiento',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

export function filaDeAnalisis(ids: GeneradorDeIds, patientId: string, episodeId: string, requestedBy: string, resto: Fila = {}): Fila {
  const vacioObj = JSON.stringify({});
  const vacioLista = JSON.stringify([]);
  return {
    id: ids(),
    patient_id: patientId,
    episode_id: episodeId,
    requested_by: requestedBy,
    analysis_type: 'analisis_evidencia',
    trace_id: 'traza-sintetica-0001',
    query_language: 'es',
    response_language: 'es',
    sources_selected: vacioLista,
    filters_applied: vacioObj,
    synthesis: vacioObj,
    applicability: vacioObj,
    evidence_options: vacioLista,
    discarded_options: vacioLista,
    analysis_basis: vacioObj,
    agent_steps: vacioLista,
    omitted_claims: 0,
    missing_critical_data: vacioLista,
    continued_with_warning: false,
    patient_data_links: vacioObj,
    status: 'sin_evidencia',
    clinical_context_snapshot: vacioObj,
    context_fingerprint: 'huella-sintetica',
    data_classification: 'sintetico',
    llm_provider: 'local',
    llm_model: 'modelo-fingido',
    embedding_model: 'embeddings-fingidos',
    reranker_model: 'reranker-fingido',
    nli_model: 'nli-fingido',
    prompt_version: 'prompt-v0',
    corpus_release: 'corpus-sintetico',
    catalog_version: 'catalogo-v0',
    retrieval_params: vacioObj,
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

/** Rol, usuario, paciente y episodio sintéticos: lo mínimo que cuelga casi toda fila clínica. */
export async function insertarContextoClinico(cliente: Client, ids: GeneradorDeIds): Promise<{
  roleId: string;
  userId: string;
  patientId: string;
  episodeId: string;
}> {
  const rolId = ids();
  const rol = await insertar(cliente, 'auth.role', { id: rolId, name: `rol-${rolId}`, description: 'Rol sintético de prueba' });
  const usuario = await insertar(cliente, 'auth."user"', filaDeUsuario(ids, rol.id as string));
  const paciente = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
  const episodio = await insertar(cliente, 'clinical.care_episode', filaDeEpisodio(ids, paciente.id as string, usuario.id as string));
  return { roleId: rol.id as string, userId: usuario.id as string, patientId: paciente.id as string, episodeId: episodio.id as string };
}
