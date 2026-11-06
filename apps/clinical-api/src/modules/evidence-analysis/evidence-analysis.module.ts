import type { Router } from 'express';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { AlcanceDelCorpus } from '../../config/index.js';
import type { Consultador } from '../auth/auth.repository.js';
import { faltantesDe } from '../completeness/completeness.rules.js';
import type { ChecklistDelPaciente, CompletenessService } from '../completeness/ports.js';
import { crearBaseDelAnalisis } from './analysis-basis.js';
import { crearAnalysisCompletion } from './analysis-completion.js';
import { evidenceAnalysisController } from './evidence-analysis.controller.js';
import { conversationController } from './conversation/conversation.controller.js';
import { crearConversationRepository } from './conversation/conversation.repository.js';
import {
  crearConversationService,
  type ConversationService,
} from './conversation/conversation.service.js';
import { componerModuloDeOptOuts } from '../opt-outs/opt-outs.module.js';
import { followUpController } from './follow-up.controller.js';
import { crearFollowUpRepository, type EjecutarEnTransaccion } from './follow-up.repository.js';
import { crearFollowUpService, type FollowUpService } from './follow-up.service.js';
import {
  createEvidenceAnalysisRepository,
  type AnalisisRepository,
  type CasoRepository,
} from './evidence-analysis.repository.js';
import {
  crearEvidenceAnalysisService,
  type ConfiguracionDelAnalisis,
  type EvidenceAnalysisService,
} from './evidence-analysis.service.js';
import {
  ChecklistNoDisponibleError,
  type EtiquetaDeDatoCritico,
  type CatalogVersionProvider,
  type ChatTurnPort,
  type ChecklistDeFaltantes,
  type ChecklistDelChat,
  type ContextDeidentifier,
  type TraceIdGenerator,
  type RagFollowUpPort,
  type RagQueryClient,
} from './ports.js';

export interface ConfiguracionDelGateway extends ConfiguracionDelAnalisis {
  /** `AI_DISCLAIMER_TEXT` (RN-19, RN-22). */
  aiDisclaimerText: string;
  /** `CHAT_REHYDRATE_TURNS` (RN-22): turnos que se reenvían a rag-orchestrator al rehidratar un hilo desconocido. */
  chatRehydrateTurns: number;
}

export interface DependenciasDelGateway {
  db: Consultador;
  rag: RagQueryClient;
  /** Cliente de `/rag/follow-up` (US-218). */
  ragFollowUp: RagFollowUpPort;
  /** Cliente de `/chat/turn` (L1D-315, ADR-51). */
  ragChat: ChatTurnPort;
  /** UUID de las conversaciones del chat, de sus turnos y de su hilo (`thread_id`, aleatorio): tres generadores. */
  idsDeConversaciones: GeneradorDeIds;
  idsDeTurnosDeChat: GeneradorDeIds;
  idsDeHilos: GeneradorDeIds;
  /** Ítems del checklist para el chat (L1D-315): lo cablea la raíz de composición sobre `CompletenessService`. */
  checklistDelChat: ChecklistDelChat;
  /** Transacción sobre una conexión: el turno de seguimiento se inserta bajo bloqueo del análisis. */
  enTransaccion: EjecutarEnTransaccion;
  /** UUID de los turnos de seguimiento; distinto de `idsDeAnalisis`. */
  idsDeTurnos: GeneradorDeIds;
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
  /** `label.es` del catálogo montado para el inciso (b) de la Base (US-128). */
  etiquetaDe: EtiquetaDeDatoCritico;
}

