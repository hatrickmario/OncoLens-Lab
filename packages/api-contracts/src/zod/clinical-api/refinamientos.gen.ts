// GENERADO desde apps/clinical-api/openapi.yaml — no editar a mano (npm run contracts:generate)

import * as z from 'zod';
import { zApplicabilityCriterion, zCitedSource, zEvidenceAnalysis, zEvidenceAnalysisRequest, zEvidenceOption, zFollowUpCitedSource, zFollowUpTurn, zPatientSearchRequest, zSourceApplicability, zSupportedClaim, zSynthesis } from './zod.gen.js';

type Ruta = readonly PropertyKey[];
type Contexto = { addIssue(incidencia: { code: 'custom'; message: string; path?: PropertyKey[] }): void };

const esObjeto = (valor: unknown): valor is Record<string, unknown> => typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const tiene = (objeto: Record<string, unknown>, clave: string): boolean => Object.hasOwn(objeto, clave);
// Una propiedad desconocida puede ser un dato: solo se nombra en la ruta si parece un identificador de campo (RN-10).
const nombreDeCampo = (clave: string): string => (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(clave) ? clave : '{propiedad no declarada}');
const esUnoDe = (valor: unknown, posibles: readonly unknown[]): boolean => posibles.includes(valor);
const esTipo = (valor: unknown, tipo: string): boolean => {
  if (tipo === 'null') return valor === null;
  if (tipo === 'array') return Array.isArray(valor);
  if (tipo === 'object') return esObjeto(valor);
  if (tipo === 'integer') return Number.isInteger(valor);
  return typeof valor === tipo;
};

