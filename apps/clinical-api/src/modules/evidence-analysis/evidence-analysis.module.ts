import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import { crearDesidentificadorProvisional } from './context-deidentifier.provisional.js';
import { evidenceAnalysisController } from './evidence-analysis.controller.js';
import { createEvidenceAnalysisRepository } from './evidence-analysis.repository.js';
import {
  crearEvidenceAnalysisService,
  type ConfiguracionDelAnalisis,
} from './evidence-analysis.service.js';
import type {
  AnalysisCompletion,
  CatalogVersionProvider,
  ContextDeidentifier,
  IdGenerator,
  PseudonymGenerator,
  RagQueryClient,
} from './ports.js';

export interface ConfiguracionDelGateway extends ConfiguracionDelAnalisis {
  /** `APP_ENV`: el desidentificador provisional solo admite `local` y `test`. */
  appEnv: string | undefined;
}

export interface DependenciasDelGateway {
  db: Consultador;
  rag: RagQueryClient;
  catalogo: CatalogVersionProvider;
  config: ConfiguracionDelGateway;
  reloj: Clock;
  ids: IdGenerator;
  pseudonimos: PseudonymGenerator;
  registrar: Registrar;
  /** Sustituye al provisional (L1D-203). */
  deidentificador?: ContextDeidentifier;
  /** Sustituye al provisional (L1D-104). */
  cierre?: AnalysisCompletion;
}

/** Composición del módulo `evidence-analysis`: devuelve el router que se monta detrás del guard de sesión. */
export function componerGatewayDeAnalisis(dependencias: DependenciasDelGateway): Router {
  const service = crearEvidenceAnalysisService({
    casos: createEvidenceAnalysisRepository(dependencias.db),
    deidentificador:
      dependencias.deidentificador ??
      crearDesidentificadorProvisional({
        pseudonimos: dependencias.pseudonimos,
        appEnv: dependencias.config.appEnv,
      }),
    rag: dependencias.rag,
    cierre: dependencias.cierre ?? {
      completar() {
        throw new Error('no implementado');
      },
    },
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
