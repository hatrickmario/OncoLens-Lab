# Tasks — l1d-126-criterios-aplicabilidad-catalogo

> Sin cambio de API: no hay sección `## contratos` con tareas (ver `design.md`, Contratos).
> Requiere en `main` el change de L1D-93 (US-001: `catalog:validate`, regla de destino, versión del S3) y se archiva
> después de él (delta `MODIFIED`, `[S3 resp. 16]`). El test del AC-5 con estado calculado vive en L1D-127.

## clinical-platform

- [x] 1.1 Fixtures FX-08b-a en `packages/clinical-catalogs/__fixtures__/`: `test-apl-1.0.0` (mama, cinco criterios
      de FX-08b-a con `studyKey`, y su `poblacion.json`), `test-apl-1.0.1` (igual salvo `ecog.rule.limits.max = 0`)
      y copias inválidas (sin `destination` en `estado_menopausico`; `ecog` con `peso`, `score`, `weight`; `ecog`
      sin `studyKey`; `ecog.studyKey = "ecog_x"`; `estadio` y `ecog` con `studyKey = "estadio"`) · test después
      (fixture)
      > Evidencia: commit 1a27420a; `catalog:validate` OK sobre `test-apl-1.0.0` y `1.0.1`; las copias inválidas se arman en los tests (`aplicabilidad.test.mjs`), no como carpetas.
- [x] 1.2 Test de aceptación en rojo: "termina con código ≠ 0 y nombra estado_menopausico cuando un criterio de
      aplicabilidad no tiene destination [US-121 AC-2]" · integración (proceso real `catalog:validate`, timeout
      explícito de 30 s) · TDD estricto · commit `test(L1D-126)`
      > Evidencia: `aplicabilidad.test.mjs` (AC-2); pasa en verde desde el primer commit porque la regla de destino es de L1D-93 (regresión; la copia sin alterar valida antes de romperla).
- [x] 1.3 Test de aceptación en rojo: "termina con código ≠ 0 y nombra ecog y el campo cuando un criterio declara
      peso, score o weight [US-121 AC-3]" · integración (timeout 30 s) · TDD estricto · commit `test(L1D-126)`
      > Evidencia: rojo 14acd10d (4 fallos "expected +0 not to be +0"), verde b1a82130; mutación sin `rechazarCamposDePuntaje` = 4 fallos.
- [x] 1.3b Test de aceptación en rojo: "termina con código ≠ 0 con study_key_ausente, study_key_inexistente o
      study_key_duplicada y nombra el criterio [US-121 AC-1]" · integración (timeout 30 s) · TDD estricto · commit
      `test(L1D-126)`
      > Evidencia: rojo 14acd10d (4 fallos), verde b1a82130; mutación sin `exigirStudyKey` = 7 fallos.
- [x] 1.4 Esquema estricto del criterio en `schemas/aplicabilidad.schema.json` (D1, con `studyKey`),
      `poblacion.json` y su esquema (D3b), y extraer `rechazarCamposDePuntaje()` (RN-28) y `exigirStudyKey()` en el
      validador de US-001, con sus unitarios uno a uno; AC-2, AC-3 y los escenarios de `studyKey` en verde · TDD
      estricto · commit `feat(L1D-126)`
      > Evidencia: commit b1a82130; unitarios en `reglas-aplicabilidad.test.mjs`; añade `comun.schema.json` (etiqueta, destino y estado compartidos; `match` admite listas) y `estado_invalido` en aplicabilidad.
- [x] 1.5 Test de aceptación en rojo: "lista exactamente los criterios de mama y próstata con destination,
      isExclusionary y rule, y HER2 y castración excluyentes [US-121 AC-1]" (también bloque `validation`
      `propuesta_revisada`, [US-021 AC-1]) · test del catálogo · commit `test(L1D-126)`
      > Evidencia: `contenido-aplicabilidad.test.mjs`, rojo 14acd10d (`expected [] to deeply equal [...]`).
- [x] 1.6 Contenido de `mama/aplicabilidad.json`, `prostata/aplicabilidad.json` (según D2, con `studyKey` y
      `estado = "propuesta"`) y `poblacion.json`; bloque `validation` con `scope = ["aplicabilidad"]` y `catalogHash`
      calculado con `catalog:hash` (D3c); `catalog:validate` termina con 0 sobre el catálogo del S3 [US-121 AC-1,
      AC-3] · commit `feat(L1D-126)`
      > Evidencia: `npm run catalog:validate` = OK catalogVersion=1.1.0 (sin subir la versión, D5).
- [x] 1.7 Test de aceptación en rojo: "responde 409 CATALOG_VERSION_MISMATCH y no persiste AIAnalysisRecord cuando
      rag-orchestrator tiene test-apl-1.0.1 y clinical-api test-apl-1.0.0 [US-121 AC-4]" · integración (Supertest +
      PostgreSQL real; MSW hacia `rag-orchestrator` desde `contracts/examples/rag-catalog-version-mismatch.json`;
      respuesta validada contra el spec del proveedor) · regresión de US-041; si pasa en verde desde el primer
      commit se documenta así en el PR · commit `test(L1D-126)`
      > Evidencia: `catalogo-version.test.ts` [US-121 AC-4], integración con PostgreSQL real, verde desde el primer commit (regresión de US-041); opción `rutaDelCatalogo` en el gateway de test.
