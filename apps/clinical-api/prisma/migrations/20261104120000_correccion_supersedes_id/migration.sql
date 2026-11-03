-- US-253 (L1D-309), ADR-50: una corrección crea una fila nueva que apunta a la anterior con `supersedes_id`; la anterior
-- queda `reemplazado` y conserva su valor. Aditiva: columna nullable (las filas existentes quedan en NULL) y sin cambiar
-- ninguna escritura vigente. La vigencia de `exam` es derivada (sin columna `review_status`, P-1).
ALTER TABLE "clinical"."biomarker" ADD COLUMN "supersedes_id" UUID;
ALTER TABLE "clinical"."exam" ADD COLUMN "supersedes_id" UUID;
ALTER TABLE "clinical"."clinical_note" ADD COLUMN "supersedes_id" UUID;

-- FK restrictiva a sí misma: no se enlaza a una fila inexistente ni se borra la versión anterior (RN-08).
ALTER TABLE "clinical"."biomarker" ADD CONSTRAINT "biomarker_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "clinical"."biomarker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical"."exam" ADD CONSTRAINT "exam_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "clinical"."exam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical"."clinical_note" ADD CONSTRAINT "clinical_note_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "clinical"."clinical_note"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único parcial (D2): una fila solo puede ser reemplazada una vez (la corrección concurrente pierde).
CREATE UNIQUE INDEX biomarker_supersedes_id_uq ON clinical.biomarker (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX exam_supersedes_id_uq ON clinical.exam (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX clinical_note_supersedes_id_uq ON clinical.clinical_note (supersedes_id) WHERE supersedes_id IS NOT NULL;
