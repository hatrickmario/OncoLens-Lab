-- US-110 (L1D-90), design D7: el contrato declara `histology` como [string, null] y el registro manual del primer
-- diagnóstico (AC-6) no exige histología. Aditiva: solo relaja NOT NULL; ninguna escritura existente deja de valer.
ALTER TABLE "clinical"."diagnosis" ALTER COLUMN "histology" DROP NOT NULL;
