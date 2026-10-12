/** Dónde se escribe lo generado desde los specs (design.md D6), relativo a la raíz del repositorio. */

export const SPEC_FILES = {
  'clinical-api': 'apps/clinical-api/openapi.yaml',
  'rag-orchestrator': 'apps/rag-orchestrator/openapi.yaml',
};

export const typesPath = (provider) => `packages/api-contracts/src/types/${provider}/types.gen.ts`;
export const zodPath = (provider) => `packages/api-contracts/src/zod/${provider}/zod.gen.ts`;
export const PYDANTIC_DIR = 'apps/rag-orchestrator/app/schemas/generated';

/** Rutas versionadas que `contracts:generate:check` vigila (una edición a mano o un archivo nuevo sin versionar fallan). */
export const GENERATED_ROOTS = ['packages/api-contracts/src', PYDANTIC_DIR];

/** Cabecera de cada archivo generado. */
export const generatedHeader = (provider, comment = '//') => `${comment} GENERADO desde ${SPEC_FILES[provider]} — no editar a mano (npm run contracts:generate)`;
