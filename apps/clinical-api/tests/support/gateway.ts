import type { Router } from 'express';

/**
 * Routers del gateway de análisis (`POST /platform/evidence-analyses`) para montarlos en la app de test.
 * Vacío hasta que L1D-103 esté en `main`: entonces devuelve su router cableado a `createRagOrchestratorClient` con el
 * par ES256 efímero de L1D-105. El test de AC-5 (US-211) falla en la aserción mientras tanto; nunca se desactiva.
 */
export function rutasDelGateway(): readonly Router[] {
  return [];
}
