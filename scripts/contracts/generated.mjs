/** Dónde se escribe lo generado desde los specs (design.md D6), relativo a la raíz del repositorio. */
import { PATHS } from './lib/paths.mjs';

export const zodPath = (provider) => `packages/api-contracts/src/zod/${provider}/zod.gen.ts`;
export const PYDANTIC_DIR = 'apps/rag-orchestrator/app/schemas/generated';

/** Rutas versionadas que `contracts:generate:check` vigila (una edición a mano o un archivo nuevo sin versionar fallan). */
export const GENERATED_ROOTS = ['packages/api-contracts/src', PYDANTIC_DIR, PATHS.readme];
