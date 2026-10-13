/**
 * AC-5, AC-6, AC-12 y AC-13 (datos), AC-15, AC-18 [Pre-S1 resp. 29]: chequeos simples de texto sobre
 * docs/architecture/data-model.md (fuente única del modelo) y sobre readme §3.1 (solo enlaza). La revisión documental
 * completa la hace el PR; esta regla impide que se pierdan las decisiones congeladas.
 */
import { reporter } from '../lib/findings.mjs';
import { cellText, codeBlocks, sectionOf, tableRows } from '../lib/markdown.mjs';
import { PATHS } from '../lib/paths.mjs';
import { permissionMatrix } from '../lib/permissions.mjs';
import { LICENSE_CLASSES } from '../lib/specs.mjs';
import { missingFragments } from '../lib/text.mjs';

const RULE = 'assertDataModelDocument';
const MODEL_FILE = PATHS.dataModel;
const README_FILE = PATHS.readme;

/** Todas las tablas del modelo (readme §3.1 más las de US-033). */
export const EXPECTED_TABLES = [
  'auth.user', 'auth.role', 'auth.permission', 'auth.role_permission', 'auth.session',
  'identity.patient_identity', 'identity.legal_representative',
  'clinical.patient', 'clinical.care_episode', 'clinical.care_team_member', 'clinical.patient_opt_out',
  'clinical.intake_draft', 'clinical.diagnosis', 'clinical.diagnosis_grading', 'clinical.clinical_note',
  'clinical.exam', 'clinical.biomarker', 'clinical.document', 'clinical.treatment', 'clinical.prior_treatment',
  'clinical.clinical_event', 'clinical.clinical_attribute', 'clinical.clinical_data_source',
  'clinical.ai_analysis_record', 'clinical.analysis_follow_up', 'clinical.analysis_feedback',
  'clinical.research_subject_map', 'audit.audit_log', 'research.episode_snapshot',
  'corpus.corpus_document', 'corpus.corpus_release', 'corpus.corpus_release_document', 'milvus.corpus_chunk',
];

const DIAGNOSIS_COLUMNS = ['staging_system', 'stage_value', 'histology', 'histology_code', 'grade'];
const GRADING_COLUMNS = [
  'grading_system', 'specimen_type', 'grade_scope', 'gleason_primary_pattern', 'gleason_secondary_pattern',
  'gleason_score', 'isup_grade_group', 'nottingham_grade', 'is_reference', 'entry_method', 'review_status',
];
const GRADING_TEXT = ['CHECK por sistema', 'gleason_isup', 'nottingham', 'gleason_score = gleason_primary_pattern + gleason_secondary_pattern', 'prostatectomía', 'global'];
const CANONICAL_GRADES = ['Gleason 4+3=7 · ISUP 3', 'Nottingham grado 2'];
const FOLLOW_UP_COLUMNS = [
  'analysis_id', 'turn_number', 'question_text', 'status', 'answer', 'cited_sources', 'omitted_claims',
  'patient_data_links', 'llm_model', 'embedding_model', 'reranker_model', 'nli_model', 'prompt_version',
  'catalog_version', 'trace_id', 'created_at',
];
const MILVUS_COLUMNS = ['dense_vector', 'sparse_vector', 'source_type', 'language', 'cancer_type_tags', 'population', 'study_design', 'published_year', 'is_current'];
const ACCOUNT_STATUSES = ['pendiente', 'activo', 'desactivado', 'rechazado'];
const CLINICAL_SCHEMAS = ['auth', 'identity', 'clinical', 'audit', 'research'];
const MIN_MARKS = 8;

