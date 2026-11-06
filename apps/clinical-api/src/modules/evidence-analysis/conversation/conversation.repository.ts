import type {
  ChatBlock,
  ConversationDataLink,
} from '../../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ChatIntent,
  StructuredState,
} from '../../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Consultador } from '../../auth/auth.repository.js';
import type { EjecutarEnTransaccion } from '../follow-up.repository.js';
import type { Fila } from '../evidence-analysis.repository.js';

/** Fila de `clinical.conversation` (data-model §7.1), en camelCase. `threadId` solo sale hacia rag-orchestrator. */
export interface Conversacion {
  id: string;
  patientId: string;
  threadId: string;
  createdBy: string;
  createdAt: Date;
}

/** Fila de `clinical.conversation_turn`: inmutable, sin seudónimo ni identidad (RN-10, RN-11). */
export interface TurnoDeConversacion {
  id: string;
  conversationId: string;
  turnNumber: number;
  /** Pregunta normalizada y enmascarada: la misma cadena que viajó a `/chat/turn`. */
  questionMasked: string;
  intent: ChatIntent;
  aboutTurnId: string | null;
  blocks: ChatBlock[];
  dataLinks: ConversationDataLink[];
  omittedClaims: number;
  notices: string[];
  dataUsed: string[];
  dataMissing: string[];
  analysisId: string | null;
  structuredState: StructuredState;
  llmProvider: 'local' | 'nube';
  llmModel: string | null;
  promptVersion: string | null;
  /** El `traceId` propio del turno. */
  traceId: string;
  createdAt: Date;
}

/** El turno a insertar: `turnNumber` lo calcula el repository dentro de la transacción. */
export type TurnoNuevo = Omit<TurnoDeConversacion, 'turnNumber'>;

export interface ConversationRepository {
  existePaciente(patientId: string): Promise<boolean>;
  insertarConversacion(conversacion: Conversacion): Promise<Conversacion>;
  /** `null` si no existe. */
  leerConversacion(conversationId: string): Promise<Conversacion | null>;
  /** En orden de `turnNumber`. */
  listarTurnos(conversationId: string): Promise<TurnoDeConversacion[]>;
  /** Inserta bajo bloqueo de la conversación con `turn_number = max + 1` y devuelve la fila leída. */
  insertarTurno(turno: TurnoNuevo): Promise<TurnoDeConversacion>;
}

const aJson = (valor: unknown): string => JSON.stringify(valor);

function conversacionDeFila(f: Fila): Conversacion {
  return {
    id: f['id'] as string,
    patientId: f['patient_id'] as string,
    threadId: f['thread_id'] as string,
    createdBy: f['created_by'] as string,
    createdAt: f['created_at'] as Date,
  };
}

/** El turno tal como quedó en la fila (jsonb ya parseado por `pg`): de aquí sale la respuesta `201` (RN-06). */
function turnoDeFila(f: Fila): TurnoDeConversacion {
  return {
    id: f['id'] as string,
    conversationId: f['conversation_id'] as string,
    turnNumber: f['turn_number'] as number,
    questionMasked: f['question_masked'] as string,
    intent: f['intent'] as ChatIntent,
    aboutTurnId: f['about_turn_id'] as string | null,
    blocks: f['blocks'] as ChatBlock[],
    dataLinks: f['data_links'] as ConversationDataLink[],
    omittedClaims: f['omitted_claims'] as number,
    notices: f['notices'] as string[],
    dataUsed: f['data_used'] as string[],
    dataMissing: f['data_missing'] as string[],
    analysisId: f['analysis_id'] as string | null,
    structuredState: f['structured_state'] as StructuredState,
    llmProvider: f['llm_provider'] as 'local' | 'nube',
    llmModel: f['llm_model'] as string | null,
    promptVersion: f['prompt_version'] as string | null,
    traceId: f['trace_id'] as string,
    createdAt: f['created_at'] as Date,
  };
}

/** `turn_number` lo calcula la propia sentencia (`max + 1` de la conversación) dentro de la transacción que la bloquea. */
const INSERTAR_TURNO = `
  INSERT INTO clinical.conversation_turn (
    id, conversation_id, turn_number, question_masked, intent, about_turn_id, blocks, data_links, omitted_claims,
    notices, data_used, data_missing, analysis_id, structured_state, llm_provider, llm_model, prompt_version, trace_id,
    created_at
  ) VALUES (
    $1, $2, (SELECT COALESCE(MAX(turn_number), 0) + 1 FROM clinical.conversation_turn WHERE conversation_id = $2),
    $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13::jsonb, $14, $15, $16, $17, $18
  ) RETURNING *`;

function parametrosDelTurno(t: TurnoNuevo): unknown[] {
  return [
    t.id,
    t.conversationId,
    t.questionMasked,
    t.intent,
    t.aboutTurnId,
    aJson(t.blocks),
    aJson(t.dataLinks),
    t.omittedClaims,
    aJson(t.notices),
    aJson(t.dataUsed),
    aJson(t.dataMissing),
    t.analysisId,
    aJson(t.structuredState),
    t.llmProvider,
    t.llmModel,
    t.promptVersion,
    t.traceId,
    t.createdAt,
  ];
}

/** Dos turnos simultáneos de una conversación se serializan bloqueando su fila (no se actualiza: solo se bloquea). */
function insertarTurnoBajoBloqueo(
  enTransaccion: EjecutarEnTransaccion,
  turno: TurnoNuevo,
): Promise<TurnoDeConversacion> {
  return enTransaccion(async (tx: Consultador) => {
    await tx.query('SELECT id FROM clinical.conversation WHERE id = $1 FOR UPDATE', [
      turno.conversationId,
    ]);
    const { rows } = await tx.query(INSERTAR_TURNO, parametrosDelTurno(turno));
    return turnoDeFila(rows[0] ?? {});
  });
}

/** Lectura y escritura de `clinical.conversation` y `clinical.conversation_turn` con `pg` sobre el pool inyectado. */
export function crearConversationRepository(
  db: Consultador,
  enTransaccion: EjecutarEnTransaccion,
): ConversationRepository {
  return {
    async existePaciente(patientId) {
      const { rows } = await db.query('SELECT 1 FROM clinical.patient WHERE id = $1', [patientId]);
      return rows.length > 0;
    },
    async insertarConversacion(conversacion) {
      const { rows } = await db.query(
        `INSERT INTO clinical.conversation (id, patient_id, thread_id, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
          conversacion.id,
          conversacion.patientId,
          conversacion.threadId,
          conversacion.createdBy,
          conversacion.createdAt,
        ],
      );
      return conversacionDeFila(rows[0] ?? {});
    },
    async leerConversacion(conversationId) {
      const { rows } = await db.query('SELECT * FROM clinical.conversation WHERE id = $1', [
        conversationId,
      ]);
      const fila = rows[0];
      return fila === undefined ? null : conversacionDeFila(fila);
    },
    async listarTurnos(conversationId) {
      const { rows } = await db.query(
        'SELECT * FROM clinical.conversation_turn WHERE conversation_id = $1 ORDER BY turn_number',
        [conversationId],
      );
      return rows.map(turnoDeFila);
    },
    insertarTurno: (turno) => insertarTurnoBajoBloqueo(enTransaccion, turno),
  };
}
