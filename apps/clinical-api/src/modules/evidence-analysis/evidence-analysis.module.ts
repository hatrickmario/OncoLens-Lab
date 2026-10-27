import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { AlcanceDelCorpus } from '../../config/index.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { ChecklistDelPaciente, CompletenessService } from '../completeness/ports.js';
import { crearBaseDelAnalisis } from './analysis-basis.js';
import { crearAnalysisCompletion } from './analysis-completion.js';
import { evidenceAnalysisController } from './evidence-analysis.controller.js';
import { createEvidenceAnalysisRepository } from './evidence-analysis.repository.js';
import {
  crearEvidenceAnalysisService,
  type ConfiguracionDelAnalisis,
} from './evidence-analysis.service.js';
import {
  ChecklistNoDisponibleError,
  type CatalogVersionProvider,
  type ChecklistDeFaltantes,
  type ContextDeidentifier,
  type TraceIdGenerator,
  type RagQueryClient,
  type TiposDeCancerHabilitados,
} from './ports.js';

export interface ConfiguracionDelGateway extends ConfiguracionDelAnalisis {
  /** `AI_DISCLAIMER_TEXT` (RN-19, RN-22). */
  aiDisclaimerText: string;
}

export interface DependenciasDelGateway {
  db: Consultador;
  rag: RagQueryClient;
  catalogo: CatalogVersionProvider;
  /** Faltantes críticos del caso (US-006): lo cablea la raíz de composición sobre `CompletenessService`. */
  checklist: ChecklistDeFaltantes;
  config: ConfiguracionDelGateway;
  /** `ENABLED_CANCER_TYPES` ya validada contra el manifiesto (RN-20). */
  tiposHabilitados: TiposDeCancerHabilitados;
  alcanceDelCorpus: AlcanceDelCorpus;
  reloj: Clock;
  traceIds: TraceIdGenerator;
  /** UUID de los `AIAnalysisRecord`; distinto de `traceIds`, que solo genera `traceId`. */
  idsDeAnalisis: GeneradorDeIds;
  registrar: Registrar;
  /** Obligatorio y explícito: la raíz de composición decide el desidentificador (`crearContextDeidentifier`, L1D-203). */
  desidentificador: ContextDeidentifier;
}

/** Claves del catálogo en estado `faltante`, en el orden del catálogo (US-002). */
function clavesFaltantes(checklist: ChecklistDelPaciente): readonly string[] {
  return checklist.items.filter((item) => item.status === 'faltante').map((item) => item.key);
}

/**
 * Adaptador del puerto `ChecklistDeFaltantes` sobre `CompletenessService` (US-002): el service del gateway no conoce la
 * forma del checklist. Cualquier error se envuelve sin su mensaje, para que el análisis falle cerrado (US-006 AC-8).
 */
export function crearChecklistDeFaltantes(completitud: CompletenessService): ChecklistDeFaltantes {
  return {
    async faltantes(patientId) {
      try {
        return clavesFaltantes(await completitud.calcular(patientId));
      } catch {
        throw new ChecklistNoDisponibleError();
      }
    },
  };
}

/** Composición del módulo `evidence-analysis`: devuelve el router que se monta detrás del guard de sesión. */
export function componerGatewayDeAnalisis(dependencias: DependenciasDelGateway): Router {
  const repositorio = createEvidenceAnalysisRepository(dependencias.db);
  const service = crearEvidenceAnalysisService({
    casos: repositorio,
    desidentificador: dependencias.desidentificador,
    rag: dependencias.rag,
    cierre: crearAnalysisCompletion({
      analisis: repositorio,
      base: crearBaseDelAnalisis(),
      reloj: dependencias.reloj,
      idsDeAnalisis: dependencias.idsDeAnalisis,
      disclaimer: dependencias.config.aiDisclaimerText,
      alcanceDelCorpus: dependencias.alcanceDelCorpus,
    }),
    tiposHabilitados: dependencias.tiposHabilitados,
    catalogo: dependencias.catalogo,
    checklist: dependencias.checklist,
    reloj: dependencias.reloj,
    config: dependencias.config,
  });
  return evidenceAnalysisController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
