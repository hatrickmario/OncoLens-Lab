/**
 * Las dos listas de identidad (design.md D13). Coinciden por expresión regular sobre el nombre
 * normalizado (sin `_` ni `-`, en minúsculas), con una lista blanca explícita.
 */
import { normalizeName } from './text.mjs';

/** Identidad personal: rige la URL y las cabeceras de Backend 1. */
export const IDENTIDAD_PII = [
  /name$/,
  /^nombres?$/,
  /^apellidos?$/,
  /^nationalid$/,
  /^idtype$/,
  /^documentnumber$/,
  /^documento$/,
  /^birth(date|year)$/,
  /^dateofbirth$/,
  /^dob$/,
  /^fechanacimiento$/,
  /^address$/,
  /^direccion$/,
  /^phone$/,
  /^mobile$/,
  /^telephone$/,
  /^telefono$/,
  /^email$/,
  /^correo$/,
  /^cedula$/,
  /^numerodocumento$/,
  /^medicalrecordnumber$/,
  /^mrn$/,
  /^historiaclinica$/,
  /^numerohistoria(clinica)?$/,
];

/** Identificadores enlazables: junto con la identidad personal, rigen todo el contrato de Backend 2. */
const LINKABLE_IDENTIFIERS = [
  /^patientid$/,
  /^analysisid$/,
  /^episodeid$/,
  /^userid$/,
  /^sourcedocumentid$/,
  /^additionalsourcedocumentids$/,
  /^documentid$/,
];

export const IDENTIDAD_B2 = [...IDENTIDAD_PII, ...LINKABLE_IDENTIFIERS];

/** Nombres de persona: lo que debe ser "Prueba Sintética" en los ejemplos. */
export const PATRONES_NOMBRE_PERSONA = [/name$/, /^nombres?$/, /^apellidos?$/];
/** Números de documento: lo que debe empezar por SINT- en los ejemplos. */
export const PATRONES_NUMERO_DOCUMENTO = [/^nationalid(masked)?$/, /^documentnumber$/, /^numerodocumento$/, /^documento$/, /^cedula$/];
/** Fechas de nacimiento: no pueden ser absolutas en los ejemplos. */
export const PATRONES_FECHA_NACIMIENTO = [/^birthdate$/, /^dateofbirth$/, /^dob$/, /^fechanacimiento$/];

/** Nombres que casan con `name$` pero no son identidad; se amplía solo con revisión de privacy-guardian. */
export const NAME_ALLOWLIST = [
  'biomarkerName', // nombre canónico del biomarcador del catálogo
  'sourceName', // fuente del corpus, copiada del catálogo
  'regimenName', // régimen terapéutico del catálogo
  'originalName', // texto del biomarcador tal como aparece en el documento
  'drugName', // fármaco del catálogo
  'llmModel', // modelo, no una persona
  // originalFilename y fileName NO están aquí: un nombre de archivo puede llevar identidad y no cruza a Backend 2 (RN-10);
  // en los ejemplos los cubre la regla SINT- de assertExamplesSynthetic (resp. 41, PG #1).
  'pseudoPatientId', // seudónimo aleatorio por consulta (RN-11), nunca en el prompt
].map(normalizeName);

/** Cada nombre que se prueba: el completo y cada tramo contiguo del nombre partido por separadores (`X-Patient-Email`) y por camelCase (`patientEmail`). */
function candidateNames(name) {
  const tokens = String(name)
    .split(/[-_\s]+/)
    .flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? []);
  const spans = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let end = start + 1; end <= tokens.length; end += 1) spans.push(tokens.slice(start, end).join(''));
  }
  return [name, ...spans].map(normalizeName);
}

/**
 * Identificadores genéricos (último tramo `id`, `uuid`…) que SÍ pueden cruzar a Backend 2, cada uno justificado:
 * ninguno enlaza con una entidad clínica ni con una persona.
 */
export const IDENTIFIER_ALLOWLIST = [
  'chunkId', // referencia best-effort a un chunk del corpus
  'externalId', // identificador de la fuente del corpus (DOI, NCT, PMID)
  'traceId', // trazabilidad de la llamada, nuevo por turno
  'pseudoPatientId', // seudónimo aleatorio por consulta (RN-11), nunca en el prompt
].map(normalizeName);

/** ¿Termina el nombre en un tramo `id`/`uuid`, es decir, es un identificador de algo? */
function isGenericIdentifier(name) {
  const tokens = String(name).split(/[-_\s]+/).flatMap((part) => part.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z0-9]+/g) ?? []);
  return ['id', 'ids', 'uuid', 'guid'].includes(tokens.at(-1)?.toLowerCase());
}

/** ¿El nombre es de IDENTIDAD_B2 o un identificador genérico fuera de la lista blanca? */
export function matchesIdentityB2(name) {
  return matchesIdentity(name, IDENTIDAD_B2) || (isGenericIdentifier(name) && !IDENTIFIER_ALLOWLIST.includes(normalizeName(name)));
}

/** ¿El nombre es de identidad según `patterns`, descontada la lista blanca? */
export function matchesIdentity(name, patterns) {
  if (NAME_ALLOWLIST.includes(normalizeName(name))) return false;
  return candidateNames(name).some((candidate) => patterns.some((pattern) => pattern.test(candidate)));
}
