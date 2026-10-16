export interface SpecProblem {
  path: string;
  message: string;
}

/** Errores de validación del cuerpo contra el schema de `pointer` en el spec de `provider` (vacío si cumple). */
export function matchesSpec(provider: 'clinical-api' | 'rag-orchestrator', pointer: string, body: unknown): SpecProblem[];

/** Lanza nombrando cada campo incumplido si el cuerpo no cumple el schema de `pointer`. */
export function assertMatchesSpec(provider: 'clinical-api' | 'rag-orchestrator', pointer: string, body: unknown): void;