function verificarApplicabilityCriterion(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (tiene(objeto0, "citedSources")) {
      const hijo0 = objeto0["citedSources"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarCitedSource(elemento1, ctx, [...[...ruta, "citedSources"], indice1]);
        });
      }
    }
  }
}
function verificarCitedSource(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    const permitidas = new Set<string>(["authors","chunkId","chunkTextSnapshot","externalId","guidelineVersion","language","lastUpdatedAt","licenseClass","newerVersionAvailable","possiblyOutdated","primaryEndpoint","publishedAt","sampleSize","sourceName","sourceType","sourceUrl","studyDesign","title","trialPhase"]);
    for (const clave of Object.keys(objeto0)) if (!permitidas.has(clave)) ctx.addIssue({ code: 'custom', path: [...ruta, nombreDeCampo(clave)], message: "CitedSource: propiedad no evaluada por el schema" });
  }
}
function verificarEvidenceAnalysis(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if ((!tiene(objeto0, "status") || (esUnoDe(objeto0["status"], ["sin_evidencia","tipo_no_habilitado"]))) && tiene(objeto0, "status")) {
      if (tiene(objeto0, "topRelevanceScore") && !((esTipo(objeto0["topRelevanceScore"], "null")))) ctx.addIssue({ code: 'custom', path: [...ruta, "topRelevanceScore"], message: "EvidenceAnalysis: si status en [\"sin_evidencia\",\"tipo_no_habilitado\"] y status presente: topRelevanceScore debe cumplir {\"type\":\"null\"}" });
      if (tiene(objeto0, "evidenceOptions") && !((esTipo(objeto0["evidenceOptions"], "array")) && (!Array.isArray(objeto0["evidenceOptions"]) || objeto0["evidenceOptions"].length <= 0))) ctx.addIssue({ code: 'custom', path: [...ruta, "evidenceOptions"], message: "EvidenceAnalysis: si status en [\"sin_evidencia\",\"tipo_no_habilitado\"] y status presente: evidenceOptions debe cumplir {\"type\":\"array\",\"maxItems\":0}" });
    } else {
      if (tiene(objeto0, "topRelevanceScore") && !((esTipo(objeto0["topRelevanceScore"], "number")))) ctx.addIssue({ code: 'custom', path: [...ruta, "topRelevanceScore"], message: "EvidenceAnalysis: si no status en [\"sin_evidencia\",\"tipo_no_habilitado\"] y status presente: topRelevanceScore debe cumplir {\"type\":\"number\"}" });
    }
    if (tiene(objeto0, "synthesis")) {
      const hijo0 = objeto0["synthesis"];
      verificarSynthesis(hijo0, ctx, [...ruta, "synthesis"]);
    }
    if (tiene(objeto0, "applicability")) {
      const hijo0 = objeto0["applicability"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarSourceApplicability(elemento1, ctx, [...[...ruta, "applicability"], indice1]);
        });
      }
    }
    if (tiene(objeto0, "evidenceOptions")) {
      const hijo0 = objeto0["evidenceOptions"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarEvidenceOption(elemento1, ctx, [...[...ruta, "evidenceOptions"], indice1]);
        });
      }
    }
  }
}
function verificarEvidenceAnalysisRequest(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (tiene(objeto0, "sourcesSelected")) {
      const hijo0 = objeto0["sourcesSelected"];
      if (esObjeto(hijo0)) {
        const objeto1 = hijo0;
        if (!(((!tiene(objeto1, "guias") || (objeto1["guias"] === true))) || ((!tiene(objeto1, "ensayos") || (objeto1["ensayos"] === true))) || ((!tiene(objeto1, "publicaciones") || (objeto1["publicaciones"] === true))))) ctx.addIssue({ code: 'custom', path: [...[...ruta, "sourcesSelected"]], message: "EvidenceAnalysisRequest.sourcesSelected: debe cumplir al menos una alternativa: guias = true o ensayos = true o publicaciones = true" });
      }
    }
  }
}
function verificarEvidenceOption(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (tiene(objeto0, "citedSources")) {
      const hijo0 = objeto0["citedSources"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarCitedSource(elemento1, ctx, [...[...ruta, "citedSources"], indice1]);
        });
      }
    }
  }
}
function verificarFollowUpCitedSource(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    const permitidas = new Set<string>(["authors","chunkId","chunkTextSnapshot","externalId","guidelineVersion","isNewSource","language","lastUpdatedAt","licenseClass","newerVersionAvailable","possiblyOutdated","primaryEndpoint","publishedAt","sampleSize","sourceName","sourceType","sourceUrl","studyDesign","title","trialPhase"]);
    for (const clave of Object.keys(objeto0)) if (!permitidas.has(clave)) ctx.addIssue({ code: 'custom', path: [...ruta, nombreDeCampo(clave)], message: "FollowUpCitedSource: propiedad no evaluada por el schema" });
  }
}
function verificarFollowUpTurn(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if ((!tiene(objeto0, "status") || (esUnoDe(objeto0["status"], ["sin_evidencia","fuera_de_contexto"]))) && tiene(objeto0, "status")) {
      if (tiene(objeto0, "answer") && !((esTipo(objeto0["answer"], "array")) && (!Array.isArray(objeto0["answer"]) || objeto0["answer"].length <= 0))) ctx.addIssue({ code: 'custom', path: [...ruta, "answer"], message: "FollowUpTurn: si status en [\"sin_evidencia\",\"fuera_de_contexto\"] y status presente: answer debe cumplir {\"type\":\"array\",\"maxItems\":0}" });
      if (tiene(objeto0, "citedSources") && !((esTipo(objeto0["citedSources"], "array")) && (!Array.isArray(objeto0["citedSources"]) || objeto0["citedSources"].length <= 0))) ctx.addIssue({ code: 'custom', path: [...ruta, "citedSources"], message: "FollowUpTurn: si status en [\"sin_evidencia\",\"fuera_de_contexto\"] y status presente: citedSources debe cumplir {\"type\":\"array\",\"maxItems\":0}" });
    } else {
      if (tiene(objeto0, "answer") && !((esTipo(objeto0["answer"], "array")) && (!Array.isArray(objeto0["answer"]) || objeto0["answer"].length >= 1))) ctx.addIssue({ code: 'custom', path: [...ruta, "answer"], message: "FollowUpTurn: si no status en [\"sin_evidencia\",\"fuera_de_contexto\"] y status presente: answer debe cumplir {\"type\":\"array\",\"minItems\":1}" });
    }
    if (tiene(objeto0, "answer")) {
      const hijo0 = objeto0["answer"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarSupportedClaim(elemento1, ctx, [...[...ruta, "answer"], indice1]);
        });
      }
    }
    if (tiene(objeto0, "citedSources")) {
      const hijo0 = objeto0["citedSources"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarFollowUpCitedSource(elemento1, ctx, [...[...ruta, "citedSources"], indice1]);
        });
      }
    }
  }
}
function verificarPatientSearchRequest(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (!((tiene(objeto0, "idType") && tiene(objeto0, "nationalId")) || (tiene(objeto0, "name")))) ctx.addIssue({ code: 'custom', path: [...ruta], message: "PatientSearchRequest: debe cumplir al menos una alternativa: idType presente y nationalId presente o name presente" });
  }
}
function verificarSourceApplicability(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (tiene(objeto0, "criteria")) {
      const hijo0 = objeto0["criteria"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarApplicabilityCriterion(elemento1, ctx, [...[...ruta, "criteria"], indice1]);
        });
      }
    }
  }
}
function verificarSupportedClaim(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (!(((!tiene(objeto0, "citedSources") || ((esTipo(objeto0["citedSources"], "array")) && (!Array.isArray(objeto0["citedSources"]) || objeto0["citedSources"].length >= 1)))) || ((!tiene(objeto0, "patientDataRefs") || ((esTipo(objeto0["patientDataRefs"], "array")) && (!Array.isArray(objeto0["patientDataRefs"]) || objeto0["patientDataRefs"].length >= 1)))))) ctx.addIssue({ code: 'custom', path: [...ruta], message: "SupportedClaim: debe cumplir al menos una alternativa: citedSources: {\"type\":\"array\",\"minItems\":1} o patientDataRefs: {\"type\":\"array\",\"minItems\":1}" });
    if (tiene(objeto0, "citedSources")) {
      const hijo0 = objeto0["citedSources"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarCitedSource(elemento1, ctx, [...[...ruta, "citedSources"], indice1]);
        });
      }
    }
  }
}
function verificarSynthesis(valor: unknown, ctx: Contexto, ruta: Ruta): void {
  if (esObjeto(valor)) {
    const objeto0 = valor;
    if (tiene(objeto0, "agreements")) {
      const hijo0 = objeto0["agreements"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          verificarSupportedClaim(elemento1, ctx, [...[...ruta, "agreements"], indice1]);
        });
      }
    }
    if (tiene(objeto0, "discrepancies")) {
      const hijo0 = objeto0["discrepancies"];
      if (Array.isArray(hijo0)) {
        hijo0.forEach((elemento1: unknown, indice1: number) => {
          if (esObjeto(elemento1)) {
            const objeto2 = elemento1;
            if (tiene(objeto2, "claim")) {
              const hijo2 = objeto2["claim"];
              verificarSupportedClaim(hijo2, ctx, [...[...[...ruta, "discrepancies"], indice1], "claim"]);
            }
          }
        });
      }
    }
  }
}
export const zApplicabilityCriterionRefinado = z.unknown().superRefine((valor, ctx) => verificarApplicabilityCriterion(valor, ctx, [])).pipe(zApplicabilityCriterion);
export const zCitedSourceRefinado = z.unknown().superRefine((valor, ctx) => verificarCitedSource(valor, ctx, [])).pipe(zCitedSource);
export const zEvidenceAnalysisRefinado = z.unknown().superRefine((valor, ctx) => verificarEvidenceAnalysis(valor, ctx, [])).pipe(zEvidenceAnalysis);
export const zEvidenceAnalysisRequestRefinado = z.unknown().superRefine((valor, ctx) => verificarEvidenceAnalysisRequest(valor, ctx, [])).pipe(zEvidenceAnalysisRequest);
export const zEvidenceOptionRefinado = z.unknown().superRefine((valor, ctx) => verificarEvidenceOption(valor, ctx, [])).pipe(zEvidenceOption);
export const zFollowUpCitedSourceRefinado = z.unknown().superRefine((valor, ctx) => verificarFollowUpCitedSource(valor, ctx, [])).pipe(zFollowUpCitedSource);
export const zFollowUpTurnRefinado = z.unknown().superRefine((valor, ctx) => verificarFollowUpTurn(valor, ctx, [])).pipe(zFollowUpTurn);
export const zPatientSearchRequestRefinado = z.unknown().superRefine((valor, ctx) => verificarPatientSearchRequest(valor, ctx, [])).pipe(zPatientSearchRequest);
export const zSourceApplicabilityRefinado = z.unknown().superRefine((valor, ctx) => verificarSourceApplicability(valor, ctx, [])).pipe(zSourceApplicability);
export const zSupportedClaimRefinado = z.unknown().superRefine((valor, ctx) => verificarSupportedClaim(valor, ctx, [])).pipe(zSupportedClaim);
export const zSynthesisRefinado = z.unknown().superRefine((valor, ctx) => verificarSynthesis(valor, ctx, [])).pipe(zSynthesis);
