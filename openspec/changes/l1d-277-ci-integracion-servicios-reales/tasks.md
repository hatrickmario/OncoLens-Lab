# Tasks — l1d-277-ci-integracion-servicios-reales

## 1. clinical-platform

- [x] 1.1 [Test después · CI] Verificar en la última ejecución de `main` que `integration` corre en verde, registrar el número de tests y confirmar que está en `needs` de `ci-ok` [ARR-01 AC-1]
- [x] 1.2 [Test después · Compose] Perfil de test con `postgres`, `milvus-etcd`, `milvus-minio` y `milvus-standalone` (sin `clinical-minio`), y target de test de la imagen de `rag-orchestrator` con `requirements-dev.txt` (design.md D1)
- [x] 1.3 [Test después] `scripts/ci/integracion-rag-orchestrator.sh` (secretos ficticios, espera de salud con tiempo máximo explícito, `docker compose run` en `corpus-db-net` + `ai-net`, `pytest -m servicios_reales --junitxml`, resumen por `ac`, `down -v`) y su test de shell (sin puertos publicados; falla si Milvus no queda sano; el contenedor de Pytest solo tiene montados los secretos de `rag_corpus`, Milvus de test y la clave pública fingida, ninguno de clinical, design.md D1b) [ARR-01 AC-2, AC-3]
- [x] 1.4 Job `integration-rag` en `ci.yml` (acciones por SHA, `permissions: contents: read`, `timeout-minutes: 30`, sin `continue-on-error`) y en `needs` de `ci-ok` [ARR-01 AC-2]
- [ ] 1.5 Activar `ac2-cited-sources-build` cuando se archive `l1d-140-panel-opcion-citas`; si no se archiva en este sprint, diferir a ARR-06 (L1D-282) [ARR-01 AC-4]
- [x] 1.6 Actualizar `docs/process/ci.md` (fila `integration-rag`)
- [ ] 1.7 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-277)`

## 2. ai-services

- [ ] 2.1 Ejecutar `pytest -m servicios_reales` con el script en local; ajustar solo la configuración de conexión de los fixtures (host del Compose, no `localhost`) si hiciera falta, sin cambiar aserciones [ARR-01 AC-2]
- [ ] 2.2 Confirmar que US-058 AC-1, AC-3, AC-4 y US-059 AC-1, AC-3, AC-4, AC-5 tienen `@pytest.mark.ac` y se ejecutan en verde; si alguno no tiene test, escribirlo (test de aceptación del AC) [ARR-01 AC-3]
- [ ] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-277)`

## 3. Cierre

- [ ] 3.1 `openspec validate l1d-277-ci-integracion-servicios-reales --strict`
- [ ] 3.2 Jobs `integration` e `integration-rag` en verde en el PR; enlazar la salida en L1D-114 y L1D-115
