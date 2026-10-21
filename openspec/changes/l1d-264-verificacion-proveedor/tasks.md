# Tasks — l1d-264-verificacion-proveedor

## 1. clinical-platform

- [ ] 1.1 [Test después · scripts] Test de `verificarRespuesta()` en `scripts/contracts/__tests__/`: código no declarado, cabecera obligatoria ausente, cuerpo fuera de schema y error sin schema, con mensaje que nombra proveedor, método, plantilla, código y ruta JSON sin el valor [US-214 AC-1, AC-2, AC-3]
- [ ] 1.2 Extraer `resolverOperacion()` (ruta concreta → plantilla del spec) y ampliar `responseValidator.mjs` con `verificarRespuesta()`
- [ ] 1.3 [Test después] `apps/clinical-api/tests/support/verificarProveedor.ts` (`clienteVerificado(app)`) y migrar los tests de integración de `request(app)` a él sin cambiar aserciones; los que hoy llaman a `assertMatchesSpec` lo conservan solo si validan un schema distinto del de la respuesta
- [ ] 1.4 Test de aceptación: respuesta con campo no declarado en `EvidenceAnalysis` y error `422` con `code` no declarado hacen fallar el test [US-214 AC-2] [US-214 AC-3] · integración, commit `test(L1D-264)`
- [ ] 1.5 Scripts raíz `contracts:verify-provider` (con `CONTRACT_VERIFY=strict`, tiempo máximo explícito) y `contracts:breaking` (alias de `scripts/ci/contracts-breaking.sh origin/main`) [US-214 AC-1, AC-5]
- [ ] 1.6 [Test después · fixture de PR] Casos de `contracts:breaking`: campo eliminado / vuelto obligatorio falla; con excepción E-n declarada pasa [US-214 AC-5]
- [ ] 1.7 [Test después] Generador de refinamientos en `generate.mjs` → `src/zod/<proveedor>/refinamientos.gen.ts`, falla cerrado ante una construcción desconocida; tests con los parches de `__fixtures__/parches/` [US-214 AC-6]
- [ ] 1.8 Check de `contracts:check` contra `fetch` directo a los proveedores fuera de los clientes generados, con su test [US-214 AC-1]
- [ ] 1.9 CI: `contracts:verify-provider` en el job `integration` (clinical-api) y en `build-test` (rag-orchestrator), ambos en `ci-ok` (design.md D2)
- [ ] 1.10 ADR provider-driven sin Pact en `docs/architecture/adr/` (número siguiente libre)
- [ ] 1.11 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-264)`

## 2. ai-services

- [ ] 2.1 Test de aceptación: adapter falso que devuelve `sin_evidencia` con `topRelevanceScore: 0.0` hace fallar el test de `/rag/query` nombrando la ruta JSON [US-214 AC-2] · integración (`@pytest.mark.ac("US-214", 2)`), commit `test(L1D-264)`
- [ ] 2.2 `event_hook` de respuesta del `TestClient` en `conftest.py` que usa `tests/support/contract.py` para validar status, cabeceras y cuerpo de cada respuesta; suite en verde [US-214 AC-1, AC-3] · commit `feat(L1D-264)`
- [ ] 2.3 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-264)`

## 3. Cierre

- [ ] 3.1 `openspec validate l1d-264-verificacion-proveedor --strict`
- [ ] 3.2 Tests de `scripts/contracts`, integración de `clinical-api` y Pytest en verde; `npm run contracts:verify-provider`, `contracts:generate:check` y `contracts:breaking` en verde
