import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import { crearBaseDelAnalisisS1 } from './analysis-basis.js';
import { crearAnalysisCompletion } from './analysis-completion.js';
import { crearDesidentificadorProvisional } from './context-deidentifier.provisional.js';
import { evidenceAnalysisController } from './evidence-analysis.controller.js';
import { createEvidenceAnalysisRepository } from './evidence-analysis.repository.js';
import {
  crearEvidenceAnalysisService,
  type ConfiguracionDelAnalisis,
} from './evidence-analysis.service.js';
import type {
  CatalogVersionProvider,
  ContextDeidentifier,
  IdGenerator,
  PseudonymGenerator,
  RagQueryClient,
} from './ports.js';

export interface ConfiguracionDelGateway extends ConfiguracionDelAnalisis {
  /** `APP_ENV`: el desidentificador provisional solo admite `local` y `test`. */
  appEnv: string | undefined;
  /** `AI_DISCLAIMER_TEXT` (RN-19, RN-22). */
  aiDisclaimerText: string;
  /** `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT` (`[S1 resp. 30]`). */
  analysisBasisAssumptionText: string;
}

export interface DependenciasDelGateway {
  db: Consultador;
  rag: RagQueryClient;
  catalogo: CatalogVersionProvider;
  config: ConfiguracionDelGateway;
  reloj: Clock;
  ids: IdGenerator;
  /** UUID de los `AIAnalysisRecord`; distinto de `ids`, que solo genera `traceId`. */
  idsDeAnalisis: GeneradorDeIds;
  pseudonimos: PseudonymGenerator;
  registrar: Registrar;
  /** Sustituye al provisional (L1D-203). */
  deidentificador?: ContextDeidentifier;
}

/** Composición del módulo `evidence-analysis`: devuelve el router que se monta detrás del guard de sesión. */
export function componerGatewayDeAnalisis(dependencias: DependenciasDelGateway): Router {
  const repositorio = createEvidenceAnalysisRepository(dependencias.db);
  const service = crearEvidenceAnalysisService({
    casos: repositorio,
    deidentificador:
      dependencias.deidentificador ??
      crearDesidentificadorProvisional({
        pseudonimos: dependencias.pseudonimos,
        appEnv: dependencias.config.appEnv,
      }),
    rag: dependencias.rag,
    cierre: crearAnalysisCompletion({
      analisis: repositorio,
      base: crearBaseDelAnalisisS1({
        textoDelSupuesto: dependencias.config.analysisBasisAssumptionText,
      }),
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
    ids: dependencias.ids,
    registrar: dependencias.registrar,
  });
}
