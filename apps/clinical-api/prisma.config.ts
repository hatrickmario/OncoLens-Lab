import { defineConfig } from 'prisma/config';

// Prisma 7 lee la URL de conexión aquí y no en schema.prisma. La URL real (rol clinical_api, sslmode=require) viene
// del entorno; nunca se versiona (RN-14). Para `prisma validate`/`generate` basta un marcador sin credenciales.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://marcador:marcador@localhost:5432/marcador?sslmode=require';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: DATABASE_URL },
});
