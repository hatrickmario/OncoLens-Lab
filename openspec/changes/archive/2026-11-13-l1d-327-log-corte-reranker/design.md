# Design — l1d-327-log-corte-reranker

## Context

`_cortar_a_pares_del_reranker` recorta los candidatos densos a `RERANKER_MAX_PAIRS` con
`recortar_a_pares_del_reranker` (orden: `-puntaje_de_recuperacion`, `chunk_id`) y registra
`event=rag_query_corte traceId recibidos descartados enviados`. La decisión 82 prohibía ids en ese log; el usuario la
cambia `[S6 resp. 4]` para que el fallo de la Demo 5 (R4) sea diagnosticable.

## Goals / Non-Goals

- Goals: registrar qué chunks se cortaron y su puesto denso; nunca texto; línea acotada.
- Non-Goals: cambiar el recorte, el número de pares, la respuesta de `/rag/query` o la evaluación.

## Decisions

1. **Formato:** se añaden a la línea existente `cortados=<id>:<puesto>,<id>:<puesto>` (vacío si no hay corte) y, solo si
   hay omitidos, `cortados_omitidos=<n>`. Puesto = posición 1-based en el orden denso completo (el mismo de
   `recortar_a_pares_del_reranker`), así el primer cortado es `RERANKER_MAX_PAIRS + 1`. Se mantiene un solo evento por
   loop (no un evento por chunk) para que el diagnóstico sea un `grep` de una línea.
2. **Regla pura con nombre:** `cortados_con_puesto(candidatos, max_pares, max_ids) -> CortadosDelReranker` (lista de
   `(chunk_id, puesto)` y `omitidos`) en `app/domain/pares_del_reranker.py`, reutilizando la misma función de orden que
   `recortar_a_pares_del_reranker` (una sola definición del orden; extraer `_orden_denso` si hace falta). El service solo
   formatea.
3. **Tope:** `RERANKER_CUT_LOG_MAX_IDS` en Settings (por defecto 50, ≥ 1), leído una vez y pasado a los parámetros del
   service junto a `reranker_max_pairs` (RN-22). El 50 es `(asumido)` en el AC-4.
4. Sin `reranker_max_pairs` configurado (`None`) no hay corte ni evento, como hoy.

Alternativa descartada en una línea: un evento por chunk cortado (más ruido, peor `grep`, mismo contenido).

## Privacidad y ownership

- Solo cambia un log de `rag-orchestrator`. Los `chunkId` son identificadores del corpus público (schema `corpus`), no
  datos del paciente; el usuario lo decide `[S6 resp. 4]`.
- MUST NOT registrarse texto de chunk, pregunta, `clinicalContext`, `pseudoPatientId` ni salida del LLM (RN-10, RN-14).
  AC-2 lo verifica con marcadores únicos y `caplog`.
- `rag-orchestrator` sigue sin tocar datos clínicos ni `clinical-minio`. No hay datos cruzando fronteras nuevas.

## Contratos

Sin cambios: ni `apps/rag-orchestrator/openapi.yaml` ni `contracts/examples/`. Proveedor/consumidor no afectados;
oasdiff sin diferencias; compatible con ADR-26.

## Dependencias y colaboradores

- Modifica `RAGOrchestratorService._cortar_a_pares_del_reranker` (formatea) y `ParametrosDelServicio` (nuevo
  `reranker_cut_log_max_ids`), `app/bootstrap.py` (cableado), Settings de modelos (clave nueva).
- Crea `cortados_con_puesto` en `app/domain/pares_del_reranker.py` (regla pura, sin E/S, sin dependencias nuevas).
- Fakes tocados: ninguno (`BuscadorFalso`, `RerankerFalso` de `tests/support/recuperacion.py` sin cambios de contrato).

## Evaluación

No aplica: no cambia modelo, prompt, umbral, catálogo ni corpus; el conjunto enviado al *reranker* es idéntico.

## Risks / Trade-offs

- Líneas de log más largas: acotadas por `RERANKER_CUT_LOG_MAX_IDS`.
- El test existente `test_el_log_de_la_etapa_de_corte_registra_solo_recuentos_sin_ids_ni_texto` contradice el nuevo AC:
  se reescribe con `Test-Removal: decisión 82 cambia a ids sin texto [S6 resp. 4]` en el último párrafo del commit.
