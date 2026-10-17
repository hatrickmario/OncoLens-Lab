import type { RolDeUsuario } from '../../src/modules/auth/auth.repository.js';

/**
 * Matriz de permisos RBAC de `docs/architecture/data-model.md` §8 (MVP: solo RBAC). El rol `admin` NO lee datos
 * clínicos ni análisis (mínimo privilegio, PRD v1.4 §11, E-04). `audit:read_patient` no lo tiene nadie todavía.
 */
export interface PermisoSembrado {
  readonly codigo: string;
  readonly descripcion: string;
  readonly roles: readonly RolDeUsuario[];
}

export const DESCRIPCION_DE_ROL: Readonly<Record<RolDeUsuario, string>> = {
  doctor: 'Médico tratante: lectura y escritura clínica, análisis de evidencia',
  admin: 'Administrador: cuentas, altas de pacientes y opt-out; sin acceso a datos clínicos',
};

const AMBOS: readonly RolDeUsuario[] = ['doctor', 'admin'];
const SOLO_DOCTOR: readonly RolDeUsuario[] = ['doctor'];
const SOLO_ADMIN: readonly RolDeUsuario[] = ['admin'];
const NINGUNO: readonly RolDeUsuario[] = [];

export const MATRIZ_DE_PERMISOS: readonly PermisoSembrado[] = [
  { codigo: 'session:logout', descripcion: 'Cerrar sesión', roles: AMBOS },
  { codigo: 'accounts:manage', descripcion: 'Gestión de cuentas', roles: SOLO_ADMIN },
  { codigo: 'patients:create', descripcion: 'Alta de pacientes', roles: AMBOS },
  { codigo: 'patients:lookup', descripcion: 'Búsqueda y ficha de identificación', roles: AMBOS },
  { codigo: 'opt_outs:write', descripcion: 'Marcas de opt-out', roles: SOLO_ADMIN },
  { codigo: 'clinical:read', descripcion: 'Lectura de la ficha clínica', roles: SOLO_DOCTOR },
  { codigo: 'clinical:write', descripcion: 'Registro de datos clínicos', roles: SOLO_DOCTOR },
  { codigo: 'documents:read', descripcion: 'Lectura de documentos', roles: SOLO_DOCTOR },
  { codigo: 'documents:upload', descripcion: 'Carga de documentos', roles: SOLO_DOCTOR },
  { codigo: 'intake_drafts:read', descripcion: 'Lectura de borradores', roles: SOLO_DOCTOR },
  { codigo: 'intake_drafts:write', descripcion: 'Escritura de borradores', roles: SOLO_DOCTOR },
  { codigo: 'ai_analysis:create', descripcion: 'Crear análisis de evidencia', roles: SOLO_DOCTOR },
  { codigo: 'ai_analysis:read', descripcion: 'Leer análisis de evidencia', roles: SOLO_DOCTOR },
  {
    codigo: 'follow_ups:create',
    descripcion: 'Crear preguntas de seguimiento',
    roles: SOLO_DOCTOR,
  },
  { codigo: 'follow_ups:read', descripcion: 'Leer preguntas de seguimiento', roles: SOLO_DOCTOR },
  { codigo: 'case_summary:create', descripcion: 'Crear resumen del caso', roles: SOLO_DOCTOR },
  { codigo: 'case_summary:read', descripcion: 'Leer resumen del caso', roles: SOLO_DOCTOR },
  { codigo: 'audit:read_patient', descripcion: 'Leer auditoría de un paciente', roles: NINGUNO },
];
