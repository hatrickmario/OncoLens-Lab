# S3 · Deuda y decisiones del cierre de la O1 (usuario, 2026-10-24)

> Fuente: hoja de cierre del orquestador `sprint-S3` tras los PR #192–#195. Linear: comentario en cada historia destino (sin crear issues, el workspace está en su límite).

| Deuda / decisión | Destino | Decisión |
|---|---|---|
| Núcleo común de ingesta (`SeedCorpusLoader`, `IngestionPipelineService`) y tarea 1.10 de L1D-116 | **US-117b** (tarea 0) | Refactor previo, cobertura del módulo sin bajar |
| UX de la Base: clave cruda `estado_menopausico` | **US-128** (L1D-188) | Etiqueta legible |
| Enum `guia` en la cita | **US-127** (L1D-182) | Rótulo desde el catálogo |
| RSS y latencia del NLI (us-231b 1.11) | **US-233** (S4) | AC nuevo en el refinamiento del S4 |
| `destination.match` como arrays | **US-121** (L1D-126) | Aceptado (compatible) |
| Columnas fuera de la allowlist (`Biomarker.original_name`, `reference_range`, `Exam.source_lab`) | **US-121** | Se mantienen excluidas |
| AC-7 de L1D-287 | prueba con temperatura 0 y 0,3, 20 muestras cada una | Pendiente; el chunk real de la demo no está versionado |
| `.env.example` de `rag-orchestrator` (`EMBEDDING_SPARSE_WEIGHTS_*`) | PR #194 | Excepción de permiso concedida por el usuario; pendiente de aplicar |
| Estilo pytest `PT` en `rag-orchestrator`: 298 hallazgos en `PT001`, `PT006`, `PT011` y `PT018` (ignorados en `pyproject.toml` al activar Ruff `PT` en L1D-285) | tests de `apps/rag-orchestrator` | **US-232** (S6); si hay capacidad, un PR mecánico aislado con `ruff --fix` tras la oleada 2 |
| Cobertura de la integración de `clinical-api` (se quitan los `*.service.ts` de `alertPaths`) | `quality` | **US-232** (S6) |
| Mover los fixtures FX-04-a a `packages/`; derivar `ESQUEMAS` de `clinical-api` del validador; `Exam.review_status` inexistente en el repositorio de completitud (latente) | `clinical-api` | **US-232** (S6) |

## Decisiones del usuario (2026-10-24)

1. L1D-94 tarea 1.12b → trasladada a L1D-95 (US-003). 2. RN-27: `Biomarker` `no_mapeado` cuenta como presente sin verificar. 3. RE/RP: el seed adopta los códigos del catálogo (US-003). 4. L1D-117: `grado`, `estado_menopausico` y `estado_castracion` quedan «Desconocido» explícito en el S3. 5. Muestra de metadatos desde la release/catálogo. 6. El CLI de ingesta se niega con nube o proveedor no local y tiene temperatura de extracción propia (0). 7. `poblacion.json` asimétrico hasta US-122. 8. Control de CI por hash contra cambios de aplicabilidad sin subir versión. 9. Arranque estricto con `aplicabilidad.json` inválido. 10-12. L1D-285: sin `*.service.ts` en `alertPaths`, alertas de `check-ac-coverage` filtradas al diff, `quality` con timeout según la duración real. 13. AC-7 de L1D-287 aceptado con la evidencia sintética (`reports/eval/l1d-287-ac7-temperaturas.md`); la prueba con el chunk real pasa a la Demo 3. 14. `.gitleaks.toml`: allowlist acotada para `generic-api-key` en el catálogo de aplicabilidad.

## Decisión del usuario (2026-10-27)

- Decisión 3 (seed RE/RP/BRCA/HRR con los códigos del catálogo): la parte del **seed** se adelanta a la O3 como change `l1d-95a-seed-codigos-catalogo` (2 pts de L1D-95/US-003 adelantados); el router `/completeness` y el cableado siguen en L1D-95 (S4). **L1D-98 espera a este change** (emparejará por `dataRef`/`id`; también L1D-181).

## Mejoras de la retro del S3 (usuario, 2026-10-28)

Aprobadas en el cierre del S3 (`S3-cierre.md` §7). Aplicadas antes del `/sprint-refine` del S4: reglas del orquestador (informes verificables, métricas por historia, Gate 2 reducido por defecto, Linear tras cada merge), DoD (`tasks.md` conciliado), reglas de `openspec/config.yaml` (requisito ≤ 500 caracteres; MODIFIED con escenarios exactos), recetas de integración en los implementadores, hook `guard-npm-symlink.sh`, `.gitignore` de la muestra de metadatos, `PATRON_DE_CLAVE` sin `.`/`..` y `fast-uri` 3.1.9 en el lockfile.

| Pendiente | Destino | Nota |
|---|---|---|
| `scripts/demo/levantar.sh` no carga metadatos de población ni pesos sparse: sin ellos la aplicabilidad sale «no evaluada» en vivo | **US-233** (S4) | Tarea nueva en el refinamiento; hasta entonces ensayar según `docs/demo/guia-demo-S3.md` §0 |
| Descargador HTTPS sin validar la IP resuelta (riesgo teórico: lista de hosts fija, sin redirecciones) | **US-233** (S4) | Opcional; rechazar IP privadas/loopback |
| Exposición de iniciales y 2 últimos caracteres del documento en el listado (RN-10) | Decisión del usuario antes del piloto | L1D-202 D2 / L1D-285 D7 |