- [x] 1.8 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-126)`

      > Refactor: sin cambios (nada que extraer o integrar en los archivos tocados; la extracción de `comun.schema.json` entró en el `feat`).
## ai-services

- [x] 2.1 Copiar los fixtures `test-apl-1.0.0` y `test-apl-1.0.1` al árbol de tests de `rag-orchestrator`
      (mismo contenido, comprobado por checksum en un test) · test después (fixture)
      · `tests/fixtures/catalogo/test-apl-1.0.{0,1}` + `tests/unit/test_fixtures_de_aplicabilidad.py` (sha256 por archivo contra
      `packages/clinical-catalogs/test/fixtures/`; alterar una copia lo pone en rojo)
- [x] 2.2 Test de integración en rojo: "carga los criterios de mama de test-apl-1.0.0 con su destino, excluyente y
      regla desde CLINICAL_CATALOG_PATH" y "no queda listo con configuracion_invalida cuando aplicabilidad.json no
      cumple su esquema" (soporte del AC-5; Pytest + adapters falsos, sin ruta ni contenido en el log) · TDD
      estricto · commit `test(L1D-126)`
- [x] 2.3 Puerto `CriteriosDeAplicabilidad` en `app/domain/criterios_aplicabilidad.py`, adapter
      `app/infrastructure/catalogo_clinico/aplicabilidad.py` (Pydantic escrito a mano, lectura única al arrancar) y
      *wiring* en `app/bootstrap.py` (D4) · commit `feat(L1D-126)`
- [x] 2.4 Test de soporte del AC-5: `test_criterios_aplicabilidad_regla_ecog_se_lee_del_catalogo_montado`: misma
      build, arranque con `test-apl-1.0.0` y `test-apl-1.0.1`; solo `ecog.rule.limits` difiere entre las dos cargas
      del puerto · integración (adapters falsos) · TDD estricto · commit `test(L1D-126)` → verde con 2.3
      > **Diferido a L1D-127** (`[S3 resp. 16]`): el test de aceptación
      > `test_aplicabilidad_rango_ecog_cambia_con_la_version_del_catalogo` con `@pytest.mark.ac("US-121", 5)`
      > (`coincide` → `no_coincide`) se escribe y se pone en verde en L1D-127, con estos fixtures. No es tarea de
      > este change.
- [x] 2.5 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-126)` · sin cambios: revisados `aplicabilidad.py`, `criterios_aplicabilidad.py` y el wiring de
      `bootstrap.py`; cada función hace una cosa y no hay middle man ni lógica duplicada

## evaluación

- [x] 3.1 `run-ai-eval` sobre la rama (el PR cambia el catálogo, AC-T5.4); adjuntar el reporte de
      `reports/eval/` al PR · evaluate · hecho con adapters falsos: sin regresión (Δ = 0 contra el baseline); fidelidad 0,75 y
      citas 0,80 ya estaban bajo meta en el baseline; no mide los criterios (aún sin uso) ni modelos reales

## cierre

- [x] 4.1 `openspec validate l1d-126-criterios-aplicabilidad-catalogo --strict` · válido; el único INFO es el esperado
      (el archivo rechaza el delta `MODIFIED` hasta archivar L1D-93)
- [ ] 4.2 (parte rag-orchestrator: Pytest 2146 passed, 129 deselected; pendiente la de clinical-api) Suites de `clinical-api` (Vitest) y `rag-orchestrator` (Pytest) en verde; `catalog:validate` en verde
      sobre el catálogo del S3; sin `contracts:verify-provider` (no hay cambios de API)

## Gate 2, vuelta 1 (clinical-platform)

- [x] G1.1 Punto 1: destino escalar en `comun` y `destinoConLista` en aplicabilidad; `attribute_key` lista.
- [x] G1.2 Punto 2: la allowlist excluye `id`, `original_name`, `reference_range`, `source_lab` (adición de seguridad).
- [x] G1.3 Punto 3: `contexto(items)` por entrada del registro. Punto 4 (lado JS): `ARCHIVOS_DE_RAIZ`.
- [x] G1.4 Punto 5: `$defs/version` única. Los esquemas `plantillas`, `tendencias` y `sinonimos` conservan el patrón
      estricto `^\d+\.\d+\.\d+$` (no los recorre el validador; no admiten fixtures `test-*`).
- [x] G1.5 Punto 6: puntaje solo en claves propias del criterio; nuevos nombres.
- [ ] G1.6 **Deuda: registro de archivos de raíz del catálogo (lado API).** El mapa `ESQUEMAS` de
      `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts` sigue listando a mano `atributos` y
      `poblacion`; debe derivar de `ARCHIVOS_DE_RAIZ` (imports JSON estáticos en TS). Destino: deuda: registro de
      archivos de raíz del catálogo.
- [ ] G1.7 **Pendiente de modelo:** las claves `grado`, `estado_menopausico` y `estado_castracion` de `poblacion.json`
      están fuera del modelo v1.1; anotarlo en `docs/architecture/data-model.md` (fuera de mis paths). Destino:
      orquestador / L1D-117.

