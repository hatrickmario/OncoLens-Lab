-- US-048 (L1D-202), decisión del usuario 2026-10-21 (P-4): la búsqueda por nombre es exacta sobre el nombre completo
-- normalizado, por índice ciego HMAC. Aditiva: la columna es NULLABLE porque la migración no puede calcular el HMAC (la
-- clave solo vive en la aplicación); IdentityService.guardar la escribe siempre y el seed (idempotente) completa las
-- filas sembradas por L1D-200. Índice NO único: dos pacientes pueden compartir nombre normalizado.
ALTER TABLE "identity"."patient_identity" ADD COLUMN "full_name_hmac" TEXT;

CREATE INDEX "patient_identity_full_name_hmac_idx" ON "identity"."patient_identity"("full_name_hmac");
