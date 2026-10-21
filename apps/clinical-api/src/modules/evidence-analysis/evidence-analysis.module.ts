import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import { crearBaseDelAnalisis } from './analysis-basis.js';
import { crearAnalysisCompletion } from './analysis-completion.js';
import { evidenceAnalysisController } from './evidence-analysis.controller.js';
import { createEvidenceAnalysisRepository } from './evidence-analysis.repository.js';
import {
  crearEvidenceAnalysisService,
  type ConfiguracionDelAnalisis,
} from './evidence-analysis.service.js';
import type {
  CatalogVersionProvider,
  ContextDeidentifier,
  TraceIdGenerator,
  RagQueryClient,
  TiposDeCancerHabilitados,
} from './ports.js';

export interface ConfiguracionDelGateway extends ConfiguracionDelAnalisis {
  /** `AI_DISCLAIMER_TEXT` (RN-19, RN-22). */
  aiDisclaimerText: string;
}

/** Lo que la Base de un `tipo_no_habilitado` dice del corpus sin consultarlo (US-043 D7, RN-22). */
export interface AlcanceDelCorpus {
  /** `CORPUS_EXCLUDED_SOURCES`. */
  corpusExcludedSources: readonly string[];
  /** `CORPUS_CUTOFF_DATE` (`AAAA-MM-DD`). */
  corpusCutoffDate: string;
}

export interface DependenciasDelGateway {
  db: Consultador;
  rag: RagQueryClient;
  catalogo: CatalogVersionProvider;
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
    }),
    catalogo: dependencias.catalogo,
    reloj: dependencias.reloj,
    config: dependencias.config,
  });
  return evidenceAnalysisController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
