# Tasks — l1d-115-seed-corpus-licensed

> TDD proporcional (CLAUDE.md): **estricto, doble bucle** para las reglas RN del cargador
> (admisibilidad RN-21, población RN-25, versionado RN-05) y su service; **test después** para el
> script, la configuración y los adapters; **exento** para el manifiesto y los datos;
> **evaluate** para el efecto del corpus en la recuperación. Sin cambios de API: no hay sección
> `## contratos`. Mocks solo en los bordes: *embeddings* (falso determinista, `EMBEDDING_DIM = 8`),
> HTTP saliente (`respx`), Milvus de test; PostgreSQL `corpus` real; reloj e IDs inyectados
> (`RelojFijo`, `GeneradorDeIdsFijo`; sin `freezegun`).
>
> **Estado (2026-10-20):** implementado salvo el smoke 1.13, **trasladado a L1D-106** (tarea 2.13b de su `tasks.md`) por la
> decisión del usuario del 2026-10-20 (ver `design.md`, *Decisiones del usuario*). **L1D-115 no pasa a Done hasta que ese
> smoke corra.** Deuda anotada: unificar la regla de licencias con `app/evaluation/dataset_loader.py` (ID por asignar).

## ai-services

- [x] 1.1 Manifiesto real (exento; datos): `data/raw/seed/manifest.yaml` con 10 documentos (5 mama, 5 próstata, 2 en español) de NCI (4 páginas, texto libre de copyright) y PMC OA CC BY (6 artículos), cada uno con licencia literal, `license_url`, `license_verified_at` (2026-10-16), evidencia de la verificación por documento (ADR-36), `downloaded_at` y `checksum` del texto normalizado; textos en `data/raw/seed/docs/`; `data/raw/seed/ATTRIBUTION.md`. Rotulado `NCI`, no `NCI PDQ` `[S1 resp. 38]`. Sin NCCN/ESMO, sin PHI; se omitieron correos y teléfonos de terceros del texto (escáner de PII de la CI en verde). Original no guardado: `object_key_*` vacíos (decisión del usuario, 2026-10-20) [US-059 AC-1] [RN-21] [RN-13] [RN-14]
- [x] 1.2 Fixture FX-06c-a (exento; datos): `apps/rag-orchestrator/tests/fixtures/seed-manifest.yaml` con `t-ok-1`, `t-ok-2`, `t-nd`, `t-sin-licencia`, `t-nccn` y `t-ok-1-v2`, textos sintéticos breves; embedder falso determinista con contador (`tests/support/semilla.py`)
- [x] 1.3 Configuración (test después): `CorpusSeedSettings` con `CORPUS_ACCEPTED_LICENSES`, `CORPUS_LICENSE_CLASS_MAP` (CC0 y texto de NCI → `dominio_publico`), `CORPUS_EXCLUDED_SOURCES`, `CORPUS_CUTOFF_DATE`, `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP`, `CORPUS_CHUNKING_STRATEGY`, `CORPUS_SEED_MANIFEST_PATH`, `CORPUS_FETCH_ALLOWED_HOSTS`, `CORPUS_FETCH_TIMEOUT_SECONDS`, `CORPUS_FETCH_MAX_BYTES`; falta de clave obligatoria falla al arrancar nombrándola. El bloque de `.env.example` lo aplica el usuario (el clasificador bloquea ese archivo al implementador) [RN-22]
- [x] 1.4 Test de aceptación en rojo (estricto · integración): "rechaza t-nd y t-sin-licencia con rechazado_licencia y sin chunks y sigue con t-ok-1 [US-059 AC-2]" con `@pytest.mark.ac("US-059", 2)`, PostgreSQL `corpus` real y Milvus de test; esqueletos con `raise NotImplementedError`; commit `test(L1D-115)`
- [x] 1.5 Extraer `evaluar_admisibilidad()` y `clase_de_licencia()` (RN-21) en `app/domain/corpus_seed/admisibilidad.py` con unitarios uno a uno; `SeedCorpusLoader`, puertos, `CorpusDocumentRepository` e inserción mínimos hasta verde; commit `feat(L1D-115)` [US-059 AC-2]
- [x] 1.6 AC-3 en rojo y verde (exclusión antes que licencia, comparación normalizada, motivo en el reporte) [US-059 AC-3] [D-09]
- [x] 1.7 AC-4 en rojo y verde; `resolver_criterios_poblacion()` (RN-25) con unitarios [US-059 AC-4] [RN-25]
- [x] 1.8 AC-5 en rojo y verde; `decidir_version()` (rama `omitir`), `calcular_checksum()`, `debe_publicar_release()` con unitarios; release solo si cambia el conjunto vigente [US-059 AC-5] [S1 resp. 3]
- [x] 1.9 AC-6 en rojo y verde; rama `reemplazar` de `decidir_version()` (RN-05), `marcar_no_vigentes()` por *upsert* en Milvus y `superseded_at` desde el reloj inyectado [US-059 AC-6] [RN-05]
- [x] 1.10 `CorpusRelease` (estricto · integración): test de aceptación "publica una release con cutoff_date de configuración, excluded_sources NCCN/ESMO y una fila por documento vigente" sobre FX-06c-a. No pudo estar en rojo (la release nació con AC-2/AC-5); se comprobó que detecta el defecto mutando `cutoff_date` y `excluded_sources` [US-059 AC-1] [D-09]
- [x] 1.11 Chunking y fallos (test después): `normalizar_texto()` y `fragmentar()` puros con unitarios (provisional: palabras; la unidad pasa a tokens con el tokenizer del modelo, tarea 2.13b de L1D-106); documento con *embedding*, texto o Milvus caído → `status = error`, la carga sigue y termina con código ≠ 0; PostgreSQL caído → aborta (design D7)
- [x] 1.12 Script y `SourceFetcher` (test después): `python -m app.scripts.load_seed_corpus` como raíz de composición; `DescargadorHttps` limitado a `CORPUS_FETCH_ALLOWED_HOSTS` y HTTPS, sin seguir redirecciones, probado con `respx`; reporte JSON sin contenido ni URLs; `load_seed_corpus.py` en la lista blanca de `Dockerfile.dockerignore` con su test
- [ ] 1.13 **Trasladada a L1D-106** (tarea 2.13b de su `tasks.md`; decisión del usuario, 2026-10-20). Smoke AC-1 (test después): con el manifiesto real y los *embeddings* y `EMBEDDING_DIM` reales de ADR-39 contra Compose (change de L1D-164), todos los documentos `embebido`, chunks vigentes con metadatos denormalizados copiados, y release publicada; `@pytest.mark.ac("US-059", 1)` [US-059 AC-1] [AC-06.1]. Cubierto mientras tanto, sin modelo real: `test_manifiesto_real_de_la_semilla.py` (datos) y la carga del manifiesto real con *embeddings* falsos contra PostgreSQL y Milvus reales
- [x] 1.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commits `refactor(L1D-115)`

