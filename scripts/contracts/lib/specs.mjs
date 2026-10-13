/** Vocabulario compartido por las reglas: nombres de specs, schemas compartidos y su ubicación. */

export const CLINICAL_API = 'clinical-api';
export const RAG_ORCHESTRATOR = 'rag-orchestrator';
export const EVIDENCE = 'evidence';

/** Los dos proveedores; `evidence` es el archivo compartido, no un proveedor. */
export const PROVIDERS = [CLINICAL_API, RAG_ORCHESTRATOR];

/** Lista canónica de schemas compartidos (design.md D1, AC-8). `Provenance` NO es compartido. */
export const SHARED_SCHEMAS = [
  'EvidenceOption',
  'DiscardedOption',
  'Synthesis',
  'SupportedClaim',
  'SourceApplicability',
  'ApplicabilityCriterion',
  'ApplicabilitySummary',
  'CitedSource',
];

/** Auxiliar abierto del archivo compartido; solo se compone dentro de un allOf cerrado. */
export const SHARED_AUXILIARY = ['CitedSourceFields'];

/** Las cuatro clases de licencia del contrato (`licenseClass`) y de `corpus.license_class`; el MVP solo ingiere tres por configuración. */
export const LICENSE_CLASSES = ['dominio_publico', 'cc_by', 'cc_by_sa', 'cc_by_nc'];

const SHARED_NAMES = new Set([...SHARED_SCHEMAS, ...SHARED_AUXILIARY]);

/** `[#/components/schemas/<Nombre>]` → `Nombre`, o `null` si el puntero no apunta a un schema de componentes. */
export function schemaNameOf(pointer) {
  return pointer.match(/^#\/components\/schemas\/([^/]+)/)?.[1] ?? null;
}

/**
 * Archivo donde vive un puntero de un spec empaquetado: los schemas compartidos viven en
 * `contracts/schemas/evidence.yaml`; el resto, en el spec del proveedor.
 */
export function fileOf(specs, specName, pointer) {
  const schemaName = schemaNameOf(pointer);
  const isShared = specName !== EVIDENCE && schemaName !== null && SHARED_NAMES.has(schemaName);
  return (isShared ? specs[EVIDENCE] : specs[specName]).file;
}

/** El schema `name` de `components.schemas` del spec empaquetado, o `undefined`. */
export function schemaOf(specs, specName, name) {
  return specs[specName]?.bundled?.components?.schemas?.[name];
}

/** Puntero a un schema de componentes. */
export const schemaPointer = (name) => `#/components/schemas/${name}`;
