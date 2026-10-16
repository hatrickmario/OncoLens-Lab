# Tasks — l1d-115-seed-corpus-licensed

> TDD proporcional (CLAUDE.md): **estricto, doble bucle** para las reglas RN del cargador
> (admisibilidad RN-21, población RN-25, versionado RN-05) y su service; **test después** para el
> script, la configuración y los adapters; **exento** para el manifiesto y los datos;
> **evaluate** para el efecto del corpus en la recuperación. Sin cambios de API: no hay sección
> `## contratos`. Mocks solo en los bordes: *embeddings* (falso determinista, `EMBEDDING_DIM = 8`),
> HTTP saliente (`respx`), Milvus de test; PostgreSQL `corpus` real; reloj e IDs inyectados
> (`freezegun`).

## ai-services

- [ ] 1.1 Manifiesto real (exento; datos): `data/raw/seed/manifest.yaml` con ~10 documentos (≈5 mama, ≈5 próstata, ≥1 en español) de NCI PDQ (solo texto) y PMC OA CC0/CC BY/CC BY-SA, cada uno con licencia literal, `license_url`, `license_verified_at` y evidencia de la verificación por documento (ADR-36); textos en `data/raw/seed/docs/` o `source_url`; `data/raw/seed/ATTRIBUTION.md`. Sin NCCN/ESMO, sin PHI ni identificadores de paciente. El mini-dataset del change de L1D-102 ya no depende de este manifiesto (trae el suyo, `data/eval/adr39-mini/manifest.yaml`, del que este puede derivar). Dos notas `[S1 resp. 38]`: rotular la fuente como `NCI` y no `NCI PDQ` (la marca PDQ solo vale para reproducciones íntegras, ver el README del dataset), y el dataset de L1D-102 no incluye ningún documento en español, así que el "≥1 en español" de esta tarea hay que cubrirlo aquí [US-059 AC-1] [RN-21] [RN-13] [RN-14]
- [ ] 1.2 Fixture FX-06c-a (exento; datos): `apps/rag-orchestrator/tests/fixtures/seed-manifest.yaml` con `t-ok-1`, `t-ok-2`, `t-nd`, `t-sin-licencia`, `t-nccn` (texto sintético) y `t-ok-1-v2`, textos sintéticos breves; adapter de *embeddings* falso determinista con contador de invocaciones
- [ ] 1.3 Configuración (test después): `CORPUS_ACCEPTED_LICENSES`, tabla licencia → `license_class` (CC0 → `dominio_publico`), `CORPUS_EXCLUDED_SOURCES`, `CORPUS_CUTOFF_DATE`, `CORPUS_CHUNK_SIZE`, `CORPUS_CHUNK_OVERLAP` (en tokens, `[S1 resp. 38]`), `CORPUS_SEED_MANIFEST_PATH`, `CORPUS_FETCH_ALLOWED_HOSTS` en *settings* y `.env.example`; test de que falta de clave obligatoria falla al arrancar [RN-22]
- [ ] 1.4 Test de aceptación en rojo (estricto · integración): "rechaza t-nd y t-sin-licencia con rechazado_licencia y sin chunks y sigue con t-ok-1 [US-059 AC-2]" con `@pytest.mark.ac("US-059", 2)`, PostgreSQL `corpus` real y Milvus de test; esqueletos con `raise NotImplementedError`; commit `test(L1D-115)`
- [ ] 1.5 Extraer `evaluar_admisibilidad()` y `clase_de_licencia()` (RN-21) en `app/domain/corpus_seed/admisibilidad.py` con unitarios uno a uno (sin licencia → licencia ND → licencia aceptada); `SeedCorpusLoader`, puertos, `CorpusDocumentRepository` e `insertar_chunks()` mínimos hasta verde; commit `feat(L1D-115)` [US-059 AC-2]
- [ ] 1.6 Test de aceptación en rojo (estricto · integración): "rechaza t-nccn con motivo fuente_excluida aunque declare licencia [US-059 AC-3]"; commit `test(L1D-115)`; implementación (exclusión antes que licencia, comparación normalizada, motivo en el reporte de la carga) con unitarios; commit `feat(L1D-115)` [US-059 AC-3] [D-09]
- [ ] 1.7 Test de aceptación en rojo (estricto · integración): "t-ok-2 conserva estadio y línea con fuente_estructurada y t-ok-1 queda no_disponible [US-059 AC-4]"; commit `test(L1D-115)`; Extraer `resolver_criterios_poblacion()` (RN-25) con unitarios; commit `feat(L1D-115)` [US-059 AC-4] [RN-25]
- [ ] 1.8 Test de aceptación en rojo (estricto · integración): "una segunda carga con el mismo manifiesto no cambia los recuentos ni invoca embeddings [US-059 AC-5]"; commit `test(L1D-115)`; Extraer `decidir_version()` y `calcular_checksum()` (rama `omitir`) con unitarios; release solo si cambia el conjunto vigente; commit `feat(L1D-115)` [US-059 AC-5] [S1 resp. 3]
- [ ] 1.9 Test de aceptación en rojo (estricto · integración, reloj congelado): "t-ok-1-v2 queda vigente y t-ok-1 y sus chunks pasan a no vigentes sin borrar nada [US-059 AC-6]"; commit `test(L1D-115)`; rama `reemplazar` de `decidir_version()` (RN-05), `marcar_no_vigentes()` por *upsert* en Milvus y `superseded_at` desde `Clock`; commit `feat(L1D-115)` [US-059 AC-6] [RN-05]
- [ ] 1.10 `CorpusRelease` (estricto · integración): test de aceptación en rojo "publica una release con cutoff_date de configuración, excluded_sources NCCN/ESMO y una fila por documento vigente" sobre FX-06c-a; implementación con `IdGenerator` inyectado; commits `test`/`feat(L1D-115)` [US-059 AC-1] [D-09]
- [ ] 1.11 Chunking y fallos (test después): `normalizar_texto()` y `fragmentar()` puros con unitarios (la unidad pasa de caracteres a tokens al fijarse US-012 AC-10, `[S1 resp. 38]`; hasta entonces, provisional); documento con *embedding* o Milvus caído → `status = error`, la carga sigue y termina con código ≠ 0; PostgreSQL caído → aborta (design D7)
- [ ] 1.12 Script y `SourceFetcher` (test después): `python -m app.scripts.load_seed_corpus` como raíz de composición; `HttpSourceFetcher` limitado a `CORPUS_FETCH_ALLOWED_HOSTS` y HTTPS, probado con `respx`; reporte JSON sin contenido ni URLs completas
- [ ] 1.13 Smoke AC-1 (test después; ⛔ change de L1D-102): con el manifiesto real y los *embeddings* y `EMBEDDING_DIM` de ADR-39 contra Compose (change de L1D-164), todos los documentos `embebido`, chunks vigentes con metadatos denormalizados copiados, y release publicada; `@pytest.mark.ac("US-059", 1)` [US-059 AC-1] [AC-06.1]
- [ ] 1.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit refactor(L1D-115)

## evaluación

- [ ] 2.1 Cambia el corpus: `run-ai-eval` si la suite existe; si no (US-072 llega en el S2), `ai-eval-runner` revisa a mano la recuperación del paciente semilla de mama y próstata sobre esta semilla (recall@10, MRR, precisión de citas, "sin evidencia"), como evidencia del Gate 2

## Verificación

- [ ] 3.1 `openspec validate l1d-115-seed-corpus-licensed --strict`
- [ ] 3.2 Tests de `apps/rag-orchestrator` en verde (Pytest) y escaneo de secretos/PII sobre `data/raw/seed/` y el fixture
