import { describe, expect, it } from 'vitest';
import { normalizeText } from '../lib/text.mjs';
import { RULES } from '../rules/index.mjs';
import { patchedContracts, readCases, realContracts } from './helpers/parches.mjs';

const real = await realContracts();
const byName = Object.fromEntries(RULES.map((rule) => [rule.name, rule]));
const cases = readCases();

const title = (caso) => `${caso.esperado.sinHallazgos ? 'no reporta hallazgos' : 'reporta el hallazgo'} cuando ${caso.escenario} [${caso.us ?? 'US-033'} ${caso.ac}]`;

/** `AC-1 · AC-13` → ['AC-1', 'AC-13']: se compara por ficha completa, no por prefijo (AC-1 no es AC-17). */
const refTokens = (ref) => ref.split(/\s*·\s*/);

/** ¿Algún hallazgo de la regla nombra el archivo, la ruta y el AC/RN esperados? */
function matches(findings, caso) {
  const expected = caso.esperado;
  return findings.some(
    (item) =>
      item.rule === caso.regla &&
      refTokens(item.ref).includes(expected.ref ?? caso.ac) &&
      (!expected.archivo || item.file === expected.archivo) &&
      (!expected.rutaContiene || item.path.includes(expected.rutaContiene)) &&
      (!expected.mensajeContiene || normalizeText(item.message).includes(normalizeText(expected.mensajeContiene))),
  );
}

/** Qué AC de US-033 protege cada regla (design.md, tabla de reglas). */
const ACS_OF_RULE = {
  assertSpecVersions: 'AC-1',
  assertLoginContract: 'AC-1',
  assertEvidenceAnalysisShape: 'AC-1',
  assertClosedSchemas: 'AC-1',
  assertCamelCaseProperties: 'AC-1',
  assertNoV1Vocabulary: 'AC-2',
  assertExamplesValid: 'AC-3',
  assertNoEvidenceImpliesNullScore: 'AC-3',
  assertAnalysisBasisComplete: 'AC-4',
  assertDataModelDocument: 'AC-5 AC-6 AC-12 AC-13 AC-15 AC-18',
  assertDerivedEventDescription: 'AC-7',
  assertSharedSchemasSingleOrigin: 'AC-8',
  assertRagTipoNoHabilitado: 'AC-9',
  assertManualEntryEndpoints: 'AC-10',
  assertDiagnosisGrading: 'AC-11',
  assertCitedSourceAttribution: 'AC-12',
  assertFollowUpContract: 'AC-13',
  assertPublishedFromYear: 'AC-14',
  assertSharedTypesIdenticalAcrossProviders: 'AC-8 AC-16',
  assertReadmeExtractInSync: 'AC-16',
  assertNoPrescriptiveLanguage: 'AC-17',
  assertDisclaimerRequired: 'AC-17',
  assertClaimsAnchored: 'AC-17',
  assertNormativeDescriptions: 'AC-17',
  assertErrorCodesClosed: 'AC-17',
  assertErrorsNoEcho: 'AC-17',
  assertNoIdentityInRagContract: 'AC-17',
  assertNoIdentityInUrl: 'AC-17',
  assertOperationsDeclarePermission: 'AC-17',
  assertViewByPermission: 'AC-17',
  assertExamplesSynthetic: 'AC-17',
  assertFixtureQueriesDistinct: 'AC-6',
};

/** Reglas que no son de US-033 (el resto protege los AC de US-033). */
const US_OF_RULE = { assertFixtureQueriesDistinct: 'US-034' };

describe('reglas de contratos sobre los contratos reales', () => {
  it.each(RULES.map((rule) => [`no reporta hallazgos cuando se revisan los contratos reales: ${rule.name} [${US_OF_RULE[rule.name] ?? 'US-033'} ${ACS_OF_RULE[rule.name]}]`, rule]))('%s', (_title, rule) => {
    expect(rule(real.specs, real.examples, real.docs)).toEqual([]);
  });
});

describe('reglas de contratos con parches de mutación', () => {
  it.each(cases.map((caso) => [title(caso), caso]))('%s', (_title, caso) => {
    expect(byName[caso.regla], `la regla ${caso.regla} no existe`).toBeTypeOf('function');
    const mutated = patchedContracts(real, caso.parches);
    const findings = byName[caso.regla](mutated.specs, mutated.examples, mutated.docs);
    if (caso.esperado.sinHallazgos) expect(findings).toEqual([]);
    else expect(matches(findings, caso), JSON.stringify(findings.slice(0, 4), null, 1)).toBe(true);
  });
});
