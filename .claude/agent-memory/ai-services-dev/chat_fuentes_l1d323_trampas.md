---
name: chat-fuentes-l1d323-trampas
description: Cómo quedó el nodo fuentes_limitaciones del chat (L1D-323), excepción ADR-26 E-20 y trampas de ejemplos, estado del hilo y arnés
metadata:
  type: project
---

El nodo `fuentes_limitaciones` (`app/application/chat/capacidades/fuentes_limitaciones.py`) es determinista: lee `ultimaEvidencia ∩ citasMostradas` del hilo, resuelve chunk→documento con `PosicionDeChunks`, relee la ficha del catálogo (`CorpusCatalogReader`) y la release (`CorpusReleaseReader`: fecha de corte y fuentes no incluidas salen del catálogo, no de `Settings`). Se activa solo si `ChatTurnService` recibe `catalogo_del_corpus`, `lector_release` y `posiciones`; sin ellos rige el esqueleto con LLM.

**Why:** los criterios «Desconocido» y las descartadas del último análisis no caben en `structuredState`: viven en `EstadoDelHilo.limitaciones_del_analisis` (estado efímero, tipo registrado en `TIPOS_DEL_ESTADO`); un hilo rehidratado lo trae en `None` y el texto degrada a la frase de FR-10.

**How to apply:**
- `assertExamplesSynthetic` prohíbe NCCN/ESMO en cualquier texto de un ejemplo salvo `excludedSources`: los ejemplos de bloques usan una release sintética (`FUENTE-EXCLUIDA-1/2`); los tests de AC usan la release de prueba real.
- Declarar `RETRIEVAL_UNAVAILABLE`/`NLI_UNAVAILABLE` en el 503 de `/chat/turn` (rag 1.14.0) es un ERR de oasdiff: necesita la entrada E-20 en `scripts/ci/contracts-breaking-excepciones.json` (protegido; va en `## humano`). `VERSION_DEL_SERVICIO` en `app/config/version.py` debe igualar `info.version`.
- Para regenerar un ejemplo desde el motor sin pytest: un test temporal en `tests/integration/` que escriba el JSON (el conftest pone la clave JWT; un script suelto no).
- El Bash del worktree rechaza `python3 -I - <<E` con rutas largas y `cd` previo en el mismo comando; usa Edit o comandos separados. PostgreSQL de test propio: script en el scratchpad con `COMPOSE_PROJECT_NAME`, puerto 55823 y subredes 172.30.123/124.