## Gate 2 · vuelta 1 (2026-10-20)

- [x] G2.1 Privacy Mayor 1 (RN-21, ADR-36): los extractos de NCI sin secciones de autoidentificación ni marca PDQ, checksums recalculados, `ATTRIBUTION.md` corregida; el test del manifiesto real lee el CUERPO de cada `text_path` y falla si un documento `NCI` contiene `PDQ`. Menores: texto original del `NCT` restaurado (falso positivo `telefono_local` resuelto con `prefijosDeRegistroExentos: ["NCT"]`, campo ya aplicado a cualquier formato por `scripts/lib/formatosPii.mjs`, sin subir `version`), 1-800 de NCI omitido, dos artículos a `CC BY 4.0`, NC/ND por texto, fuente excluida por alias, token y host, `document_key` no repetido, `DescargadorHttps` (443, sin credenciales, `text/plain` exacto, plazo total `CORPUS_FETCH_DEADLINE_SECONDS`)
- [x] G2.2 Diseño Bloqueante 1 (RN-05): `DecisionDeVersion.a_apagar` decidida por el dominio, también en `omitir`; Mayores 3 a 6 y menores 8, 9, 10, 13, 14, 16
- [x] G2.3 Opción A (decidido por el usuario, 2026-10-20): un rechazo retira la versión vigente del grupo (`_retirar_vigente_del_grupo`, `decidir_retiro`, `CorpusCatalog.retirar_version`)
- Deuda sin ID: unificar la regla de licencias con `app/evaluation/dataset_loader.py`; ingesta que falla cerrado (insertar `is_current = false` y encender tras confirmar el catálogo; reconciliar documentos quitados del manifiesto); `license_class` nullable en los rechazados (hoy `cc_by_nc`; P4)

## evaluación

- [ ] 2.1 Cambia el corpus: `run-ai-eval` si la suite existe; si no (US-072 llega en el S2), `ai-eval-runner` revisa a mano la recuperación del paciente semilla de mama y próstata sobre esta semilla (recall@10, MRR, precisión de citas, "sin evidencia"), como evidencia del Gate 2. **Pendiente del orquestador:** requiere el adapter real de embeddings (L1D-106); el implementador deja la semilla lista

## Verificación

- [x] 3.1 `openspec validate l1d-115-seed-corpus-licensed --strict`
- [x] 3.2 Tests de `apps/rag-orchestrator` en verde (Pytest, incluida la suite `servicios_reales` en un Compose propio) y escaneo de secretos/PII sobre `data/raw/seed/` y el fixture (`node scripts/ci/pii-scan.mjs`)
