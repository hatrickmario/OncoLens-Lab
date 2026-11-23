# Tasks — l1d-126-criterios-aplicabilidad-catalogo

> Sin cambio de API: no hay sección `## contratos` con tareas (ver `design.md`, Contratos).
> Requiere en `main` el change de L1D-93 (US-001: `catalog:validate`, regla de destino, versión del S3) y se archiva
> después de él (delta `MODIFIED`, `[S3 resp. 16]`). El test del AC-5 con estado calculado vive en L1D-127.
>
> **Sprint 7 (movido-S7, 2026-11-22):** lo que falta está en la sección «Sprint 7» del final, agrupado por ventana
> (antes de la corrida base · corrida base · corrida final). Esa sección manda sobre los destinos antiguos de las tareas
> abiertas (G1.6, G2.3, G2.4 y G2.6 decían «US-232»). Las tareas `[x]` no se tocan.
>
> **Dos PR (Gate 1 del S7, 2026-11-22):** **parte A** = S7.1–S7.4c (sin cambio de versión del catálogo, antes de la
> corrida base); **parte B** = S7.5–S7.14 (C-1, C-2, C-4, C-5; catálogo `1.10.0` → `1.11.0`, después de `l1d-335`).

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
      verde antes y después, commit `refactor(L1D-126)` · Rename `CriterioDeAplicabilidad.estado` → `estado_de_revision` (Gate 2 P1); el
      resto revisado sin cambios (`aplicabilidad.py`, `criterios_aplicabilidad.py`, wiring de `bootstrap.py`)
      > Deuda (Gate 2 m3): el puerto `CriteriosDeAplicabilidad` vive en `app/domain/` y no en `app/application/ports.py`
      > con los demás; se deja donde está.
      > **Pregunta para el usuario:** hoy `rag-orchestrator` no arranca si `aplicabilidad.json` es inválido aunque
      > nada lo consuma hasta US-122 (L1D-127). ¿Se mantiene el arranque estricto o se difiere hasta que haya consumidor?
      > `criterios(tipo) == ()` significa «tipo no declarado» o `items` vacío; el consumidor no los distingue.

## evaluación

- [x] 3.1 `run-ai-eval` sobre la rama (el PR cambia el catálogo, AC-T5.4); adjuntar el reporte de
      `reports/eval/` al PR · evaluate · reporte en `reports/eval/l1d-126-criterios-aplicabilidad-catalogo.{json,md}`; hecho con adapters falsos: sin regresión (Δ = 0 contra el baseline); fidelidad 0,75 y
      citas 0,80 ya estaban bajo meta en el baseline; no mide los criterios (aún sin uso) ni modelos reales

## cierre

- [x] 4.1 `openspec validate l1d-126-criterios-aplicabilidad-catalogo --strict` · válido; el único INFO es el esperado
      (el archivo rechaza el delta `MODIFIED` hasta archivar L1D-93)
- [x] 4.2 (rag-orchestrator: Pytest 2208 passed, 129 deselected; clinical-api: unit 902/902 e integración 399/399 con PostgreSQL de test tras integrar main) Suites de `clinical-api` (Vitest) y `rag-orchestrator` (Pytest) en verde; `catalog:validate` en verde
      sobre el catálogo del S3; sin `contracts:verify-provider` (no hay cambios de API)

## Gate 2, vuelta 1 (clinical-platform)

- [x] G1.1 Punto 1: destino escalar en `comun` y `destinoConLista` en aplicabilidad; `attribute_key` lista.
- [x] G1.2 Punto 2: la allowlist excluye `id`, `original_name`, `reference_range`, `source_lab` (adición de seguridad).
- [x] G1.3 Punto 3: `contexto(items)` por entrada del registro. Punto 4 (lado JS): `ARCHIVOS_DE_RAIZ`.
- [x] G1.4 Punto 5: `$defs/version` única. Los esquemas `plantillas`, `tendencias` y `sinonimos` conservan el patrón
      estricto `^\d+\.\d+\.\d+$` (no los recorre el validador; no admiten fixtures `test-*`).
