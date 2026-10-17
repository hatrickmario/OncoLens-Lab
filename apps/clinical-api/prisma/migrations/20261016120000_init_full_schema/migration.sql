-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clinical";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "research";

-- CreateEnum
CREATE TYPE "auth"."account_status" AS ENUM ('pendiente', 'activo', 'desactivado', 'rechazado');

-- CreateEnum
CREATE TYPE "identity"."id_type" AS ENUM ('cedula_ciudadania', 'tarjeta_identidad', 'cedula_extranjeria', 'pasaporte', 'seudonimo', 'sintetico');

-- CreateEnum
CREATE TYPE "identity"."relationship" AS ENUM ('madre', 'padre', 'tutor_legal');

-- CreateEnum
CREATE TYPE "clinical"."data_origin" AS ENUM ('sintetico', 'real_anonimizado', 'real_identificado');

-- CreateEnum
CREATE TYPE "clinical"."population" AS ENUM ('adulto', 'pediatrico');

-- CreateEnum
CREATE TYPE "clinical"."lifecycle_status" AS ENUM ('activo', 'egresado');

-- CreateEnum
CREATE TYPE "clinical"."care_role" AS ENUM ('oncologo', 'cirujano', 'radiooncologo', 'otro');

-- CreateEnum
CREATE TYPE "clinical"."opt_out_type" AS ENUM ('analisis_ia', 'investigacion');

-- CreateEnum
CREATE TYPE "clinical"."opt_out_action" AS ENUM ('registrado', 'revocado');

-- CreateEnum
CREATE TYPE "clinical"."intake_draft_status" AS ENUM ('pendiente', 'confirmado', 'descartado', 'expirado');

-- CreateEnum
CREATE TYPE "clinical"."entry_method" AS ENUM ('ocr', 'manual', 'manual_correction', 'seed');

-- CreateEnum
CREATE TYPE "clinical"."mapping_status" AS ENUM ('mapeado', 'no_mapeado');

-- CreateEnum
CREATE TYPE "clinical"."event_mapping_status" AS ENUM ('mapeado', 'no_mapeado', 'n_a');

-- CreateEnum
CREATE TYPE "clinical"."extraction_confidence" AS ENUM ('alta', 'media', 'baja', 'n_a');

-- CreateEnum
CREATE TYPE "clinical"."review_status" AS ENUM ('auto_aceptado', 'requiere_revision', 'verificado', 'corregido', 'rechazado', 'reemplazado');

-- CreateEnum
CREATE TYPE "clinical"."note_type" AS ENUM ('antecedente', 'comorbilidad', 'alergia', 'antecedente_familiar', 'nota_libre');

-- CreateEnum
CREATE TYPE "clinical"."performance_scale" AS ENUM ('ECOG', 'Karnofsky', 'Lansky');

-- CreateEnum
CREATE TYPE "clinical"."result_type" AS ENUM ('cuantitativo', 'cualitativo');

-- CreateEnum
CREATE TYPE "clinical"."clinical_significance" AS ENUM ('normal', 'alterado', 'relevante', 'crítico');

-- CreateEnum
CREATE TYPE "clinical"."significance_source" AS ENUM ('documento', 'regla', 'inferido_ia');

-- CreateEnum
CREATE TYPE "clinical"."document_type" AS ENUM ('historia_clinica', 'examen');

-- CreateEnum
CREATE TYPE "clinical"."ocr_status" AS ENUM ('pendiente', 'procesando', 'completado', 'error', 'cuarentena_pii', 'requiere_revision_identidad');

-- CreateEnum
CREATE TYPE "clinical"."treatment_status" AS ENUM ('activo', 'completado', 'suspendido');

-- CreateEnum
CREATE TYPE "clinical"."end_reason" AS ENUM ('progresion', 'toxicidad', 'completado', 'otro', 'desconocido');

-- CreateEnum
CREATE TYPE "clinical"."event_type" AS ENUM ('cirugia', 'procedimiento', 'respuesta', 'progresion', 'toxicidad', 'recaida', 'evolucion');

-- CreateEnum
CREATE TYPE "clinical"."date_precision" AS ENUM ('dia', 'mes', 'anio', 'incierta');

-- CreateEnum
CREATE TYPE "clinical"."data_source_type" AS ENUM ('biomarker', 'diagnosis', 'clinical_event', 'prior_treatment', 'clinical_attribute');

