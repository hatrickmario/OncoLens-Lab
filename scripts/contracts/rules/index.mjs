/** Las reglas de `contracts:check`, en el orden de los AC de US-033. Cada una es pura: `(specs, examples, docs) → Finding[]`. */
import { assertAnalysisBasisComplete } from './assertAnalysisBasisComplete.mjs';
import { assertCamelCaseProperties } from './assertCamelCaseProperties.mjs';
import { assertCitedSourceAttribution } from './assertCitedSourceAttribution.mjs';
import { assertClaimsAnchored } from './assertClaimsAnchored.mjs';
import { assertClosedSchemas } from './assertClosedSchemas.mjs';
import { assertDataModelDocument } from './assertDataModelDocument.mjs';
import { assertDerivedEventDescription } from './assertDerivedEventDescription.mjs';
import { assertDiagnosisGrading } from './assertDiagnosisGrading.mjs';
import { assertDisclaimerRequired } from './assertDisclaimerRequired.mjs';
import { assertErrorCodesClosed } from './assertErrorCodesClosed.mjs';
import { assertErrorsNoEcho } from './assertErrorsNoEcho.mjs';
import { assertEvidenceAnalysisShape } from './assertEvidenceAnalysisShape.mjs';
import { assertExamplesSynthetic } from './assertExamplesSynthetic.mjs';
import { assertExamplesValid } from './assertExamplesValid.mjs';
import { assertGeneratedInSync } from './assertGeneratedInSync.mjs';
import { assertFollowUpContract } from './assertFollowUpContract.mjs';
import { assertLoginContract } from './assertLoginContract.mjs';
import { assertManualEntryEndpoints } from './assertManualEntryEndpoints.mjs';
import { assertNoEvidenceImpliesNullScore } from './assertNoEvidenceImpliesNullScore.mjs';
import { assertNoIdentityInRagContract } from './assertNoIdentityInRagContract.mjs';
import { assertNoIdentityInUrl } from './assertNoIdentityInUrl.mjs';
import { assertNoPrescriptiveLanguage } from './assertNoPrescriptiveLanguage.mjs';
import { assertNoV1Vocabulary } from './assertNoV1Vocabulary.mjs';
import { assertNormativeDescriptions } from './assertNormativeDescriptions.mjs';
import { assertOperationsDeclarePermission } from './assertOperationsDeclarePermission.mjs';
import { assertPublishedFromYear } from './assertPublishedFromYear.mjs';
import { assertRagTipoNoHabilitado } from './assertRagTipoNoHabilitado.mjs';
import { assertReadmeExtractInSync } from './assertReadmeExtractInSync.mjs';
import { assertSharedSchemasSingleOrigin } from './assertSharedSchemasSingleOrigin.mjs';
import { assertSpecVersions } from './assertSpecVersions.mjs';
import { assertViewByPermission } from './assertViewByPermission.mjs';

export const RULES = [
  // AC-1
  assertSpecVersions,
  assertLoginContract,
  assertEvidenceAnalysisShape,
  assertClosedSchemas,
  assertCamelCaseProperties,
  // AC-2
  assertNoV1Vocabulary,
  // AC-3
  assertExamplesValid,
  assertNoEvidenceImpliesNullScore,
  // AC-4
  assertAnalysisBasisComplete,
  // AC-5, AC-6, AC-12 y AC-13 (datos), AC-15, AC-18
  assertDataModelDocument,
  // AC-7
  assertDerivedEventDescription,
  // AC-8
  assertSharedSchemasSingleOrigin,
  // AC-9
  assertRagTipoNoHabilitado,
  // AC-10
  assertManualEntryEndpoints,
  // AC-11
  assertDiagnosisGrading,
  // AC-12
  assertCitedSourceAttribution,
  // AC-13
  assertFollowUpContract,
  // AC-14
  assertPublishedFromYear,
  // AC-8 y AC-16
  assertGeneratedInSync,
  assertReadmeExtractInSync,
  // AC-17
  assertNoPrescriptiveLanguage,
  assertDisclaimerRequired,
  assertClaimsAnchored,
  assertNormativeDescriptions,
  assertErrorCodesClosed,
  assertErrorsNoEcho,
  assertNoIdentityInRagContract,
  assertNoIdentityInUrl,
  assertOperationsDeclarePermission,
  assertViewByPermission,
  assertExamplesSynthetic,
];

/**
 * Ejecuta las reglas sobre un contexto ya construido y concatena sus hallazgos.
 * @returns {import('../lib/findings.mjs').Finding[]}
 */
export function runRules({ specs, examples, docs }, rules = RULES) {
  return rules.flatMap((rule) => rule(specs, examples, docs));
}
