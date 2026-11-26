---
name: contexto-chunk-l1d337-trampas
description: L1D-337 en ai-services - dónde vive el contexto del chunk, cómo se prueba reindex-context sin Milvus y trampas del arnés (scripts por archivo, ingest.crear_motor)
metadata:
  type: project
---

El prefijo del contexto es solo una entrada de los codificadores: reglas puras en `domain/corpus_seed/contexto_del_chunk.py` y `coleccion_de_la_variante.py`; el constructor por variante se inyecta (`constructores_de_contexto.py`, `contexto_llm.py`) en `IngestionPipelineService`, `SeedCorpusLoader` y `ReindexarContexto`. La suite lo mide como `Brazo.contexto` (`CORPUS_CHUNK_CONTEXT` en el YAML); en la CI el índice de cada brazo se reconstruye en memoria (`evaluation/indice_con_contexto.py`), con Milvus real cada brazo lee su colección (`indice:`) y el costo sale de `--resumenes-de-contexto`.

**Why:** `tests/unit/test_script_ingest.py` monkeypatchea `ingest.crear_motor`, `fabricar_codificadores_reales` y `leer_manifiesto`: mover esas importaciones de `app/scripts/ingest.py` rompe tests que no deberían cambiar en un refactor (por eso `_motor_del_catalogo` vive en ingest.py y no en `load_seed_corpus`).

**How to apply:** el Bash del worktree rechaza `cat >`, heredocs, `python -c` largos y `git` combinado con otros comandos: escribe el script con Write en el scratchpad y córrelo con `python3 -I <script>` desde `apps/rag-orchestrator`; nunca cortes un archivo con `s[:i]` sin acotar el final (borró `main()` una vez). `python -I` no pone el cwd en `sys.path`: para `-m app...` usa `PYTHONPATH=.` y sin `-I`. Las rutas con «eval» (`grep -i eval`) bloquean el comando. Los tests de integración de reindexación corren en memoria y con `servicios_reales` en el job `integration-rag`; el caso `milvus` del contrato del almacén no se pudo ejecutar en local.