-- CreateEnum
CREATE TYPE "clinical"."analysis_type" AS ENUM ('analisis_evidencia', 'resumen_caso');

-- CreateEnum
CREATE TYPE "clinical"."analysis_status" AS ENUM ('con_evidencia', 'sin_evidencia', 'tipo_no_habilitado');

-- CreateTable
CREATE TABLE "auth"."user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "account_status" "auth"."account_status" NOT NULL,
    "failed_login_count" INTEGER NOT NULL,
    "locked_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "auth"."session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "revoked" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."patient_identity" (
    "patient_id" UUID NOT NULL,
    "id_type" "identity"."id_type" NOT NULL,
    "issuing_country" TEXT,
    "national_id_ciphertext" BYTEA NOT NULL,
    "national_id_hmac" TEXT NOT NULL,
    "full_name_ciphertext" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,

    CONSTRAINT "patient_identity_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "identity"."legal_representative" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "relationship" "identity"."relationship" NOT NULL,
    "id_type" "identity"."id_type" NOT NULL,
    "national_id_ciphertext" BYTEA NOT NULL,
    "national_id_hmac" TEXT NOT NULL,
    "full_name_ciphertext" BYTEA NOT NULL,
    "registered_at" TIMESTAMPTZ(6) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,

    CONSTRAINT "legal_representative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."patient" (
    "id" UUID NOT NULL,
    "data_origin" "clinical"."data_origin" NOT NULL,
    "source_dataset" TEXT,
    "agreement_reference" TEXT,
    "birth_year" INTEGER NOT NULL,
    "sex" TEXT NOT NULL,
    "population" "clinical"."population" NOT NULL,
    "lifecycle_status" "clinical"."lifecycle_status" NOT NULL,
    "retention_start" DATE NOT NULL,
    "retention_until" DATE NOT NULL,
    "retention_max" DATE NOT NULL,
    "requires_ratification" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."care_episode" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),
    "closure_reason" TEXT,
    "opened_by" UUID NOT NULL,
    "closed_by" UUID,

    CONSTRAINT "care_episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."care_team_member" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "care_role" "clinical"."care_role" NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "unassigned_at" TIMESTAMPTZ(6),

    CONSTRAINT "care_team_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."patient_opt_out" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "opt_out_type" "clinical"."opt_out_type" NOT NULL,
    "action" "clinical"."opt_out_action" NOT NULL,
    "external_reference" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patient_opt_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."intake_draft" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "suggested_fields" JSONB NOT NULL,
    "status" "clinical"."intake_draft_status" NOT NULL,
    "created_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "intake_draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."diagnosis" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "cancer_type" TEXT NOT NULL,
    "icd10_code" TEXT,
    "mapping_status" "clinical"."mapping_status" NOT NULL,
    "histology" TEXT NOT NULL,
    "histology_code" TEXT,
    "grade" TEXT,
    "staging_system" TEXT,
    "stage_value" TEXT,
    "performance_scale" "clinical"."performance_scale",
    "performance_value" INTEGER,
    "diagnosed_at" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "extraction_score" DOUBLE PRECISION,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "conflicts_with_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_note" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "created_by" UUID NOT NULL,
    "note_type" "clinical"."note_type" NOT NULL,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "content" TEXT NOT NULL,
    "recorded_at" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."exam" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "exam_type" TEXT NOT NULL,
    "source_lab" TEXT,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "performed_at" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."biomarker" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "loinc_code" TEXT,
    "mapping_status" "clinical"."mapping_status" NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "normalized_unit" TEXT,
    "reference_range" TEXT NOT NULL,
    "result_type" "clinical"."result_type" NOT NULL,
    "clinical_significance" "clinical"."clinical_significance" NOT NULL,
    "significance_source" "clinical"."significance_source" NOT NULL,
    "extraction_score" DOUBLE PRECISION,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "conflicts_with_id" UUID,
    "source_span" JSONB NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "biomarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."document" (
    "id" UUID NOT NULL,
    "patient_id" UUID,
    "episode_id" UUID,
    "document_type" "clinical"."document_type" NOT NULL,
    "object_storage_key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "ocr_status" "clinical"."ocr_status" NOT NULL,
    "pii_finding_types" TEXT,
    "attempts" INTEGER NOT NULL,
    "processing_started_at" TIMESTAMPTZ(6),
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL,
    "extracted_at" TIMESTAMPTZ(6),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."treatment" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "based_on_analysis_id" UUID,
    "decided_by" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "atc_codes" TEXT[],
    "mapping_status" "clinical"."mapping_status" NOT NULL,
    "status" "clinical"."treatment_status" NOT NULL,
    "started_at" DATE NOT NULL,
    "ended_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."prior_treatment" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "line_number" INTEGER,
    "setting" TEXT NOT NULL,
    "regimen_name" TEXT NOT NULL,
    "atc_codes" TEXT[],
    "cups_code" TEXT,
    "mapping_status" "clinical"."mapping_status" NOT NULL,
    "started_at" DATE,
    "ended_at" DATE,
    "ongoing" BOOLEAN NOT NULL,
    "end_reason" "clinical"."end_reason" NOT NULL,
    "best_response" TEXT,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "source_span" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prior_treatment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_event" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "event_type" "clinical"."event_type" NOT NULL,
    "event_date" DATE,
    "date_precision" "clinical"."date_precision" NOT NULL,
    "description" TEXT NOT NULL,
    "icd10_code" TEXT,
    "cups_code" TEXT,
    "mapping_status" "clinical"."event_mapping_status" NOT NULL,
    "toxicity_grade" TEXT,
    "prior_treatment_id" UUID,
    "treatment_id" UUID,
    "analysis_id" UUID,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "source_span" JSONB,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_attribute" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "source_document_id" UUID,
    "attribute_key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "observed_at" DATE,
    "date_precision" "clinical"."date_precision" NOT NULL,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "source_span" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."clinical_data_source" (
    "id" UUID NOT NULL,
    "data_type" "clinical"."data_source_type" NOT NULL,
    "data_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "source_span" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_data_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."ai_analysis_record" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "episode_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "analysis_type" "clinical"."analysis_type" NOT NULL,
    "trace_id" TEXT NOT NULL,
    "query_text" TEXT,
    "question_template_id" TEXT,
    "query_language" TEXT NOT NULL,
    "response_language" TEXT NOT NULL,
    "sources_selected" JSONB NOT NULL,
    "filters_applied" JSONB NOT NULL,
    "synthesis" JSONB NOT NULL,
    "applicability" JSONB NOT NULL,
    "evidence_options" JSONB NOT NULL,
    "discarded_options" JSONB NOT NULL,
    "case_summary" JSONB,
    "analysis_basis" JSONB NOT NULL,
    "agent_steps" JSONB NOT NULL,
    "omitted_claims" INTEGER NOT NULL,
    "missing_critical_data" JSONB NOT NULL,
    "continued_with_warning" BOOLEAN NOT NULL,
    "prior_analyses_used" UUID[],
    "patient_data_links" JSONB NOT NULL,
    "top_relevance_score" DOUBLE PRECISION,
    "status" "clinical"."analysis_status" NOT NULL,
    "clinical_context_snapshot" JSONB NOT NULL,
    "context_fingerprint" TEXT NOT NULL,
    "rerun_of_analysis_id" UUID,
    "data_classification" TEXT NOT NULL,
    "llm_provider" TEXT,
    "llm_model" TEXT,
    "embedding_model" TEXT,
    "reranker_model" TEXT,
    "nli_model" TEXT,
    "prompt_version" TEXT,
    "corpus_release" TEXT,
    "catalog_version" TEXT NOT NULL,
    "retrieval_params" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_analysis_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."analysis_feedback" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "usefulness_rating" INTEGER NOT NULL,
    "missing_data_warning_correct" BOOLEAN,
    "missing_data_warning_useful" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."research_subject_map" (
    "patient_id" UUID NOT NULL,
    "research_subject_id" UUID NOT NULL,

    CONSTRAINT "research_subject_map_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "clinical"."diagnosis_grading" (
    "id" UUID NOT NULL,
    "diagnosis_id" UUID NOT NULL,
    "grading_system" TEXT NOT NULL,
    "specimen_type" TEXT,
    "grade_scope" TEXT,
    "gleason_primary_pattern" INTEGER,
    "gleason_secondary_pattern" INTEGER,
    "gleason_score" INTEGER,
    "isup_grade_group" INTEGER,
    "nottingham_grade" INTEGER,
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "source_document_id" UUID,
    "entry_method" "clinical"."entry_method" NOT NULL,
    "extraction_score" DOUBLE PRECISION,
    "extraction_confidence" "clinical"."extraction_confidence" NOT NULL,
    "review_status" "clinical"."review_status" NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "diagnosis_grading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical"."analysis_follow_up" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "question_text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answer" JSONB NOT NULL,
    "cited_sources" JSONB NOT NULL,
    "omitted_claims" INTEGER NOT NULL DEFAULT 0,
    "patient_data_links" JSONB NOT NULL,
    "data_classification" TEXT NOT NULL,
    "llm_provider" TEXT NOT NULL,
    "llm_model" TEXT NOT NULL,
    "embedding_model" TEXT,
    "reranker_model" TEXT,
    "nli_model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "catalog_version" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_follow_up_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit"."audit_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "ip_address" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research"."episode_snapshot" (
    "id" UUID NOT NULL,
    "research_subject_id" UUID NOT NULL,
    "episode_seq" INTEGER NOT NULL,
    "snapshot_schema_version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "episode_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "auth"."user"("email");

-- CreateIndex
CREATE INDEX "user_account_status_idx" ON "auth"."user"("account_status");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "auth"."role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "auth"."permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "auth"."session"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "patient_identity_blind_index_uq" ON "identity"."patient_identity"("id_type", "issuing_country", "national_id_hmac");

-- CreateIndex
CREATE INDEX "patient_retention_until_idx" ON "clinical"."patient"("retention_until");

-- CreateIndex
CREATE INDEX "patient_opt_out_patient_id_opt_out_type_recorded_at_idx" ON "clinical"."patient_opt_out"("patient_id", "opt_out_type", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "diagnosis_patient_id_is_active_idx" ON "clinical"."diagnosis"("patient_id", "is_active");

-- CreateIndex
CREATE INDEX "diagnosis_review_status_idx" ON "clinical"."diagnosis"("review_status");

-- CreateIndex
CREATE INDEX "diagnosis_mapping_status_idx" ON "clinical"."diagnosis"("mapping_status");

-- CreateIndex
CREATE INDEX "clinical_note_patient_id_note_type_recorded_at_idx" ON "clinical"."clinical_note"("patient_id", "note_type", "recorded_at");

-- CreateIndex
CREATE INDEX "clinical_note_review_status_idx" ON "clinical"."clinical_note"("review_status");

-- CreateIndex
CREATE INDEX "exam_patient_id_performed_at_idx" ON "clinical"."exam"("patient_id", "performed_at");

-- CreateIndex
CREATE INDEX "biomarker_exam_id_loinc_code_idx" ON "clinical"."biomarker"("exam_id", "loinc_code");

-- CreateIndex
CREATE INDEX "biomarker_review_status_idx" ON "clinical"."biomarker"("review_status");

-- CreateIndex
CREATE INDEX "biomarker_mapping_status_idx" ON "clinical"."biomarker"("mapping_status");

-- CreateIndex
CREATE INDEX "document_ocr_status_uploaded_at_idx" ON "clinical"."document"("ocr_status", "uploaded_at");

-- CreateIndex
CREATE UNIQUE INDEX "document_patient_id_checksum_key" ON "clinical"."document"("patient_id", "checksum");

-- CreateIndex
CREATE INDEX "treatment_mapping_status_idx" ON "clinical"."treatment"("mapping_status");

-- CreateIndex
CREATE INDEX "prior_treatment_patient_id_line_number_idx" ON "clinical"."prior_treatment"("patient_id", "line_number");

-- CreateIndex
CREATE INDEX "prior_treatment_review_status_idx" ON "clinical"."prior_treatment"("review_status");

-- CreateIndex
CREATE INDEX "prior_treatment_mapping_status_idx" ON "clinical"."prior_treatment"("mapping_status");

-- CreateIndex
CREATE INDEX "clinical_event_patient_id_event_date_idx" ON "clinical"."clinical_event"("patient_id", "event_date");

-- CreateIndex
CREATE INDEX "clinical_event_review_status_idx" ON "clinical"."clinical_event"("review_status");

-- CreateIndex
CREATE INDEX "clinical_event_mapping_status_idx" ON "clinical"."clinical_event"("mapping_status");

-- CreateIndex
CREATE INDEX "clinical_attribute_patient_id_attribute_key_observed_at_idx" ON "clinical"."clinical_attribute"("patient_id", "attribute_key", "observed_at");

-- CreateIndex
CREATE INDEX "clinical_attribute_review_status_idx" ON "clinical"."clinical_attribute"("review_status");

-- CreateIndex
CREATE INDEX "clinical_data_source_data_type_data_id_idx" ON "clinical"."clinical_data_source"("data_type", "data_id");

-- CreateIndex
CREATE INDEX "ai_analysis_record_patient_id_created_at_idx" ON "clinical"."ai_analysis_record"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_analysis_record_patient_id_analysis_type_created_at_idx" ON "clinical"."ai_analysis_record"("patient_id", "analysis_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "research_subject_map_research_subject_id_key" ON "clinical"."research_subject_map"("research_subject_id");

-- CreateIndex
CREATE INDEX "diagnosis_grading_diagnosis_id_idx" ON "clinical"."diagnosis_grading"("diagnosis_id");

-- CreateIndex
CREATE INDEX "diagnosis_grading_review_status_idx" ON "clinical"."diagnosis_grading"("review_status");

-- CreateIndex
CREATE INDEX "analysis_follow_up_analysis_id_created_at_idx" ON "clinical"."analysis_follow_up"("analysis_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_follow_up_analysis_id_turn_number_key" ON "clinical"."analysis_follow_up"("analysis_id", "turn_number");

-- AddForeignKey
ALTER TABLE "auth"."user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "auth"."role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "auth"."permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."patient_identity" ADD CONSTRAINT "patient_identity_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."legal_representative" ADD CONSTRAINT "legal_representative_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_episode" ADD CONSTRAINT "care_episode_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_episode" ADD CONSTRAINT "care_episode_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_episode" ADD CONSTRAINT "care_episode_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_team_member" ADD CONSTRAINT "care_team_member_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."care_team_member" ADD CONSTRAINT "care_team_member_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."patient_opt_out" ADD CONSTRAINT "patient_opt_out_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."patient_opt_out" ADD CONSTRAINT "patient_opt_out_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."intake_draft" ADD CONSTRAINT "intake_draft_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."intake_draft" ADD CONSTRAINT "intake_draft_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis" ADD CONSTRAINT "diagnosis_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis" ADD CONSTRAINT "diagnosis_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis" ADD CONSTRAINT "diagnosis_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_note" ADD CONSTRAINT "clinical_note_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_note" ADD CONSTRAINT "clinical_note_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_note" ADD CONSTRAINT "clinical_note_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_note" ADD CONSTRAINT "clinical_note_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."exam" ADD CONSTRAINT "exam_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."exam" ADD CONSTRAINT "exam_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."exam" ADD CONSTRAINT "exam_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."biomarker" ADD CONSTRAINT "biomarker_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "clinical"."exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."document" ADD CONSTRAINT "document_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."document" ADD CONSTRAINT "document_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."document" ADD CONSTRAINT "document_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."treatment" ADD CONSTRAINT "treatment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."treatment" ADD CONSTRAINT "treatment_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."treatment" ADD CONSTRAINT "treatment_based_on_analysis_id_fkey" FOREIGN KEY ("based_on_analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."treatment" ADD CONSTRAINT "treatment_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prior_treatment" ADD CONSTRAINT "prior_treatment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prior_treatment" ADD CONSTRAINT "prior_treatment_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."prior_treatment" ADD CONSTRAINT "prior_treatment_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_prior_treatment_id_fkey" FOREIGN KEY ("prior_treatment_id") REFERENCES "clinical"."prior_treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "clinical"."treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_event" ADD CONSTRAINT "clinical_event_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_attribute" ADD CONSTRAINT "clinical_attribute_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_attribute" ADD CONSTRAINT "clinical_attribute_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_attribute" ADD CONSTRAINT "clinical_attribute_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."clinical_data_source" ADD CONSTRAINT "clinical_data_source_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "clinical"."care_episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."ai_analysis_record" ADD CONSTRAINT "ai_analysis_record_rerun_of_analysis_id_fkey" FOREIGN KEY ("rerun_of_analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."analysis_feedback" ADD CONSTRAINT "analysis_feedback_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."analysis_feedback" ADD CONSTRAINT "analysis_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."research_subject_map" ADD CONSTRAINT "research_subject_map_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "clinical"."patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis_grading" ADD CONSTRAINT "diagnosis_grading_diagnosis_id_fkey" FOREIGN KEY ("diagnosis_id") REFERENCES "clinical"."diagnosis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis_grading" ADD CONSTRAINT "diagnosis_grading_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "clinical"."document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."diagnosis_grading" ADD CONSTRAINT "diagnosis_grading_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical"."analysis_follow_up" ADD CONSTRAINT "analysis_follow_up_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "clinical"."ai_analysis_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit"."audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================================================
-- BLOQUE MANUAL (design.md D1): lo que Prisma no expresa. Cada parte cita su sección de docs/architecture/data-model.md.
-- Sin GRANT/REVOKE: los roles y el permission denied de rag_corpus llegan con US-040 (S2).
-- ============================================================================================================

-- Schema del corpus, VACÍO (§4.6): sus tablas las migra Backend 2 con Alembic (US-058). Fuera de `schemas` de Prisma.
CREATE SCHEMA IF NOT EXISTS corpus;

-- §6 (DEC-05): CHECK de clinical.diagnosis_grading, copiados literalmente del documento.
ALTER TABLE clinical.diagnosis_grading
  ADD CONSTRAINT diagnosis_grading_system_ck CHECK (grading_system IN ('gleason_isup', 'nottingham')),
  ADD CONSTRAINT diagnosis_grading_specimen_ck CHECK (specimen_type IS NULL OR specimen_type IN ('biopsia', 'prostatectomia')),
  ADD CONSTRAINT diagnosis_grading_scope_ck CHECK (grade_scope IS NULL OR grade_scope IN ('nucleo_sitio', 'peor', 'global')),
  ADD CONSTRAINT diagnosis_grading_gleason_ck CHECK (
    grading_system <> 'gleason_isup' OR (
      specimen_type IS NOT NULL AND grade_scope IS NOT NULL
      AND gleason_primary_pattern BETWEEN 3 AND 5
      AND gleason_secondary_pattern BETWEEN 3 AND 5
      AND gleason_score = gleason_primary_pattern + gleason_secondary_pattern
      AND isup_grade_group = CASE
            WHEN gleason_score = 6 THEN 1
            WHEN gleason_score = 7 AND gleason_primary_pattern = 3 THEN 2
            WHEN gleason_score = 7 AND gleason_primary_pattern = 4 THEN 3
            WHEN gleason_score = 8 THEN 4
            WHEN gleason_score IN (9, 10) THEN 5
          END
      AND nottingham_grade IS NULL)),
  ADD CONSTRAINT diagnosis_grading_nottingham_ck CHECK (
    grading_system <> 'nottingham' OR (
      nottingham_grade BETWEEN 1 AND 3
      AND specimen_type IS NULL AND grade_scope IS NULL
      AND gleason_primary_pattern IS NULL AND gleason_secondary_pattern IS NULL
      AND gleason_score IS NULL AND isup_grade_group IS NULL));

-- §6: una sola gradación de referencia por diagnóstico.
CREATE UNIQUE INDEX diagnosis_grading_reference_uq ON clinical.diagnosis_grading (diagnosis_id) WHERE is_reference;

-- §7: CHECK de clinical.analysis_follow_up, copiados literalmente del documento (RN-12 en llm_provider).
ALTER TABLE clinical.analysis_follow_up
  ADD CONSTRAINT analysis_follow_up_turn_number_ck CHECK (turn_number >= 1),
  ADD CONSTRAINT analysis_follow_up_status_ck CHECK (status IN ('con_evidencia', 'sin_evidencia', 'fuera_de_contexto')),
  ADD CONSTRAINT analysis_follow_up_llm_provider_ck CHECK (llm_provider IN ('local', 'nube'));

-- §4.3 (RN-12): mismo dominio de llm_provider en ai_analysis_record.
ALTER TABLE clinical.ai_analysis_record
  ADD CONSTRAINT ai_analysis_record_llm_provider_ck CHECK (llm_provider IN ('local', 'nube'));

-- §5 (design D1): la única de patient_identity con NULLS NOT DISTINCT (PostgreSQL >= 15). issuing_country es nullable y,
-- sin la cláusula, dos identidades con país nulo y el mismo HMAC no chocarían. Reemplaza el índice que generó Prisma.
DROP INDEX identity.patient_identity_blind_index_uq;
CREATE UNIQUE INDEX patient_identity_blind_index_uq ON identity.patient_identity (id_type, issuing_country, national_id_hmac) NULLS NOT DISTINCT;

-- §5: índices únicos parciales.
CREATE UNIQUE INDEX care_team_member_active_uq ON clinical.care_team_member (patient_id, doctor_id) WHERE is_active;
CREATE UNIQUE INDEX care_team_member_primary_uq ON clinical.care_team_member (patient_id) WHERE is_active AND is_primary;
CREATE UNIQUE INDEX care_episode_open_uq ON clinical.care_episode (patient_id) WHERE closed_at IS NULL;

-- §4.3, §7 / RN-06: clinical.ai_analysis_record y clinical.analysis_follow_up son inmutables; ningún UPDATE, de
-- ninguna columna, pasa. Una sola función para ambas tablas.
CREATE FUNCTION clinical.rechazar_actualizacion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es inmutable (RN-06)', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER ai_analysis_record_inmutable
  BEFORE UPDATE ON clinical.ai_analysis_record
  FOR EACH ROW EXECUTE FUNCTION clinical.rechazar_actualizacion();

CREATE TRIGGER analysis_follow_up_inmutable
  BEFORE UPDATE ON clinical.analysis_follow_up
  FOR EACH ROW EXECUTE FUNCTION clinical.rechazar_actualizacion();

-- §4.3 (US-038, reglas por estado y tipo): las columnas de modelos y recuperación se anulan según el estado o el tipo.
ALTER TABLE clinical.ai_analysis_record
  -- tipo_no_habilitado: no se invocó ningún modelo ni hubo recuperación.
  ADD CONSTRAINT ai_analysis_record_tipo_no_habilitado_ck CHECK (
    status <> 'tipo_no_habilitado' OR (
      llm_provider IS NULL AND llm_model IS NULL AND nli_model IS NULL
      AND embedding_model IS NULL AND reranker_model IS NULL
      AND prompt_version IS NULL AND corpus_release IS NULL AND retrieval_params IS NULL)),
  -- resumen_caso: no recupera del corpus, así que no hay modelos de recuperación ni puntaje.
  ADD CONSTRAINT ai_analysis_record_resumen_caso_ck CHECK (
    analysis_type <> 'resumen_caso' OR (
      embedding_model IS NULL AND reranker_model IS NULL AND corpus_release IS NULL
      AND retrieval_params IS NULL AND top_relevance_score IS NULL)),
  -- con_evidencia: LLM, NLI y versión del prompt siempre (reproducibilidad); los modelos de recuperación en el análisis de evidencia.
  ADD CONSTRAINT ai_analysis_record_con_evidencia_ck CHECK (
    status <> 'con_evidencia' OR (
      llm_provider IS NOT NULL AND llm_model IS NOT NULL AND nli_model IS NOT NULL AND prompt_version IS NOT NULL
      AND (analysis_type = 'resumen_caso' OR (embedding_model IS NOT NULL AND reranker_model IS NOT NULL)))),
  -- RN-02: sin evidencia o tipo no habilitado <=> top_relevance_score NULL (null no es 0.0), en el análisis de evidencia.
  ADD CONSTRAINT ai_analysis_record_puntaje_estado_ck CHECK (
    analysis_type <> 'analisis_evidencia'
    OR ((status IN ('sin_evidencia', 'tipo_no_habilitado')) = (top_relevance_score IS NULL))),
  ADD CONSTRAINT ai_analysis_record_puntaje_rango_ck CHECK (top_relevance_score IS NULL OR top_relevance_score BETWEEN 0 AND 1),
  ADD CONSTRAINT ai_analysis_record_opciones_ck CHECK (status = 'con_evidencia' OR evidence_options = '[]'::jsonb);

-- §4.3: un episodio tiene responsable de cierre si y solo si está cerrado, y el motivo solo existe en un episodio cerrado.
-- Cerrar sin motivo sigue permitido: el catálogo de motivos aún no está validado con el oncólogo.
ALTER TABLE clinical.care_episode
  ADD CONSTRAINT care_episode_cierre_ck CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NOT NULL OR closure_reason IS NULL));
