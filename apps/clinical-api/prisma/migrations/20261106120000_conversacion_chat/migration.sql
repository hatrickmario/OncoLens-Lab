-- L1D-315 (US-258), ADR-51 §3: conversación del oncólogo sobre un paciente y sus turnos. docs/architecture/data-model.md §7.1.
-- Aditiva: dos tablas nuevas; ninguna existente cambia. Sin pseudoPatientId ni identidad (RN-10, RN-11).

-- CreateTable
CREATE TABLE "clinical"."conversation" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."conversation_turn" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "question_masked" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "about_turn_id" UUID,
    "blocks" JSONB NOT NULL,
    "data_links" JSONB NOT NULL,
    "omitted_claims" INTEGER NOT NULL DEFAULT 0,
    "notices" JSONB NOT NULL,
    "data_used" JSONB NOT NULL,
    "data_missing" JSONB NOT NULL,
    "analysis_id" UUID,
    "structured_state" JSONB NOT NULL,
    "llm_provider" TEXT NOT NULL,
    "llm_model" TEXT,
    "prompt_version" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_turn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversation_thread_id_key" ON "clinical"."conversation"("thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_turn_conversation_id_turn_number_key" ON "clinical"."conversation_turn"("conversation_id", "turn_number");

-- AddForeignKey
ALTER TABLE "clinical"."conversation" ADD CONSTRAINT "conversation_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."conversation" ADD CONSTRAINT "conversation_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."conversation_turn" ADD CONSTRAINT "conversation_turn_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "clinical"."conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."conversation_turn" ADD CONSTRAINT "conversation_turn_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- §7.1: CHECK copiados del documento (RN-12 en llm_provider).
ALTER TABLE clinical.conversation_turn
  ADD CONSTRAINT conversation_turn_turn_number_ck CHECK (turn_number >= 1),
  ADD CONSTRAINT conversation_turn_intent_ck CHECK (intent IN ('caso', 'faltantes', 'evidencia', 'fuentes_limitaciones', 'no_clasificada', 'fuera_de_alcance')),
  ADD CONSTRAINT conversation_turn_llm_provider_ck CHECK (llm_provider IN ('local', 'nube'));

-- §7.1 / RN-06: el turno registrado es inmutable (misma función que ai_analysis_record y analysis_follow_up).
CREATE TRIGGER conversation_turn_inmutable
  BEFORE UPDATE ON clinical.conversation_turn
  FOR EACH ROW EXECUTE FUNCTION clinical.rechazar_actualizacion();
