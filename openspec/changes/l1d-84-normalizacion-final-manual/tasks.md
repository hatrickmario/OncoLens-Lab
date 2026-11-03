# Tasks — l1d-84-normalizacion-final-manual

## 1. contratos

- [ ] 1.1 (exento: sin cambio de spec) Confirmar con `contracts:check` y `contracts:breaking` que el change no toca `apps/clinical-api/openapi.yaml` ni `apps/rag-orchestrator/openapi.yaml` (0 diferencias).

## 2. clinical-platform

- [ ] 2.1 (test después: fixture) Crear FX-01b-b en `packages/clinical-catalogs/test/fixtures/test-normalizacion-1.0.0/` (manifest `test-normalizacion-1.0.0`, `mama|prostata/codigos.json` y `sinonimos.json` con HER2 `LOINC-T-HER2` y sinónimos "c-erbB-2", "ERBB2", "HER-2/neu", RE `LOINC-T-RE`, PSA `LOINC-T-PSA`, Ki-67 `LOINC-T-KI67`, CIE-10 `C50.9`/`C61`, leuprorelina con el ATC real `L02AE02` —el patrón de `atcCodes` del contrato de `rag-orchestrator` no se relaja, `[S5 resp. 10]`—, un procedimiento CUPS de test); el validador del paquete lo acepta (test del validador en verde).
- [ ] 2.2 (TDD estricto) Tests de aceptación en rojo sobre el servicio con el adaptador real y FX-01b-b: "normaliza ERBB2 a HER2 con LOINC-T-HER2 y mapeado [US-098 AC-3]", "reconoce her-2/NEU y c-erbB-2 con espacios como HER2 conservando el texto original [US-098 AC-3]", "asigna L02AE02 y la catalogVersion montada a leuprorelina [US-098 AC-4]", "deja no_mapeado sin código Fármaco experimental X [US-098 AC-4]", "deja no_mapeado un biomarcador ausente del subconjunto LOINC del catálogo real [US-098 AC-4]". Esqueletos de `reconciliation.service.ts`, `ports.ts` y `catalogo-terminologico.ts` con `throw new Error('no implementado')`. Commit `test(L1D-84)`.
- [ ] 2.3 (TDD estricto) Tests de aceptación en rojo: "descarta el código 99999-9 y deja no_mapeado con el texto original [US-098 AC-2]", "sustituye un código inválido por el del catálogo cuando el texto es sinónimo [US-098 AC-2]", "no acepta un código de otro estándar [US-098 AC-2]", "devuelve no_mapeado sin error con un tipo de cáncer sin entradas [US-098 AC-2]", "devuelve mapping_status no nulo en Diagnosis, Biomarker, PriorTreatment y ClinicalEvent procedimiento [US-098 AC-5]", "devuelve n_a sin códigos en un ClinicalEvent progresion [US-098 AC-5]". Commit `test(L1D-84)`.
- [ ] 2.4 (TDD estricto) Implementar `src/modules/reconciliation/` (`createReconciliationService({ catalogo })`) y el adaptador `src/infrastructure/catalogo/catalogo-terminologico.ts`, con unitarios uno a uno. Extraer `clave()`, `resolverCodigo()` (RN-27), `tipoDeEventoSinCodigo()` y `ESTANDAR_DE_ENTIDAD`; ambigüedad → `no_mapeado` y evento `terminologia_ambigua` sin texto (D4). `catalogVersion` solo en la decisión, sin persistir (D5, `[S5 resp. 13]`). Construir el servicio una vez en `server.ts` para inyectarlo en los consumidores. Verificación: 2.2–2.3 en verde. Commit `feat(L1D-84)`.
- [ ] 2.5 (test después: esquema) Integración con PostgreSQL de test: "rechaza una fila sin mapping_status en biomarker, diagnosis, prior_treatment y clinical_event [US-098 AC-5]".
- [ ] 2.6 (test después: arquitectura) "no existe ruta ni comando de CLI que genere, exporte o envíe un reporte a la Cuenta de Alto Costo [US-098 AC-7]": recorre `openapi.yaml` (rutas, `operationId`, descripciones) y los comandos de `src/cli/oncolens.ts`; se comprueba que falla con un fixture que añade `/platform/reports/cac`.
- [ ] 2.7 (test después: arranque) "no arranca con un codigos.json inválido [US-098 AC-2]" en `tests/integration/startup`, con tiempo máximo explícito si lanza el proceso.
- [ ] 2.8 Buscar en `apps/clinical-api/src` asignaciones de `mapeado`/`no_mapeado` fuera del módulo (excepto el seed) y dejar `ReconciliationService` como único dueño de RN-27.
- [ ] 2.9 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-84)`.

## 3. cierre

- [ ] 3.1 `openspec validate l1d-84-normalizacion-final-manual --strict`; suites de `clinical-api` (unitarios e integración) y del validador de `packages/clinical-catalogs` en verde. `contracts:verify-provider` no aplica (sin cambio de API). `run-ai-eval` no aplica: el catálogo real no cambia, solo se añade un fixture de test.
