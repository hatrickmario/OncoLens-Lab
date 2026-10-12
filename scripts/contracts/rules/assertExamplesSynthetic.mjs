/**
 * AC-17 [RN-14, RN-21, Pre-S1 resp. 12]: los ejemplos son sintéticos (dataClassification sintetico, prefijo SINT-, "Prueba
 * Sintética"), NCCN y ESMO solo como exclusión, y los de Backend 2 no llevan fechas absolutas en el contexto ni en el texto.
 */
import { reporter } from '../lib/findings.mjs';
import { schemaPointer, RAG_ORCHESTRATOR } from '../lib/specs.mjs';
import { walkJson } from '../lib/walk.mjs';

const report = reporter('assertExamplesSynthetic', 'AC-17 · RN-14');

const SYNTHETIC_NAME = /^Prueba Sintética( \d+)?$/;
const PERSON_KEYS = ['fullName', 'patientName', 'firstName', 'lastName'];
const SEARCH_REQUEST_TARGET = schemaPointer('PatientSearchRequest');
const REAL_ORIGINS = ['real_anonimizado', 'real_identificado'];
const EXCLUSION_KEYS = ['sourcesNotIncluded', 'excludedSources'];
const EXCLUDED_SOURCES = /\b(NCCN|ESMO)\b/i;
const SYNTHETIC_EMAIL_DOMAINS = ['oncolens.test', 'ejemplo.invalid', 'example.com', 'example.org', 'example.net'];
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
/** Fechas absolutas: AAAA-MM-DD, DD/MM/AAAA, D/M/AA y "<d> de <mes> de <año>" (privacy M-9). */
const ABSOLUTE_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2} de [a-záéíóú]+ de \d{4}\b/i;
const NO_DATES_UNDER = ['clinicalContext', 'analysisMemory', 'query', 'question'];

const underAny = (pointer, keys) => keys.some((key) => pointer.split('/').includes(key));
const insideExclusion = (pointer) => EXCLUSION_KEYS.some((key) => pointer.includes(`/${key}/`));

function checkNode({ value, pointer, key }, context) {
  const { file, entry } = context;
  const found = [];
  if (key === 'dataClassification' && value !== 'sintetico') found.push(report(file, pointer, 'dataClassification debe ser sintetico'));
  if (key === 'dataOrigin' && REAL_ORIGINS.includes(value)) found.push(report(file, pointer, `${value} no es sintético: los ejemplos solo usan datos sintéticos`));
  if ((key === 'nationalId' || key === 'nationalIdMasked') && !String(value).startsWith('SINT-')) found.push(report(file, pointer, `${key} debe empezar por SINT-`));
  if (['originalFilename', 'filename', 'fileName'].includes(key) && !String(value).startsWith('SINT-')) found.push(report(file, pointer, `${key} debe empezar por SINT-`));
  const isPerson = PERSON_KEYS.includes(key) || (key === 'name' && entry.target === SEARCH_REQUEST_TARGET);
  if (isPerson && !SYNTHETIC_NAME.test(String(value))) found.push(report(file, pointer, 'todo nombre de persona debe ser "Prueba Sintética"'));
  return found;
}

function checkString({ value, pointer }, context) {
  if (typeof value !== 'string') return [];
  const { file, entry } = context;
  const found = [];
  if (EXCLUDED_SOURCES.test(value) && !insideExclusion(pointer)) found.push(report(file, pointer, 'NCCN y ESMO solo pueden aparecer como exclusión en sourcesNotIncluded'));
  for (const match of value.matchAll(EMAIL)) {
    if (!SYNTHETIC_EMAIL_DOMAINS.includes(match[1].toLowerCase())) found.push(report(file, pointer, `el correo ${match[0]} no es de un dominio sintético`));
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
