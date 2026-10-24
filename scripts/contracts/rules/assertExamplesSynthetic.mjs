/**
 * AC-17 [RN-14, RN-21, Pre-S1 resp. 12]: los ejemplos son sintéticos (dataClassification sintetico, prefijo SINT-, "Prueba
 * Sintética"), NCCN y ESMO solo como exclusión, y los de Backend 2 no llevan fechas absolutas en el contexto ni en el texto.
 */
import { coincidenciasPii, formatosCompilados, PREFIJO_SINTETICO } from '../../lib/formatosPii.mjs';
import { reporter } from '../lib/findings.mjs';
import { CLAVES_DE_NOMBRE_DE_ARCHIVO, PATRONES_FECHA_NACIMIENTO, PATRONES_NOMBRE_PERSONA, PATRONES_NUMERO_DOCUMENTO, matchesIdentity } from '../lib/identity.mjs';
import { schemaPointer, RAG_ORCHESTRATOR } from '../lib/specs.mjs';
import { walkJson } from '../lib/walk.mjs';

const report = reporter('assertExamplesSynthetic', 'AC-17 · RN-14');

const SYNTHETIC_NAME = /^Prueba Sintética( \d+)?$/;
const SEARCH_REQUEST_TARGET = schemaPointer('PatientSearchRequest');
const REAL_ORIGINS = ['real_anonimizado', 'real_identificado'];
const EXCLUSION_KEYS = ['sourcesNotIncluded', 'excludedSources'];
const EXCLUDED_SOURCES = /\b(NCCN|ESMO)\b/i;
/**
 * Dominios de correo de los ejemplos: más estrictos que los reservados que el escáner de PII deja pasar
 * (`dominiosExentos` de config/pii-formats.json). Qué es un correo lo decide el formato `correo` de ese archivo.
 */
const DOMINIOS_DE_EJEMPLO = ['oncolens.test', 'ejemplo.invalid', 'example.com', 'example.org', 'example.net'];
const FORMATO_CORREO = formatosCompilados().filter((formato) => formato.tipo === 'correo');
/** Fechas absolutas: AAAA-MM-DD, DD/MM/AAAA, D/M/AA y "<d> de <mes> de <año>" (privacy M-9). */
const ABSOLUTE_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2} de [a-záéíóú]+ de \d{4}\b/i;
const NO_DATES_UNDER = ['clinicalContext', 'analysisMemory', 'query', 'question'];

/**
 * Máscara cerrada del documento del listado (L1D-202 D2): cuatro `•`, un espacio y los dos últimos caracteres. Solo la
 * clave `nationalIdMasked` la admite; el documento en claro (`nationalId`, `documentNumber`…) sigue exigiendo SINT-.
 */
const MASCARA_DE_DOCUMENTO = /^•{4} [A-Za-z0-9]{2}$/u;
const esMascaraDeDocumento = (key, value) => key.toLowerCase() === 'nationalidmasked' && MASCARA_DE_DOCUMENTO.test(value);

/**
 * Máscara cerrada del nombre del listado (L1D-285, design D7): iniciales "P. S." y un dígito opcional. Solo la clave
 * `fullNameMasked` la admite; el nombre en claro (`fullName`…) sigue exigiendo "Prueba Sintética".
 */
const MASCARA_DE_NOMBRE = /^P\. S\.( \d\.)?$/u;
const esMascaraDeNombre = (key, value) => key === 'fullNameMasked' && MASCARA_DE_NOMBRE.test(value);

const underAny = (pointer, keys) => keys.some((key) => pointer.split('/').includes(key));
const insideExclusion = (pointer) => EXCLUSION_KEYS.some((key) => pointer.includes(`/${key}/`));

function checkNode({ value, pointer, key }, context) {
  const { file, entry } = context;
  const found = [];
  if (key === 'dataClassification' && value !== 'sintetico') found.push(report(file, pointer, 'dataClassification debe ser sintetico'));
  if (key === 'dataOrigin' && REAL_ORIGINS.includes(value)) found.push(report(file, pointer, `${value} no es sintético: los ejemplos solo usan datos sintéticos`));
  if (key !== null && typeof value === 'string' && matchesIdentity(key, PATRONES_NUMERO_DOCUMENTO) && !value.startsWith(PREFIJO_SINTETICO) && !esMascaraDeDocumento(key, value)) found.push(report(file, pointer, `${key} debe empezar por ${PREFIJO_SINTETICO}`));
  if (CLAVES_DE_NOMBRE_DE_ARCHIVO.includes(key) && !String(value).startsWith(PREFIJO_SINTETICO)) found.push(report(file, pointer, `${key} debe empezar por ${PREFIJO_SINTETICO}`));
  if (key !== null && typeof value === 'string' && matchesIdentity(key, PATRONES_FECHA_NACIMIENTO) && ABSOLUTE_DATE.test(value)) {
    found.push(report(file, pointer, 'una fecha de nacimiento absoluta no puede aparecer en un ejemplo: solo el año o una edad relativa'));
  }
  const isPerson = (key !== 'name' && key !== null && !CLAVES_DE_NOMBRE_DE_ARCHIVO.includes(key) && matchesIdentity(key, PATRONES_NOMBRE_PERSONA)) || (key === 'name' && entry.target === SEARCH_REQUEST_TARGET);
  if (isPerson && !SYNTHETIC_NAME.test(String(value)) && !esMascaraDeNombre(key, String(value))) found.push(report(file, pointer, 'todo nombre de persona debe ser "Prueba Sintética"'));
  return found;
}

function checkString({ value, pointer }, context) {
  if (typeof value !== 'string') return [];
  const { file, entry } = context;
  const found = [];
  if (EXCLUDED_SOURCES.test(value) && !insideExclusion(pointer)) found.push(report(file, pointer, 'NCCN y ESMO solo pueden aparecer como exclusión en sourcesNotIncluded'));
  for (const { valor, dominio } of coincidenciasPii(value, FORMATO_CORREO, { sinExenciones: true })) {
    if (!DOMINIOS_DE_EJEMPLO.includes(dominio.toLowerCase())) found.push(report(file, pointer, `el correo ${valor} no es de un dominio sintético`));
  }
  if (entry.spec === RAG_ORCHESTRATOR && underAny(pointer, NO_DATES_UNDER) && ABSOLUTE_DATE.test(value)) {
    found.push(report(file, pointer, 'las peticiones a Backend 2 llevan fechas relativas, no absolutas (RN-11)'));
  }
  return found;
}

export function assertExamplesSynthetic(specs, examples) {
  return (examples.index?.examples ?? []).flatMap((entry) => {
    const data = examples.files?.[entry.file];
    if (data === undefined) return [];
    const context = { file: `${examples.dir}/${entry.file}`, entry };
    return [...walkJson(data)].flatMap((node) => [...checkNode(node, context), ...checkString(node, context)]);
  });
}