/** La matriz esperada: código → [doctor, admin]. */
const EXPECTED_MATRIX = {
  'session:logout': ['sí', 'sí'],
  'accounts:manage': ['no', 'sí'],
  'patients:create': ['sí', 'sí'],
  'patients:lookup': ['sí', 'sí'],
  'opt_outs:write': ['no', 'sí'],
  'clinical:read': ['sí', 'no'],
  'clinical:write': ['sí', 'no'],
  'documents:read': ['sí', 'no'],
  'documents:upload': ['sí', 'no'],
  'intake_drafts:read': ['sí', 'no'],
  'intake_drafts:write': ['sí', 'no'],
  'ai_analysis:create': ['sí', 'no'],
  'ai_analysis:read': ['sí', 'no'],
  'follow_ups:create': ['sí', 'no'],
  'follow_ups:read': ['sí', 'no'],
  'case_summary:create': ['sí', 'no'],
  'case_summary:read': ['sí', 'no'],
  'audit:read_patient': ['no', 'no'],
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Sección de la tabla `schema.table` (encabezado de nivel 4). */
const tableSection = (model, name) => sectionOf(model, new RegExp(`^####\\s+\`${escapeRegExp(name)}\`\\s*$`));
/** Nombres de columna de una sección de tabla. */
const columnsOf = (section) => tableRows(section ?? '').slice(1).map((cells) => cellText(cells[0] ?? ''));
/** La nota de una columna de la tabla. */
const noteOf = (section, column) => tableRows(section ?? '').find((cells) => cellText(cells[0]) === column)?.[3] ?? '';

/** Hallazgos por las frases que `text` no contiene. */
const requireText = (report, text, fragments, path, what) =>
  missingFragments(text, fragments).map((fragment) => report(MODEL_FILE, path, `${what} debe decir "${fragment}"`));

/** Hallazgos por las columnas de `expected` que la tabla no declara. */
const requireColumns = (report, model, table, expected) =>
  expected.filter((name) => !columnsOf(tableSection(model, table)).includes(name)).map((name) => report(MODEL_FILE, `#### ${table}`, `${table} debe declarar ${name}`));

function checkTables(model) {
  const report = reporter(RULE, 'AC-5');
  const missing = EXPECTED_TABLES.filter((name) => !tableSection(model, name)).map((name) => report(MODEL_FILE, `#### ${name}`, `falta la tabla ${name} del modelo`));
  const diagrams = codeBlocks(model, 'mermaid').filter((block) => block.startsWith('erDiagram'));
  const found = [...missing];
  if (diagrams.length < 2) found.push(report(MODEL_FILE, '## 2 y 3', 'el documento debe contener los dos diagramas del modelo (clínico y corpus)'));
  if (!diagrams.some((block) => block.includes('DIAGNOSIS_GRADING'))) found.push(report(MODEL_FILE, '## 2', 'el diagrama clínico debe incluir DIAGNOSIS_GRADING'));
  return found;
}

function checkDiagnosis(model) {
  const report = reporter(RULE, 'AC-5');
  const gradingSection = sectionOf(model, /^##\s+\d+\.\s+Gradación del diagnóstico/);
  return [
    ...requireColumns(report, model, 'clinical.diagnosis', DIAGNOSIS_COLUMNS),
    ...requireColumns(report, model, 'clinical.diagnosis_grading', GRADING_COLUMNS),
    ...requireText(report, gradingSection, GRADING_TEXT, '## 6', 'la sección de gradación'),
    ...requireText(report, model, CANONICAL_GRADES, '## 6', 'el documento'),
  ];
}

function checkReadme(readme) {
  const report = reporter(RULE, 'AC-5 · AC-18');
  const section = sectionOf(readme ?? '', /^###\s+\*\*3\.1\./) ?? '';
  const found = [];
  if (!section.includes('docs/architecture/data-model.md')) found.push(report(README_FILE, '### 3.1', 'readme §3.1 debe enlazar a docs/architecture/data-model.md'));
  if (/```(mermaid|sql)/.test(section)) found.push(report(README_FILE, '### 3.1', 'readme §3.1 no contiene diagramas ni DDL del modelo: la fuente única es data-model.md'));
  return found;
}

function checkMarks(model) {
  const report = reporter(RULE, 'AC-5');
  const marks = (model.match(/vacío resuelto \(US-033\)/g) ?? []).length;
  return marks >= MIN_MARKS ? [] : [report(MODEL_FILE, '## 10', 'cada diferencia respecto del readme debe llevar la marca "vacío resuelto (US-033)" y su origen')];
}

function checkMilvus(model) {
  const report = reporter(RULE, 'AC-6');
  const chunk = tableSection(model, 'milvus.corpus_chunk');
  const found = requireColumns(report, model, 'milvus.corpus_chunk', MILVUS_COLUMNS);
  if (!noteOf(chunk, 'dense_vector').includes('EMBEDDING_DIM')) found.push(report(MODEL_FILE, '#### milvus.corpus_chunk', 'dense_vector debe tener dimensión EMBEDDING_DIM'));
  const literal = model.split('\n').find((line) => /dense_vector|EMBEDDING_DIM/.test(line) && /(?<![-\w])\d{3,5}(?!\w)/.test(line));
  if (literal) found.push(report(MODEL_FILE, '#### milvus.corpus_chunk', `la dimensión del vector no lleva un valor fijo (EMBEDDING_DIM): ${literal.trim().slice(0, 80)}`));
  return [...found, ...requireText(report, model, ['ADR-39', 'US-058'], '## 4.7', 'el documento')];
}

function checkLicense(model) {
  const report = reporter(RULE, 'AC-12');
  const notes = noteOf(tableSection(model, 'corpus.corpus_document'), 'license_class');
  const found = LICENSE_CLASSES.filter((value) => !notes.includes(value)).map((value) => report(MODEL_FILE, '#### corpus.corpus_document', `license_class debe incluir ${value}`));
  return [...found, ...requireText(report, model, ['CORPUS_ACCEPTED_LICENSES'], '#### corpus.corpus_document', 'la licencia del corpus')];
}

function checkFollowUp(model) {
  const report = reporter(RULE, 'AC-13');
  const section = tableSection(model, 'clinical.analysis_follow_up') ?? '';
  const found = requireColumns(report, model, 'clinical.analysis_follow_up', FOLLOW_UP_COLUMNS);
  if (columnsOf(section).some((name) => /pseudo_?patient_?id/i.test(name))) found.push(report(MODEL_FILE, '#### clinical.analysis_follow_up', 'analysis_follow_up no guarda pseudoPatientId ni identidad (RN-10)'));
  const detail = sectionOf(model, /^##\s+\d+\.\s+Preguntas de seguimiento/) ?? '';
  const phrases = ['sin pseudoPatientId ni identidad', 'enmascarado si tenía PII', 'UNIQUE (analysis_id, turn_number)'];
  return [...found, ...requireText(report, `${detail}\n${section}`, phrases, '## 7', 'la tabla de seguimiento')];
}

function checkAccountStatus(model) {
  const report = reporter(RULE, 'AC-15');
  const user = tableSection(model, 'auth.user');
  const found = [];
  if (columnsOf(user).includes('is_active')) found.push(report(MODEL_FILE, '#### auth.user', 'auth.user no tiene is_active: lo reemplaza account_status'));
  const status = noteOf(user, 'account_status');
  for (const value of ACCOUNT_STATUSES.filter((name) => !status.includes(name))) found.push(report(MODEL_FILE, '#### auth.user', `account_status debe incluir ${value}`));
  const accounts = sectionOf(model, /^###\s+4\.1\s/) ?? '';
  return [...found, ...requireText(report, accounts, ['`pendiente` y `rechazado` no inician sesión', 'revoca las sesiones vivas'], '### 4.1', 'la descripción de account_status')];
}

function checkMatrix(model) {
  const report = reporter(RULE, 'AC-15');
  const rows = permissionMatrix(model);
  const found = [];
  for (const [code, [doctor, admin]] of Object.entries(EXPECTED_MATRIX)) {
    const row = rows.find((candidate) => candidate.code === code);
    if (!row) found.push(report(MODEL_FILE, '## 8', `falta el código ${code} en la matriz de permisos`));
    else if (row.doctor !== doctor || row.admin !== admin) found.push(report(MODEL_FILE, '## 8', `${code} debe ser ${doctor}/${admin} (doctor/admin) y es ${row.doctor}/${row.admin}`));
  }
  for (const row of rows.filter((candidate) => !(candidate.code in EXPECTED_MATRIX))) {
    found.push(report(MODEL_FILE, '## 8', `${row.code} no es un código de la matriz congelada (sin comodines ni permisos nuevos)`));
  }
  const matrix = sectionOf(model, /^##\s+\d+\.\s+Matriz de permisos/) ?? '';
  return [...found, ...requireText(report, matrix, ['solo ocurre por la CLI', 'se registra en `audit`'], '## 8', 'la matriz de permisos')];
}

function checkIsolation(model) {
  const report = reporter(RULE, 'AC-18');
  const section = sectionOf(model, /^##\s+\d+\.\s+Aislamiento del rol/) ?? '';
  const sql = codeBlocks(section, 'sql').join('\n');
  const found = [];
  if (!/GRANT USAGE ON SCHEMA corpus TO rag_corpus/.test(sql)) found.push(report(MODEL_FILE, '## 9', 'rag_corpus debe tener USAGE solo sobre corpus'));
  const revoked = sql.split('\n').filter((line) => /^REVOKE ALL ON SCHEMA/.test(line)).join(' ');
  for (const schema of CLINICAL_SCHEMAS.filter((name) => !new RegExp(`\\b${name}\\b`).test(revoked))) found.push(report(MODEL_FILE, '## 9', `falta REVOKE ALL sobre el schema ${schema}`));
  if (!/^ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones>/m.test(sql)) found.push(report(MODEL_FILE, '## 9', 'falta ALTER DEFAULT PRIVILEGES FOR ROLE <rol de migraciones> (cubre las tablas nuevas)'));
  if (!/REVOKE ALL ON SCHEMA public FROM PUBLIC/.test(sql)) found.push(report(MODEL_FILE, '## 9', 'falta REVOKE ALL ON SCHEMA public FROM PUBLIC'));
  const hba = codeBlocks(section, 'conf').join('\n');
  if (!/^hostssl\s+.*\brag_corpus\b.*corpus-db-net/m.test(hba)) found.push(report(MODEL_FILE, '## 9', 'falta la regla de pg_hba que solo admite rag_corpus desde corpus-db-net'));
  return [...found, ...requireText(report, section, ['clinical.diagnosis_grading', 'clinical.analysis_follow_up', 'clinical-minio'], '## 9', 'el aislamiento')];
}

export function assertDataModelDocument(specs, examples, docs) {
  const model = docs.dataModel?.text;
  if (!model) return [reporter(RULE, 'AC-5')(MODEL_FILE, '#', 'el documento del modelo no existe o está vacío')];
  return [
    ...checkTables(model),
    ...checkDiagnosis(model),
    ...checkReadme(docs.readme?.text),
    ...checkMarks(model),
    ...checkMilvus(model),
    ...checkLicense(model),
    ...checkFollowUp(model),
    ...checkAccountStatus(model),
    ...checkMatrix(model),
    ...checkIsolation(model),
  ];
}
