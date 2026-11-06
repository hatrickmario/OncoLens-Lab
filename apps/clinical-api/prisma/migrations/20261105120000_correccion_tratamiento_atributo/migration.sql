-- d5fb-05, ADR-50 (nota de alcance): corregir un tratamiento previo o un atributo clínico crea una fila nueva que apunta a
-- la anterior con `supersedes_id`; la anterior queda `reemplazado` y conserva su contenido. Aditiva: columna nullable (las
-- filas existentes quedan en NULL) y sin cambiar ninguna escritura vigente.
ALTER TABLE "clinical"."prior_treatment" ADD COLUMN "supersedes_id" UUID;
ALTER TABLE "clinical"."clinical_attribute" ADD COLUMN "supersedes_id" UUID;

-- FK restrictiva a sí misma: no se enlaza a una fila inexistente ni se borra la versión anterior (RN-08).
ALTER TABLE "clinical"."prior_treatment" ADD CONSTRAINT "prior_treatment_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "clinical"."prior_treatment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clinical"."clinical_attribute" ADD CONSTRAINT "clinical_attribute_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "clinical"."clinical_attribute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Índice único parcial (D2): una fila solo puede ser reemplazada una vez (la corrección concurrente pierde).
CREATE UNIQUE INDEX prior_treatment_supersedes_id_uq ON clinical.prior_treatment (supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX clinical_attribute_supersedes_id_uq ON clinical.clinical_attribute (supersedes_id) WHERE supersedes_id IS NOT NULL;
