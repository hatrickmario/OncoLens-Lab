# Tasks — l1d-93-catalogo-datos-criticos-validado

> Sin cambio de API: no hay tareas de `## contratos` (ver `design.md`, Contratos).
> Va antes de `l1d-126-criterios-aplicabilidad-catalogo` (misma oleada, merge primero, o oleada anterior).

## clinical-platform

- [x] 1.1 Fixtures FX-04-a en `packages/clinical-catalogs/test/fixtures/`: `test-1.0.0` (todos los ítems con
      `destination`, un criterio de aplicabilidad mínimo `estado_menopausico`, `atributos.json`), `test-1.1.0`
      (con bloque `validation` `propuesta_revisada`, `scope` array y `catalogHash` en `datos-criticos.json` y en
      `mama/aplicabilidad.json` con `scope = ["aplicabilidad"]`) y copias inválidas por AC (sin destino en `ki67`;
      criterio sin destino; `Diagnosis.menopause`; `PatientIdentity.id_type`; `attribute_key` no declarada;
      criterio de aplicabilidad revisado modificado; condición con clave inexistente;
      condición sin `whenConditionUnknown`; `estado = "aprobado"`), más un `schema.prisma` de fixture sin
      `performance_value` · test después (fixture)
- [x] 1.2 Test de aceptación en rojo: "termina con código 0 e informa catalogVersion test-1.0.0 cuando todos los ítems
      tienen destino [US-001 AC-1]" · integración (proceso real `catalog:validate`, timeout explícito de 30 s) · TDD
      estricto · commit `test(L1D-93)` (con esqueleto del script que lanza `no implementado`)
- [x] 1.3 Tests de aceptación en rojo de AC-2, AC-3, AC-4 (cuatro escenarios, con `PatientIdentity.*` →
      `destino_inexistente`), AC-5 (dos) y AC-8 (tres, con el `scope` `aplicabilidad`): código ≠ 0 y
      mensaje con el ítem, sin ruta ni valores · integración (proceso real, timeout 30 s) · TDD estricto · commit
      `test(L1D-93)`
- [x] 1.4 Esquemas estrictos `datos-criticos.schema.json` y `atributos.schema.json` (D1) · TDD estricto (dentro del
      bucle de 1.2–1.3)
- [x] 1.5 Generar la allowlist del modelo desde el DMMF (`scripts/catalog/generar-allowlist.mjs`,
      `validator/modelo.allowlist.json`) limitada a `Diagnosis`, `Exam`, `Biomarker`, `PriorTreatment`,
      `ClinicalAttribute`, `ClinicalEvent` (`[S3 resp. 16]`) y test de CI "allowlist commiteada = regenerada" · test
      después
- [x] 1.6 Núcleo puro `validarCatalogo()` con las reglas con nombre de D2, extrayendo `exigirDestino()`,
      `exigirDestinoExistente()`, `exigirAtributoDeclarado()` (RN-29), `exigirCondicionBienFormada()`,
      `exigirEstadoValido()` y `verificarCatalogHash()`, unitarios uno a uno; script `catalog:validate` y
      `catalog:hash` en `package.json` de raíz; AC-1…AC-5 y AC-8 en verde · TDD estricto · commit `feat(L1D-93)`
- [x] 1.7 Test de aceptación en rojo: "no queda listo y registra configuracion_invalida con motivo catalogo_invalido y
      el código de la regla, sin ruta ni contenido, cuando el catálogo no valida [US-001 AC-6]" y regresión del
      directorio inexistente [US-041 AC-5] · integración (arranque real de `clinical-api`, timeout 30 s) · TDD
      estricto · commit `test(L1D-93)`
- [x] 1.8 Arranque: `validarCatalogo` en `src/startup.ts`, motivo `catalogo_invalido` en `src/config/secciones.ts`
      (D5); AC-6 en verde · TDD estricto · commit `feat(L1D-93)`
- [x] 1.9 Test de aceptación en rojo: "lista exactamente las claves de mama y próstata con destino y estado propuesta,
      gleason_isup → Diagnosis.grade, tnm → Diagnosis.stage_value y HER2 IHQ/ISH por exam_type [US-001 AC-7]" · test
      del catálogo · commit `test(L1D-93)`
- [x] 1.10 Contenido `mama/datos-criticos.json`, `prostata/datos-criticos.json` y `atributos.json` del S3 (D1, Q1 y
      Q4 de `propuesta_revisada`), `catalog:validate` con código 0 sobre `packages/clinical-catalogs` · commit
      `feat(L1D-93)`
- [ ] 1.11 Subir `manifest.json` y archivos por tipo a `1.1.0` (D6) y actualizar `CLINICAL_CATALOG_VERSION` en
      Compose, CI y fixtures de test de ambos backends; regresión del `409` y del test de esquemas de US-041 en verde ·
      test después · commit `feat(L1D-93)`
- [x] 1.12 Job de CI: `catalog:validate` y chequeo de allowlist en `.github/workflows/ci.yml`, verificado con un
      fixture de PR inválido · test después
- [x] 1.13 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en
      verde antes y después, commit `refactor(L1D-93)`

## evaluación

- [ ] 2.1 `run-ai-eval` sobre la rama (el PR cambia el catálogo, AC-T5.4 → US-074); adjuntar el reporte de
      `reports/eval/` al PR · evaluate

## cierre

- [x] 3.1 `openspec validate l1d-93-catalogo-datos-criticos-validado --strict`
- [ ] 3.2 Suites de `clinical-api` (Vitest) y `rag-orchestrator` (Pytest, por la subida de versión) en verde;
      `catalog:validate` en verde sobre el catálogo del S3; sin `contracts:verify-provider` (no hay cambios de API)

## Notas de la implementación (L1D-93)

- 1.1: las copias inválidas por AC no se versionan: los tests las derivan en un directorio temporal de `test-1.0.0` /
  `test-1.1.0` (`scripts/catalog/__tests__/apoyo.mjs`), y el `schema.prisma` sin `performance_value` se deriva en el
  test del `schema.prisma` real. Los fixtures versionados son solo los dos catálogos válidos.
- 1.11 **no cerrada**: manifest y archivos por tipo en `1.1.0`, y los tests de `clinical-api` actualizados
  (`etapa-de-servicios`, `estructura-v1`, `catalogo-version`); Compose y la CI no fijan `CLINICAL_CATALOG_VERSION`.
  Falta `apps/rag-orchestrator/tests/unit/test_catalogo_clinico.py:32` (`== "1.0.0"` → `"1.1.0"`), fuera de los paths
  de clinical-platform: TRASLADADA a ai-services-dev (el orquestador asigna el ID). Hasta entonces el Pytest de
  rag-orchestrator falla en ese único test (2006 pasan).
- 2.1 TRASLADADA a ai-eval-runner (Gate 2): `npm run evaluate` no produjo salida en el entorno del implementador.
- 3.2 `clinical-api` (861 tests) y `catalog:validate` en verde; Pytest de rag-orchestrator pendiente de 1.11.