- [x] G1.5 Punto 6: puntaje solo en claves propias del criterio; nuevos nombres.
- [x] G1.6 **Deuda: registro de archivos de raíz del catálogo (lado API).** El mapa `ESQUEMAS` de
      `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts` sigue listando a mano `atributos` y
      `poblacion`; debe derivar de `ARCHIVOS_DE_RAIZ` (imports JSON estáticos en TS). Destino: deuda: registro de
      archivos de raíz del catálogo. Antes trasladada a US-232 (usuario, 2026-10-27); movida al S7 y hecha.
      _Evidencia:_ hecha en S7.1 (parte A del S7); ver su evidencia en la sección «Sprint 7».
- [x] G1.7 **Pendiente de modelo:** las claves `grado`, `estado_menopausico` y `estado_castracion` de `poblacion.json`
      están fuera del modelo v1.1; anotarlo en `docs/architecture/data-model.md` (fuera de mis paths). Destino:
      orquestador / L1D-117. _Evidencia:_ anotado en `docs/architecture/data-model.md` («Claves de `poblacion.json`
      (L1D-117, S3)», PR #210).

## Decisiones del usuario (2026-10-24) tras el Gate 2

- **Decidido (usuario, 2026-10-24):** se confirma la asimetría de `poblacion.json` (clinical-api lo exige;
  rag-orchestrator no lo lee hasta US-122) y `rag-orchestrator` mantiene el arranque estricto con `aplicabilidad.json`
  inválido (design.md).
- **Decidido (usuario, 2026-10-24):** control de CI contra cambios de contenido sin subir versión, asignado a L1D-126
  (design.md D8).
- [x] G2.1 `scripts/catalog/version-guard.mjs` + `npm run catalog:version-guard` + paso en el job `build-test`
      (`.github/workflows/ci.yml`, con fetch superficial del commit base). Tests de aceptación con repos temporales en
      `version-guard.test.mjs`: rojo (7 fallos por aserción), verde 10/10; mutación: sin la comparación de versión
      falla «pasa cuando el contenido cambia y manifest.version es nueva».
- [x] G2.2 Endurecimiento del guardián (privacy-guardian M-1, m-1, m-2, m-3, m-5, P-1): huella del archivo entero,
      unión de tipos y `manifest`, `base_ilegible`, `version_no_sube`, registro explícito ampliado (design D8). La
      rama `git ls-tree`/`maxBuffer` del error de git no tiene test propio (solo el JSON ilegible).
- [x] G2.3 **Deuda (m-4): base desfasada de `pull_request.base.sha`.** Usar el primer padre del merge (`HEAD^1`, con
      `fetch-depth: 2`) o exigir rama al día en la protección de `main`. Antes destino US-232 (usuario, 2026-10-27); movida al S7 y hecha.
      _Evidencia:_ hecha en S7.2 (parte A del S7); ver su evidencia en la sección «Sprint 7».
- [x] G2.5 Menor 1 (base vacía solo cubre listas) y Menor 3 (`violacionesDeVersion` devuelve `base_ilegible`): tests en
      rojo y verde; el Lint (`no-unused-vars` de la desestructuración) se resuelve con `sinClaves`.
- [x] G2.4 **Deuda (Menor 2):** evasión en dos pasos (vaciar y rellenar una lista publicada). Riesgo aceptado: vaciar
      una lista publicada exige revisión humana explícita. Antes destino US-232 (usuario, 2026-10-27); movida al S7 y hecha.
      _Evidencia:_ hecha en S7.3 (parte A del S7); ver su evidencia en la sección «Sprint 7».
- [x] G2.6 **Deuda (Menor 4):** la `version` propia de cada archivo por tipo queda fuera de la huella y
      `catalog:validate` no exige que coincida con `manifest.version`. Antes destino US-232 (usuario, 2026-10-27); movida al S7 y hecha.

      _Evidencia:_ hecha en S7.4 (parte A del S7); ver su evidencia en la sección «Sprint 7».
## Sprint 7 (movido-S7) · revisión clínica provisional y deudas

> Alcance: `proposal.md` («Alcance del Sprint 7») y `design.md` (D9…D16). C-3 no entra. Nada pasa a «validada»; DEC-11
> (L1D-125) sigue sin firma y la regla F-20…F-24 no cambia. Regla del sprint: ninguna cifra sin reporte versionado en
> `reports/eval/` producido por `run-ai-eval`. Contenido del catálogo: sin TDD (suite `evaluate`); reglas del validador y
> reglas puras de dominio: TDD estricto; guardián y CI: test en el mismo PR.

### (a) Antes de la corrida base · PARTE A (PR A) · deudas del Gate 2 (no cambian contenido clínico ni disparan `evaluate`)

Cierran las tareas abiertas G1.6, G2.3, G2.4 y G2.6 de arriba; cada una se marca `[x]` allí con su evidencia. La parte A
**no cambia `manifest.version`** ni ningún archivo de contenido del catálogo. Se mergea antes de la corrida base.

- [x] S7.1 (clinical-platform · G1.6) El mapa `ESQUEMAS` de `apps/clinical-api/src/infrastructure/catalogo/validar-catalogo.ts`
      deriva de `ARCHIVOS_DE_RAIZ`; test de integración que arranca con un archivo de raíz nuevo en un fixture · commits
      `test(L1D-126)` y `feat(L1D-126)` · verificación: Vitest de `clinical-api` en verde. Solo derivan las entradas
      de raíz; el mapa sigue abierto: `l1d-335` añadirá `sinonimos` después, así que ni el tipo ni un test fijan la
      lista exacta de claves (design D15).
      _Evidencia (parte A):_ `validar-catalogo-raiz.test.ts`: rojo `expected [Function] to not throw an error but
      'ConfiguracionInvalidaError: CLINICAL_…' was thrown` (commit `test`); verde 2/2; Vitest de `clinical-api` 149 archivos y
      1393 tests, integración 169 archivos y 888 tests con PostgreSQL real. Mecanismo y alternativas descartadas: design D17.
- [x] S7.2 (clinical-platform · G2.3) `catalog:version-guard` compara contra el primer padre del merge (`HEAD^1`,
      `fetch-depth: 2` en el job) en lugar de `pull_request.base.sha`; test con repos temporales de una base desfasada ·
      `test(L1D-126)` y `ci(L1D-126)` · verificación: `version-guard.test.mjs` en verde y el job `build-test` del PR.
      _Evidencia (parte A):_ `catalogVersionGuardWorkflow.test.mjs` rojo 3/3 en la aserción (`fetch-depth` indefinido,
      `--base "$BASE_REF"`, paso `git fetch … BASE_REF`), verde 3/3 tras el commit `ci`; `version-guard.test.mjs` con repos
      temporales de una base desfasada (merge con primer padre = punta de `main`): falla con `HEAD^1`, pasa si la versión sube.
- [x] S7.3 (clinical-platform · G2.4) El guardián falla con un código propio cuando una lista con contenido en la base
      queda vacía (design D15, mecanismo asumido); test en rojo antes · verificación: `version-guard.test.mjs`. Si el
      humano prefiere mantener el riesgo aceptado, la tarea se cierra como no accionable con su nota.
      _Evidencia (parte A):_ rojo 2 fallos por aserción en `version-guard.test.mjs` (`lista_vaciada`), verde 29/29; código
      `lista_vaciada <archivo>` (con o sin subir la versión). Sin decisión humana en contra: el riesgo aceptado se cierra.
- [x] S7.4 (clinical-platform · G2.6) `catalog:validate` comprueba la `version` propia de cada archivo por tipo frente a
      `manifest.version` (design D15, regla asumida); test del validador en rojo antes · verificación: `catalog:validate`
      en verde sobre el catálogo vigente y en rojo sobre un fixture con una `version` mayor que la del manifiesto.
      _Evidencia (parte A):_ `version-propia.test.mjs` rojo 2 fallos (`expected +0 not to be +0`), verde 4/4; la regla
      `version_mayor_que_manifiesto` vive en `validator/versiones.mjs` y el guardián reutiliza su comparación.
      `catalog:validate OK catalogVersion=1.9.0`.
- [x] S7.4b (clinical-platform) Definición única de `revision_provisional`: `schemas/comun.schema.json#/$defs/revisionProvisional`
      (`rol` ∈ {`ia`}, `fecha` ISO, `additionalProperties: false`). Solo la definición: ningún archivo de contenido la usa
      todavía y la versión no sube. `l1d-335` y la parte B la referencian con `$ref`, sin redefinirla (design D9) ·
      test del validador: «acepta un bloque con rol ia y fecha ISO y rechaza un rol desconocido» · `test(L1D-126)` y
      `feat(L1D-126)`.
      _Evidencia (parte A):_ `revision-provisional.test.mjs` rojo 2 fallos por aserción (`expected undefined to deeply equal
      [ 'ia' ]`, `expected false to be true`), verde 4/4; sin cambio de contenido ni de versión.
- [x] S7.4c (clinical-platform y ai-services) Los tests que fijan el literal de la versión del catálogo (`1.9.0`) pasan
      a leer `manifest.version` · no cambia ninguna otra aserción; se declara en el PR · verificación: suites de
      `clinical-api`, `rag-orchestrator` y `packages/clinical-catalogs` en verde con el catálogo vigente.
      _Evidencia (parte A):_ commit `refactor(L1D-126)`: Pytest de `rag-orchestrator` 5109 pasan; `clinical-api` 1393 unitarios y
      888 de integración; `scripts/catalog` + `packages/clinical-catalogs` 226. `plantillas.test.mjs` conserva su `version: '1.9.0'`
      (versión de un archivo ficticio, no la del catálogo) y `test_chat_faltantes.py` ya la lee del manifiesto.

### (b) Corrida base

Nada de este change. La corrida base (`[S7 resp. 2]`) usa el catálogo vigente (`manifest.version = 1.9.0`), con la
parte A ya mergeada, y es la referencia con la que se compara la corrida final. Corre con los umbrales actuales
(`[S7 resp. 11]`) y cada familia sobre su corpus fijo (`[S7 resp. 10]`).

### Mejoras entre la corrida base y la final · PARTE B (PR B) · catálogo (código y datos, sin modelos reales)

Orden: `l1d-126` parte A → corrida base → `l1d-335` (catálogo `1.10.0`) → **parte B** (catálogo `1.11.0`) → partes de
`l1d-299` y `l1d-246` que dependen de la parte B. La parte B nunca va en paralelo con `l1d-335`: parte de su `main`.

- [ ] S7.5 (clinical-platform) Esquemas: `revision_provisional` opcional en `schemas/aplicabilidad.schema.json` y **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `schemas/poblacion-reglas.schema.json` por `$ref` al `$defs` de S7.4b (sin redefinirlo), y `rule.subsetOf` opcional
      en aplicabilidad (design D9, D11). Test de aceptación en rojo: «termina con código ≠ 0 y nombra el criterio cuando
      revision_provisional trae un rol desconocido [US-121 AC-1]» · TDD estricto · `test(L1D-126)` y `feat(L1D-126)`.
- [ ] S7.5b (clinical-platform · `[S7 resp. 9]`) Bloque `validation` (design D14): `history` opcional en **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `schemas/validation.schema.json` y las reglas con nombre del validador `validacion_provisional_incoherente` e
      `historial_con_huella_vigente`. Tests de aceptación en rojo, uno por escenario: «valida cuando el bloque es de
      revisión provisional de la IA y conserva la revisión del asesor en el historial [US-121 AC-1]», «termina con
      código ≠ 0 cuando una revisión provisional declara un rol que no es ia [US-121 AC-1]» y «termina con código ≠ 0
      cuando el historial lleva la huella vigente [US-121 AC-1]» · TDD estricto · `test(L1D-126)` y `feat(L1D-126)`.
- [ ] S7.6 (ai-services) Lectores: `app/infrastructure/catalogo_clinico/aplicabilidad.py` y `poblacion_reglas.py` aceptan **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `revision_provisional`, `subsetOf` y `validation.history`; el dominio no recibe la marca de revisión ni el
      historial · test de carga en rojo antes ·
      verificación: Pytest de `tests/unit` e `integration` de catálogo.
- [ ] S7.7 (ai-services · C-2) Regla pura con nombre `codigos_del_paciente()` en **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `app/domain/clasificacion_de_poblacion.py`: el código del paciente más sus ascendientes declarados en el catálogo.
      Tests de aceptación en rojo, uno por escenario: «coincide con fuentes de HER2 negativo y de HER2 bajo cuando la
      paciente tiene IHC 1+ [US-121 AC-5]», «no coincide con una fuente restringida a HER2 bajo cuando la paciente tiene
      IHC 0 [US-121 AC-5]», «queda desconocido y no negativo cuando el IHC es 2+ sin ISH [US-121 AC-5]» · TDD estricto ·
      fixture de catálogo de test nuevo en `tests/fixtures/catalogo/` (los `test-apl-*` existentes no cambian).
- [ ] S7.8 (ai-services · C-1) Lectura declarativa de M0/M1 desde `stage_value` en TNM (design D10, mecanismo asumido) y **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      tests de aceptación en rojo: «no coincide y hace la población no comparable cuando la fuente se restringe a
      enfermedad metastásica y el paciente tiene enfermedad localizada [US-121 AC-5]», «queda desconocido sin
      restricción explícita [US-121 AC-5]», «localizada y localmente avanzada no se excluyen [US-121 AC-5]» y el
      repliegue de SC-1: «queda desconocido con sin_regla_de_comparacion y no hace la población no comparable cuando
      el estadio del paciente no permite leer M0 ni M1 [US-121 AC-5]» · TDD estricto. Si la lectura de M no cabe como
      dato del catálogo, parar y preguntar: no se escribe una regla por tipo de cáncer en código; en ese caso solo
      queda el repliegue y se avisa a `l1d-246` y `l1d-299` (design D10, SC-1).
- [ ] S7.9 (clinical-platform · contenido, sin TDD) `prostata/aplicabilidad.json`: `extension.isExclusionary = true` y sus **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      dos códigos (C-1); `hrr_brca` con cuatro valores (C-5). `prostata/poblacion-reglas.json`: sinónimos es/en de
      `extension`, `hrr_brca` y `estado_castracion`. `mama/aplicabilidad.json`: `estado_her2` con `positivo`, `bajo`,
      `negativo` y `subsetOf` (C-2). `mama/poblacion-reglas.json`: sinónimos de `bajo`; triple negativo fuera de
      `receptores_hormonales` y dentro de `negativo` en los dos criterios (C-4). Cada criterio y bloque tocado con
      `revision_provisional: {rol: ia, fecha: 2026-11-21}` y `estado = "propuesta"`. Sin contenido de NCCN ni de ESMO.
      En los dos `aplicabilidad.json`, el bloque `validation` pasa a `status = "revision_provisional"`,
      `reviewerRole = "ia"`, `date = "2026-11-21"`, y la revisión del S3 (`oncologo_asesor`, `2026-10-24`) pasa a
      `history` con su huella de entonces, sin recalcular (`[S7 resp. 9]`, design D14).
- [ ] S7.10 (clinical-platform) Tests de contenido en `packages/clinical-catalogs/test/`: los escenarios de catálogo del **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      delta (`extension` excluyente, cuatro valores de `hrr_brca`, triple negativo proyectado, marca provisional,
      bloque `validation` provisional con su historial). La
      aserción «el resto `isExclusionary = false`» de `contenido-aplicabilidad.test.mjs` cambia porque el escenario
      cambió en este delta (C-1): se declara en el mensaje del commit y en el PR; no se relaja ninguna otra aserción.
- [ ] S7.11 (clinical-platform) Versión y huellas (design D14): subir `manifest.version` de `1.10.0` (la que deja **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `l1d-335`) a `1.11.0`, la `version` de cada archivo tocado, recalcular el `validation.catalogHash` del bloque
      principal (no el de `history`) y `manifest.poblacionReglas.<tipo>.catalogHash` con `catalog:hash`, y actualizar
      los `contracts/examples/` y fixtures que citan la versión; los tests ya la leen del manifiesto (S7.4c) ·
      verificación: `npm run catalog:validate`, `catalog:version-guard` y `contracts:check` en verde [US-121 AC-4].
- [ ] S7.12 (ai-services) Coherencia con los datasets que leen el catálogo real: `tests/evaluation/test_opciones_coherencia_dataset.py` **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      (OP-07…OP-12, `l1d-246`) y la familia `poblacion` con adaptadores falsos (`l1d-299`) en verde; si un orden esperado
      cambia por C-1 o C-5, se corrige en el change dueño del dataset, no aquí, y después de mergear la parte B. El PR
      dice cuál de los dos resultados de SC-1 quedó (con `no_coincide` o solo el repliegue).
- [ ] S7.13 `eval-required` con adaptadores falsos en el PR (cambia el catálogo, AC-T5.4): sin regresión frente a **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `data/evaluation/baseline.json`; si el baseline cambia solo por `catalogVersion`, se regenera y se dice en el PR.
- [ ] S7.14 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      antes y después, commit `refactor(L1D-126)`.

### (c) Corrida final

- [ ] S7.15 `run-ai-eval` con modelos locales (`ai-eval-runner`) con el catálogo del S7 (`1.11.0`) frente a la corrida **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      base, con los umbrales actuales (`[S7 resp. 11]`) y el corpus fijo de cada familia declarado en el reporte
      (`[S7 resp. 10]`): suites
      `aplicabilidad`, `poblacion` (`l1d-299`) y `opciones` (`l1d-246`); el reporte va a `reports/eval/` (ruta protegida)
      y rotula todo `no_validada`. Una regresión se reporta con los ids de caso; no se relaja ninguna meta.
- [ ] S7.16 Cierre: `openspec validate l1d-126-criterios-aplicabilidad-catalogo --strict`; suites de `clinical-api` y **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      `rag-orchestrator` en verde; CI del PR con 0 fallos, 0 pendientes y 0 alertas antes de pedir el merge.

### humano (S7)

- [ ] H-S7.1 Actualizar el AC-1 de US-121 en `backlog/features/FEAT-08b-aplicabilidad.md` (hoy solo nombra `estado_her2` y **TRASLADADA a entrega 2 (parte B, tras l1d-335)**: el AC-1 ya está actualizado en el backlog (verificado, 2026-11-22); falta adjuntar Q-1…Q-4 a US-021 · DEC-11, que no está en `backlog/features`.
      `estado_castracion` como excluyentes) y adjuntar Q-1…Q-4 a US-021 · DEC-11. Lo hace la sesión principal.
- [ ] H-S7.2 Responder los «Pendientes del S7» de `design.md`: IHC 2+ sin ISH como dato faltante, criterios compuestos, **TRASLADADA a entrega 2 (parte B, tras l1d-335)**.
      dos o tres códigos en `extension`, y los mecanismos de G2.4 y G2.6. El bloque `validation` ya está decidido
      (`[S7 resp. 9]`); quedan asumidos el nombre `history` y los códigos de sus dos reglas.

