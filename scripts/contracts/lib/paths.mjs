/**
 * Dónde vive cada entrada y cada salida del tooling de contratos, relativo a la raíz del repositorio.
 * Módulo puro (sin E/S): lo importan la E/S (io.mjs, generate.mjs, readme-extract.mjs), lo generado y las reglas.
 */
import path from 'node:path';
import { CLINICAL_API, EVIDENCE, PROVIDERS, RAG_ORCHESTRATOR } from './specs.mjs';

/** Raíz del repositorio cuando no se indica otra (CONTRACTS_ROOT). */
export const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../../..');

export const PATHS = {
  specs: {
    [CLINICAL_API]: 'apps/clinical-api/openapi.yaml',
    [RAG_ORCHESTRATOR]: 'apps/rag-orchestrator/openapi.yaml',
    [EVIDENCE]: 'contracts/schemas/evidence.yaml',
  },
  examplesDir: 'contracts/examples',
  dataModel: 'docs/architecture/data-model.md',
  readme: 'readme.md',
  prohibitedTerms: 'scripts/contracts/terminos-prohibidos-rn23.json',
};

/** Los specs de los dos proveedores (sin el archivo compartido), de los que se genera código. */
export const SPEC_FILES = Object.fromEntries(PROVIDERS.map((provider) => [provider, PATHS.specs[provider]]));

/** Tipos TypeScript generados de un proveedor. */
export const typesPath = (provider) => `packages/api-contracts/src/types/${provider}/types.gen.ts`;

/** Cabecera de cada archivo generado: nombra el spec del que sale. */
export const generatedHeader = (provider, comment = '//') => `${comment} GENERADO desde ${SPEC_FILES[provider]} — no editar a mano (npm run contracts:generate)`;