/** Claves del catálogo en estado `faltante`, en el orden del catálogo (US-002). */
function clavesFaltantes(checklist: ChecklistDelPaciente): readonly string[] {
  return faltantesDe(checklist).map((item) => item.key);
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

/** Destino del ítem como texto: `entidad` o `entidad.campo` (nombres del catálogo, nunca valores del paciente). */
const destinoDelItem = ({ entity, field }: { entity: string; field: string | null }): string =>
  field === null ? entity : `${entity}.${field}`;

/**
 * Adaptador del puerto `ChecklistDelChat` sobre `CompletenessService` (L1D-315): `gapType` es `no_encontrado` solo en un
 * faltante y `null` en un dato presente; los tipos finos de faltante llegan con L1D-320. Falla cerrado como
 * `crearChecklistDeFaltantes`.
 */
export function crearChecklistDelChat(completitud: CompletenessService): ChecklistDelChat {
  return {
    async items(patientId) {
      try {
        const checklist = await completitud.calcular(patientId);
        return checklist.items.map((item) => ({
          item: item.key,
          label: item.label,
          status: item.status,
          gapType: item.status === 'faltante' ? ('no_encontrado' as const) : null,
          destination: destinoDelItem(item.destination),
        }));
      } catch {
        throw new ChecklistNoDisponibleError();
      }
    },
  };
}

/** Servicio de la conversación (L1D-315): comparte desidentificador, catálogo, reloj y configuración con el gateway. */
function componerConversacion(
  dependencias: DependenciasDelGateway,
  casos: CasoRepository,
): ConversationService {
  const { ragTimeoutMs, chatRehydrateTurns } = dependencias.config;
  return crearConversationService({
    conversaciones: crearConversationRepository(dependencias.db, dependencias.enTransaccion),
    casos,
    checklist: dependencias.checklistDelChat,
    desidentificador: dependencias.desidentificador,
    rag: dependencias.ragChat,
    catalogo: dependencias.catalogo,
    reloj: dependencias.reloj,
    idsDeConversaciones: dependencias.idsDeConversaciones,
    idsDeTurnos: dependencias.idsDeTurnosDeChat,
    idsDeHilos: dependencias.idsDeHilos,
    config: { ragTimeoutMs, chatRehydrateTurns },
  });
}

/** Servicio del seguimiento (US-218): comparte desidentificador, catálogo, reloj y configuración con el gateway. */
function componerSeguimiento(dependencias: DependenciasDelGateway): FollowUpService {
  const { analysisFollowupMax, ragTimeoutMs, aiDisclaimerText } = dependencias.config;
  return crearFollowUpService({
    seguimientos: crearFollowUpRepository(dependencias.db, dependencias.enTransaccion),
    desidentificador: dependencias.desidentificador,
    rag: dependencias.ragFollowUp,
    catalogo: dependencias.catalogo,
    reloj: dependencias.reloj,
    idsDeTurnos: dependencias.idsDeTurnos,
    config: { analysisFollowupMax, ragTimeoutMs, aiDisclaimerText },
  });
}

/** Servicio del análisis de evidencia: el cierre persiste el `AIAnalysisRecord` antes de responder (RN-06). */
function componerAnalisis(
  dependencias: DependenciasDelGateway,
  repositorio: CasoRepository & AnalisisRepository,
): EvidenceAnalysisService {
  return crearEvidenceAnalysisService({
    casos: repositorio,
    desidentificador: dependencias.desidentificador,
    rag: dependencias.rag,
    cierre: crearAnalysisCompletion({
      analisis: repositorio,
      base: crearBaseDelAnalisis({
        etiquetaDe: dependencias.etiquetaDe,
        maxFollowUps: dependencias.config.analysisFollowupMax,
      }),
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
}

/** Composición del módulo `evidence-analysis`: devuelve el router que se monta detrás del guard de sesión. */
export function componerGatewayDeAnalisis(dependencias: DependenciasDelGateway): Router {
  const repositorio = createEvidenceAnalysisRepository(dependencias.db);
  const service = componerAnalisis(dependencias, repositorio);
  const { guardia: guardiaDeOptOut } = componerModuloDeOptOuts({
    db: dependencias.db,
    registrar: dependencias.registrar,
  });
  const router = evidenceAnalysisController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
    guardiaDeOptOut,
  });
  const conSeguimiento = followUpController(
    {
      service: componerSeguimiento(dependencias),
      traceIds: dependencias.traceIds,
      registrar: dependencias.registrar,
      guardiaDeOptOut,
    },
    router,
  );
  return conversationController(
    {
      service: componerConversacion(dependencias, repositorio),
      traceIds: dependencias.traceIds,
      registrar: dependencias.registrar,
      guardiaDeOptOut,
    },
    conSeguimiento,
  );
}
