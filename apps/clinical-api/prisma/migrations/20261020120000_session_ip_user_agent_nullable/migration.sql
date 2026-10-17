-- US-211 (L1D-197), decisión del usuario 2026-10-20: en el S1 nunca se guarda la IP ni el user agent reales.
-- Aditiva: solo relaja NOT NULL de las dos columnas de auth.session (data-model.md ya las marca nullable).
ALTER TABLE "auth"."session" ALTER COLUMN "ip_address" DROP NOT NULL;
ALTER TABLE "auth"."session" ALTER COLUMN "user_agent" DROP NOT NULL;
