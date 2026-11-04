import type { Clock } from '../../src/infrastructure/clock.js';
import type { PasswordHasher } from '../../src/modules/auth/password-hasher.js';
import { resolverCodigoDelCatalogo, type CatalogoClinico } from './catalogo.js';
import { idSembrado } from './determinismo.js';
import { columnasDeGradacion } from './columnas-de-gradacion.js';
import { derivarTextoGrade } from './grade.js';
import { identidadSinteticaDe } from './identidades.js';
import { PACIENTES_SEMILLA } from './pacientes/indice.js';
import type {
  BiomarcadorSemilla,
  DiagnosticoSemilla,
  ExamenSemilla,
  GradacionSemilla,
  PacienteSemilla,
  TratamientoPreviaSemilla,
} from './pacientes/tipos.js';
import type { ClavesDeIdentidad } from '../../src/infrastructure/crypto/claves-de-identidad.js';
import type { RolDeUsuario } from '../../src/modules/auth/auth.repository.js';
import { crearServicioDeIdentidad } from '../../src/modules/patients/identity.module.js';
import type { IdentityService } from '../../src/modules/patients/identity.service.js';
import { DESCRIPCION_DE_ROL, MATRIZ_DE_PERMISOS } from './roles.js';

/** Lo mínimo que el seed necesita de PostgreSQL: `pg.Client`/`PoolClient` cumplen, y el test pasa el cliente real. */
export interface ClienteSql {
  query(sql: string, valores?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/**
 * Conexión de escritura del seed. La atomicidad es de la conexión, no de quien siembra: `enTransaccion` abre la
 * transacción, confirma si `fn` termina y revierte todo si falla; `fn` recibe solo la sesión de dentro.
 */
export interface ConexionDelSeed {
  enTransaccion<T>(fn: (sesion: ClienteSql) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

export interface CredencialesDelSeed {
  readonly doctor: string;
  readonly admin: string;
}

export interface PoliticaDeRetencion {
  readonly anosHastaRetencion: number;
  readonly anosHastaRetencionMaxima: number;
}

export interface EntradasDelSeed {
  readonly catalogo: CatalogoClinico;
  readonly reloj: Clock;
  readonly hasher: PasswordHasher;
  readonly credenciales: CredencialesDelSeed;
  readonly retencion: PoliticaDeRetencion;
  /** Claves de la identidad cifrada (US-046): se leen DESPUÉS de la guarda de entorno (RN-13). */
  readonly claves: ClavesDeIdentidad;
}

/** Filas escritas por tabla (los logs del seed solo llevan conteos, nunca valores). */
export type FilasUpsertadas = Readonly<Record<string, number>>;

const REFERENCIA_DE_CONVENIO = 'CONV-SEED-01';
const ORIGEN_DEL_DATASET = 'seed';
/** `reason_code` es NOT NULL y el catálogo de motivos (TBD-21) no existe: código sintético fijo, no clínico. */
const MOTIVO_SINTETICO_DE_OPT_OUT = 'opt_out_sintetico';

type Fila = Record<string, unknown>;

/** Contexto de una siembra: la conexión, el instante del reloj y el conteo de filas escritas por tabla. */
interface Siembra {
  readonly db: ClienteSql;
  readonly entradas: EntradasDelSeed;
  readonly ahora: Date;
  readonly escritas: Record<string, number>;
  readonly identidad: IdentityService;
}

/** Fecha AAAA-MM-DD, `dias` antes (o después, si es negativo) del instante dado. */
function fechaRelativa(instante: Date, dias: number): string {
  const fecha = new Date(instante);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function sumarAnos(fechaIso: string, anos: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
  fecha.setUTCFullYear(fecha.getUTCFullYear() + anos);
  return fecha.toISOString().slice(0, 10);
}

/** INSERT ... ON CONFLICT (id) DO UPDATE: re-ejecutar el seed converge a los mismos datos sin duplicar. */
async function upsertar(siembra: Siembra, tabla: string, fila: Fila): Promise<void> {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map((_, indice) => `$${indice + 1}`);
  const actualizables = columnas
    .filter((columna) => columna !== 'id')
    .map((columna) => `${columna} = EXCLUDED.${columna}`);
  await siembra.db.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${actualizables.join(', ')}`,
    Object.values(fila),
  );
  contarFilaEscrita(siembra, tabla);
}

/**
 * INSERT ... ON CONFLICT (id) DO NOTHING: para los datos que el oncólogo puede corregir (US-253). Re-ejecutar el seed no
 * debe revivir una nota ya reemplazada ni pisar su versión corregida; el conteo es el de filas aseguradas.
 */
async function insertarSiFalta(siembra: Siembra, tabla: string, fila: Fila): Promise<void> {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map((_, indice) => `$${indice + 1}`);
  await siembra.db.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcadores.join(', ')}) ON CONFLICT (id) DO NOTHING`,
    Object.values(fila),
  );
  contarFilaEscrita(siembra, tabla);
}

/** Los logs del seed solo llevan conteos por tabla (nunca valores). */
function contarFilaEscrita(siembra: Siembra, tabla: string): void {
  siembra.escritas[tabla] = (siembra.escritas[tabla] ?? 0) + 1;
}

async function devolverId(siembra: Siembra, sql: string, valores: unknown[]): Promise<string> {
  const { rows } = await siembra.db.query(sql, valores);
  return (rows[0] as { id: string }).id;
}

/** Roles y permisos de la matriz RBAC: se identifican por nombre/código, no por el id (puede existir de antes). */
async function asegurarRolesYPermisos(siembra: Siembra): Promise<Record<RolDeUsuario, string>> {
  const roles = {} as Record<RolDeUsuario, string>;
  for (const nombre of Object.keys(DESCRIPCION_DE_ROL) as RolDeUsuario[]) {
    roles[nombre] = await devolverId(
      siembra,
      `INSERT INTO auth.role (id, name, description) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
      [idSembrado(`rol/${nombre}`), nombre, DESCRIPCION_DE_ROL[nombre]],
    );
  }
  for (const permiso of MATRIZ_DE_PERMISOS) {
    const permisoId = await devolverId(
      siembra,
      `INSERT INTO auth.permission (id, code, description) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description RETURNING id`,
      [idSembrado(`permiso/${permiso.codigo}`), permiso.codigo, permiso.descripcion],
    );
    for (const rol of permiso.roles) {
      await siembra.db.query(
        `INSERT INTO auth.role_permission (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [roles[rol], permisoId],
      );
    }
  }
  return roles;
}

interface UsuarioDeDemo {
  readonly clave: string;
  readonly correo: string;
  readonly nombre: string;
  readonly rol: RolDeUsuario;
  readonly contrasena: string;
}

/** El hash se calcula SOLO si el usuario no existe: re-ejecutar no cambia `password_hash` (idempotencia). */
async function asegurarUsuario(
  siembra: Siembra,
  roles: Record<RolDeUsuario, string>,
  usuario: UsuarioDeDemo,
): Promise<string> {
  const existente = await siembra.db.query('SELECT id FROM auth."user" WHERE email = $1', [
    usuario.correo,
  ]);
  if (existente.rows.length > 0) return (existente.rows[0] as { id: string }).id;
  const id = idSembrado(`usuario/${usuario.clave}`);
  await upsertar(siembra, 'auth."user"', {
    id,
    email: usuario.correo,
    password_hash: await siembra.entradas.hasher.hash(usuario.contrasena),
    full_name: usuario.nombre,
    role_id: roles[usuario.rol],
    account_status: 'activo',
    failed_login_count: 0,
    locked_until: null,
    created_at: siembra.ahora,
    updated_at: siembra.ahora,
  });
  return id;
}

/** Procedencia común de todo dato sembrado: `entry_method = seed`, verificado, sin confianza de extracción. */
const PROCEDENCIA_DEL_SEED = {
  entry_method: 'seed',
  extraction_confidence: 'n_a',
  review_status: 'verificado',
} as const;

interface ContextoDePaciente {
  readonly paciente: PacienteSemilla;
  readonly pacienteId: string;
  readonly episodioId: string;
  readonly doctorId: string;
  readonly adminId: string;
}

async function sembrarDiagnostico(
  siembra: Siembra,
  contexto: ContextoDePaciente,
  diagnostico: DiagnosticoSemilla,
): Promise<void> {
  const diagnosticoId = idSembrado(`${contexto.paciente.clave}/${diagnostico.clave}`);
  const { gradacion } = diagnostico;
  const cie10 = resolverCodigoDelCatalogo(
    siembra.entradas.catalogo,
    'cie10',
    diagnostico.cancerType,
  );
  await upsertar(siembra, 'clinical.diagnosis', {
    id: diagnosticoId,
    patient_id: contexto.pacienteId,
    episode_id: contexto.episodioId,
    source_document_id: null,
    entry_method: PROCEDENCIA_DEL_SEED.entry_method,
    cancer_type: diagnostico.cancerType,
    icd10_code: cie10.codigo,
    mapping_status: cie10.mappingStatus,
    histology: diagnostico.histology,
    histology_code: null,
    grade: gradacion === undefined ? null : derivarTextoGrade(gradacion),
    staging_system: diagnostico.stagingSystem,
    stage_value: diagnostico.stageValue,
    performance_scale: diagnostico.performanceScale,
    performance_value: diagnostico.performanceValue,
    diagnosed_at: fechaRelativa(siembra.ahora, diagnostico.diasDesdeElDiagnostico),
    is_active: diagnostico.activo,
    extraction_score: null,
    extraction_confidence: PROCEDENCIA_DEL_SEED.extraction_confidence,
    review_status: PROCEDENCIA_DEL_SEED.review_status,
    conflicts_with_id: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: siembra.ahora,
  });
  if (gradacion !== undefined) {
    await sembrarGradacionDeReferencia(
      siembra,
      diagnosticoId,
      `${contexto.paciente.clave}/${diagnostico.clave}`,
      gradacion,
    );
  }
}

async function sembrarGradacionDeReferencia(
  siembra: Siembra,
  diagnosticoId: string,
  claveDelDiagnostico: string,
  gradacion: GradacionSemilla,
): Promise<void> {
  await upsertar(siembra, 'clinical.diagnosis_grading', {
    id: idSembrado(`${claveDelDiagnostico}/gradacion`),
    diagnosis_id: diagnosticoId,
    ...columnasDeGradacion(gradacion),
    is_reference: true,
    source_document_id: null,
    ...PROCEDENCIA_DEL_SEED,
    extraction_score: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: siembra.ahora,
  });
}

/** Id sembrado de un biomarcador del examen por su `clave`: el mismo para su fila y para el conflicto que lo apunta. */
function idDelBiomarcador(
  contexto: ContextoDePaciente,
  examen: Pick<ExamenSemilla, 'clave'>,
  claveDelBiomarcador: string,
): string {
  return idSembrado(`${contexto.paciente.clave}/${examen.clave}/${claveDelBiomarcador}`);
}

/** `conflicts_with_id` del biomarcador (RN-08): el id sembrado del otro biomarcador con el que choca, o `null` sin conflicto. */
function idDelBiomarcadorEnConflicto(
  contexto: ContextoDePaciente,
  biomarcador: BiomarcadorSemilla,
): string | null {
  if (biomarcador.enConflictoCon === undefined) return null;
  const { examen: claveDelExamen, biomarcador: claveDelBiomarcador } = biomarcador.enConflictoCon;
  return idDelBiomarcador(contexto, { clave: claveDelExamen }, claveDelBiomarcador);
}

async function sembrarExamenes(siembra: Siembra, contexto: ContextoDePaciente): Promise<void> {
  for (const examen of contexto.paciente.examenes) {
    const examenId = idSembrado(`${contexto.paciente.clave}/${examen.clave}`);
    await upsertar(siembra, 'clinical.exam', {
      id: examenId,
      patient_id: contexto.pacienteId,
      episode_id: contexto.episodioId,
      source_document_id: null,
      exam_type: examen.tipo,
      source_lab: null,
      entry_method: PROCEDENCIA_DEL_SEED.entry_method,
      performed_at: fechaRelativa(siembra.ahora, examen.diasAntes),
      created_at: siembra.ahora,
    });
    for (const biomarcador of examen.biomarcadores) {
      const loinc = resolverCodigoDelCatalogo(
        siembra.entradas.catalogo,
        'loinc',
        biomarcador.nombre,
      );
      await upsertar(siembra, 'clinical.biomarker', {
        id: idDelBiomarcador(contexto, examen, biomarcador.clave),
        exam_id: examenId,
        name: biomarcador.nombre,
        original_name: biomarcador.nombre,
        loinc_code: loinc.codigo,
        mapping_status: loinc.mappingStatus,
        value: biomarcador.valor,
        unit: biomarcador.unidad,
        normalized_unit: biomarcador.unidad,
        reference_range: '',
        result_type: biomarcador.tipoResultado,
        clinical_significance: biomarcador.significadoClinico,
        significance_source: 'documento',
        extraction_score: null,
        extraction_confidence: PROCEDENCIA_DEL_SEED.extraction_confidence,
        review_status: biomarcador.estadoDeRevision ?? PROCEDENCIA_DEL_SEED.review_status,
        conflicts_with_id: idDelBiomarcadorEnConflicto(contexto, biomarcador),
        source_span: '{}',
        reviewed_by: null,
        reviewed_at: null,
        created_at: siembra.ahora,
      });
    }
  }
}

/**
 * Códigos ATC de un régimen (RN-27): cada fármaco se resuelve con el catálogo (sin `farmacos`, el nombre del régimen);
 * `atc_codes` lleva los que encuentra y el régimen solo queda `mapeado` si todos resuelven. Nunca un código escrito a mano.
 */
function resolverAtcDelRegimen(
  catalogo: CatalogoClinico,
  tratamiento: TratamientoPreviaSemilla,
): { codigos: string[]; mappingStatus: 'mapeado' | 'no_mapeado' } {
  const resueltos = (tratamiento.farmacos ?? [tratamiento.regimen]).map((farmaco) =>
    resolverCodigoDelCatalogo(catalogo, 'atc', farmaco),
  );
  return {
    codigos: resueltos.flatMap((resuelto) => (resuelto.codigo === null ? [] : [resuelto.codigo])),
    mappingStatus: resueltos.every((resuelto) => resuelto.mappingStatus === 'mapeado')
      ? 'mapeado'
      : 'no_mapeado',
  };
}

async function sembrarTratamientosPrevios(
  siembra: Siembra,
  contexto: ContextoDePaciente,
): Promise<void> {
  for (const tratamiento of contexto.paciente.tratamientosPrevios) {
    const atc = resolverAtcDelRegimen(siembra.entradas.catalogo, tratamiento);
    const { fin } = tratamiento;
    await upsertar(siembra, 'clinical.prior_treatment', {
      id: idSembrado(`${contexto.paciente.clave}/${tratamiento.clave}`),
      patient_id: contexto.pacienteId,
      episode_id: contexto.episodioId,
      source_document_id: null,
      line_number: tratamiento.numeroDeLinea,
      setting: tratamiento.setting,
      regimen_name: tratamiento.regimen,
      atc_codes: atc.codigos,
      cups_code: null,
      mapping_status: atc.mappingStatus,
      started_at: fechaRelativa(siembra.ahora, tratamiento.diasDesdeElInicio),
      ended_at: fin === undefined ? null : fechaRelativa(siembra.ahora, fin.diasAntes),
      ongoing: fin === undefined,
      end_reason: fin === undefined ? 'desconocido' : fin.motivo,
      best_response: null,
      ...PROCEDENCIA_DEL_SEED,
      source_span: null,
      created_at: siembra.ahora,
    });
  }
}

async function sembrarEventos(siembra: Siembra, contexto: ContextoDePaciente): Promise<void> {
  for (const evento of contexto.paciente.eventos) {
    await upsertar(siembra, 'clinical.clinical_event', {
      id: idSembrado(`${contexto.paciente.clave}/${evento.clave}`),
      patient_id: contexto.pacienteId,
      episode_id: contexto.episodioId,
      source_document_id: null,
      event_type: evento.tipo,
      event_date: fechaRelativa(siembra.ahora, evento.diasAntes),
      date_precision: 'dia',
      description: evento.descripcion,
      icd10_code: null,
      cups_code: null,
      mapping_status: 'n_a',
      toxicity_grade: null,
      prior_treatment_id:
        evento.cierraLinea === undefined
          ? null
          : idSembrado(`${contexto.paciente.clave}/${evento.cierraLinea}`),
      treatment_id: null,
      analysis_id: null,
      ...PROCEDENCIA_DEL_SEED,
      source_span: null,
      recorded_by: null,
      created_at: siembra.ahora,
    });
  }
}

async function sembrarAtributos(siembra: Siembra, contexto: ContextoDePaciente): Promise<void> {
  for (const atributo of contexto.paciente.atributos) {
    await upsertar(siembra, 'clinical.clinical_attribute', {
      id: idSembrado(`${contexto.paciente.clave}/${atributo.clave}`),
      patient_id: contexto.pacienteId,
      episode_id: contexto.episodioId,
      source_document_id: null,
      attribute_key: atributo.atributo,
      value: atributo.valor,
      observed_at: fechaRelativa(siembra.ahora, atributo.diasAntes),
      date_precision: 'dia',
      ...PROCEDENCIA_DEL_SEED,
      source_span: null,
      created_at: siembra.ahora,
    });
  }
}

async function sembrarNotas(siembra: Siembra, contexto: ContextoDePaciente): Promise<void> {
  for (const nota of contexto.paciente.notas ?? []) {
    // Una nota corregida por el oncólogo no se pisa al re-sembrar (a diferencia de los demás datos del seed).
    await insertarSiFalta(siembra, 'clinical.clinical_note', {
      id: idSembrado(`${contexto.paciente.clave}/${nota.clave}`),
      patient_id: contexto.pacienteId,
      episode_id: contexto.episodioId,
      source_document_id: null,
      created_by: contexto.doctorId,
      note_type: nota.tipo,
      content: nota.texto,
      recorded_at: fechaRelativa(siembra.ahora, nota.diasAntes),
      is_active: true,
      ...PROCEDENCIA_DEL_SEED,
      supersedes_id: null,
      created_at: siembra.ahora,
    });
  }
}

/** Identidad cifrada con `IdentityService` (no una copia del cifrador); si ya existe no se recifra. */
async function sembrarIdentidad(
  siembra: Siembra,
  pacienteId: string,
  ordinal: number,
): Promise<void> {
  const identidad = identidadSinteticaDe(pacienteId, ordinal);
  const resultado = await siembra.identidad.guardar(identidad);
  if (resultado === 'creada') {
    contarFilaEscrita(siembra, 'identity.patient_identity');
    return;
  }
  // Las filas de L1D-200 son anteriores a `full_name_hmac`: se completa sin recifrar nada (US-048, idempotente).
  if (await siembra.identidad.completarIndiceDeNombre(pacienteId, identidad.nombreCompleto)) {
    contarFilaEscrita(siembra, 'identity.patient_identity');
  }
}

async function sembrarPaciente(
  siembra: Siembra,
  paciente: PacienteSemilla,
  ordinal: number,
  usuarios: { doctorId: string; adminId: string },
): Promise<void> {
  const pacienteId = idSembrado(paciente.clave);
  const episodioId = idSembrado(`${paciente.clave}/episodio`);
  const inicio = fechaRelativa(siembra.ahora, 0);
  const { anosHastaRetencion, anosHastaRetencionMaxima } = siembra.entradas.retencion;
  await upsertar(siembra, 'clinical.patient', {
    id: pacienteId,
    data_origin: 'sintetico',
    source_dataset: ORIGEN_DEL_DATASET,
    agreement_reference: REFERENCIA_DE_CONVENIO,
    birth_year: paciente.anioDeNacimiento,
    sex: paciente.sexo,
    population: 'adulto',
    lifecycle_status: 'activo',
    retention_start: inicio,
    retention_until: sumarAnos(inicio, anosHastaRetencion),
    retention_max: sumarAnos(inicio, anosHastaRetencionMaxima),
    requires_ratification: false,
    created_at: siembra.ahora,
  });
  await upsertar(siembra, 'clinical.care_episode', {
    id: episodioId,
    patient_id: pacienteId,
    opened_at: siembra.ahora,
    closed_at: null,
    closure_reason: null,
    opened_by: usuarios.doctorId,
    closed_by: null,
  });
  await sembrarIdentidad(siembra, pacienteId, ordinal);
  const contexto: ContextoDePaciente = { paciente, pacienteId, episodioId, ...usuarios };
  for (const diagnostico of paciente.diagnosticos) {
    await sembrarDiagnostico(siembra, contexto, diagnostico);
  }
  await sembrarExamenes(siembra, contexto);
  await sembrarTratamientosPrevios(siembra, contexto);
  await sembrarEventos(siembra, contexto);
  await sembrarAtributos(siembra, contexto);
  await sembrarNotas(siembra, contexto);
  if (paciente.optOutAnalisisIa !== undefined) {
    await upsertar(siembra, 'clinical.patient_opt_out', {
      id: idSembrado(`${paciente.clave}/opt-out-analisis-ia`),
      patient_id: pacienteId,
      opt_out_type: 'analisis_ia',
      action: 'registrado',
      external_reference: paciente.optOutAnalisisIa,
      reason_code: MOTIVO_SINTETICO_DE_OPT_OUT,
      recorded_by: usuarios.adminId,
      recorded_at: siembra.ahora,
    });
  }
}

async function sembrarTodo(siembra: Siembra): Promise<void> {
  const roles = await asegurarRolesYPermisos(siembra);
  const { credenciales } = siembra.entradas;
  const doctorId = await asegurarUsuario(siembra, roles, {
    clave: 'doc1',
    correo: 'doc1@test.local',
    nombre: 'Doctor Sintetico Uno',
    rol: 'doctor',
    contrasena: credenciales.doctor,
  });
  const adminId = await asegurarUsuario(siembra, roles, {
    clave: 'admin',
    correo: 'admin@test.local',
    nombre: 'Administrador Sintetico',
    rol: 'admin',
    contrasena: credenciales.admin,
  });
  for (const [indice, paciente] of PACIENTES_SEMILLA.entries()) {
    await sembrarPaciente(siembra, paciente, indice + 1, { doctorId, adminId });
  }
}

/** Siembra roles, usuarios de demo y los pacientes (a)–(m), de forma idempotente, dentro de la sesión recibida. */
export async function sembrar(db: ClienteSql, entradas: EntradasDelSeed): Promise<FilasUpsertadas> {
  const escritas: Record<string, number> = {};
  const identidad = crearServicioDeIdentidad({ claves: entradas.claves, db });
  const siembra: Siembra = { db, entradas, ahora: entradas.reloj.now(), escritas, identidad };
  await sembrarTodo(siembra);
  return escritas;
}
