/**
 * Las dos listas de identidad (design.md D13). Coinciden por expresión regular sobre el nombre
 * normalizado (sin `_` ni `-`, en minúsculas), con una lista blanca explícita.
 */
import { normalizeName } from './text.mjs';

/** Identidad personal: rige la URL y las cabeceras de Backend 1. */
export const IDENTITY_PII = [
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
  /^medicalrecordnumber$/,
  /^historiaclinica$/,
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

export const IDENTITY_B2 = [...IDENTITY_PII, ...LINKABLE_IDENTIFIERS];

/** Nombres que casan con `name$` pero no son identidad; se amplía solo con revisión de privacy-guardian. */
export const NAME_ALLOWLIST = ['biomarkerName', 'sourceName', 'regimenName', 'originalName', 'drugName', 'llmModel'].map(normalizeName);

/** ¿El nombre es de identidad según `patterns`, descontada la lista blanca? */
export function matchesIdentity(name, patterns) {
  const normalized = normalizeName(name);
  return !NAME_ALLOWLIST.includes(normalized) && patterns.some((pattern) => pattern.test(normalized));
}
