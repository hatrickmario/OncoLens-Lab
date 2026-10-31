/**
 * Literales con que el backend sustituye una afirmación cuyo texto no puede mostrarse (retiro por
 * formulación no permitida y modal normativo, US-245). Espejo de `RETIRO_ES`, `RETIRO_EN`,
 * `NO_MOSTRADO_ES` y `NO_MOSTRADO_EN` en `apps/rag-orchestrator/app/domain/support.py`: si cambian allí,
 * cambian aquí (el test de `descripcion-descartada` los ata al ejemplo del contrato).
 */
export const LITERALES_DE_AFIRMACION_RETIRADA: ReadonlySet<string> = new Set([
  '[afirmación retirada: formulación no permitida]',
  '[claim removed: disallowed wording]',
  '(texto no mostrado)',
  '(text not shown)',
]);
