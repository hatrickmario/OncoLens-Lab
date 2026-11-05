# Tasks — d5fb-02-listado-faltantes-criticos-reales

> ⛔ Ninguna dependencia abierta (`l1d-95` archivado). Origen: feedback de la Demo 5, **sin L1D asignado**; crear la
> historia en Linear solo con aprobación del usuario.
> Matriz TDD (CLAUDE.md): servicio con lógica, endpoint y autorización → **TDD estricto, doble bucle** (commit `test(<id>)`
> con el AC en rojo, que falla en la aserción —esqueleto con `throw new Error('no implementado')`—, antes del `feat`);
> componente de `web` → test del AC primero (Testing Library + MSW desde `contracts/examples/`); contrato, ejemplos,
> seed y guía → test después. Integración con PostgreSQL real de test; mocks solo en el HTTP saliente; nunca `vi.mock` de
> módulos propios ni de Prisma; reloj e IDs inyectados; nunca `.skip`/`.only`/`it.todo`. Secuencia: contract → test → feat → refactor.

## 1. contratos

- [ ] 1.1 (`sync-contracts`) Editar primero `apps/clinical-api/openapi.yaml`: `PatientListItem.completenessAvailable` (opcional, descripción de `design.md` §Contratos) y `info.version` al siguiente menor libre (tentativo `1.21.0`; rebasar sobre `main` y confirmar la cadena). Ejemplo `contracts/examples/patient-list-checklist-no-disponible.json` registrado en `index.json`; `contracts:generate`. Verificación: `contracts:check`, `contracts:generate:check`, `contracts:breaking` (sin ERR) en verde. Commit `contract(<id>)`.

## 2. clinical-platform

- [ ] 2.1 (TDD estricto) Test de aceptación en rojo · Supertest + PostgreSQL real, seed + catálogo real: «el listado trae ≥ 2 pacientes de mama con missingCriticalCount > 0 y cada contador iguala al de su ficha [feedback Demo 5]» y «la búsqueda devuelve el mismo contador que el listado». Esqueleto de `calcularVarios` con `throw new Error('no implementado')`. Commit `test(<id>)`.
- [ ] 2.2 (TDD estricto) Tests de aceptación en rojo (integración): un paciente que falla → `200`, fila con `0` y `completenessAvailable = false`, las demás reales; lote que lanza → todas las filas «no disponible» y log `checklist_no_disponible` sin identidad ni error de `pg`; tipo no habilitado y sin diagnóstico → `0` sin `completenessAvailable = false`; `admin` → `PatientAdminSummary` sin contador y el fake de completitud no se invoca; consultas de completitud iguales con página de 1 y de N (contador de consultas). Commit `test(<id>)`.
- [ ] 2.3 (TDD estricto) Unitarios uno a uno del servicio: `calcularVarios` con lista vacía, un paciente, varios, uno inexistente, uno que lanza (aislado); `calcular(id)` sobre `calcularVarios([id])` conserva `PacienteNoEncontradoError`. Repositorio: `registrosSinFiltrarPorRevisionVarios(ids, entidades)` una consulta por entidad, agrupa por paciente, sin leer `identity`. Test de equivalencia `calcularVarios` ≡ `calcular` para todo el seed. Commit `feat(<id>)` cuando 2.1–2.2 pasan.
- [ ] 2.4 (TDD estricto) `patients.service.ts`: `paginar()` invoca `calcularVarios` solo si la vista tiene datos clínicos; arma `missingCriticalCount` y `completenessAvailable` (omitido si `true`, `false` en degradación); registra `checklist_no_disponible` (UUID/conteo, `traceId`, clase de error). Se elimina `FALTANTES_CRITICOS_POR_AHORA` y su comentario. Los tests existentes del servicio no se debilitan; el AC «no invoca el servicio por fila» cambia de AC en la spec de este change y se actualiza con `Test-Removal:` si se retira. Commit `feat(<id>)`.
- [ ] 2.5 (test después) No-fuga: logs del listado y la búsqueda sin identidad, valores clínicos ni error de `pg` (`tests/support/captura-de-salidas.ts`).
- [ ] 2.6 Refactor en verde, commit `refactor(<id>)`; sin bajar la cobertura del módulo.

## 3. frontend

- [ ] 3.1 (test del AC primero) Test en rojo · Testing Library + MSW (`patient-list-checklist-no-disponible.json`): la celda muestra «3», «0» y «No disponible» como texto y no bloquea el enlace a la ficha. Commit `test(<id>)`; luego `feat(<id>)` mínimo (celda + cadena en `messages/es.json`, sin términos prohibidos, RN-23). `visual-check` del listado a 375 y 1280 px.

## 4. seed y documentación

- [ ] 4.1 (test después) Confirmar el conteo de pacientes de mama con faltantes en el seed corriendo la prueba `pacientes-momentos.test.ts` (incluye (a)–(f), que la guía no detalla). Si es ≥ 2, **no se toca el seed**; si es < 2, proponer al usuario un paciente sintético nuevo (pregunta abierta 1).
- [ ] 4.2 Actualizar `docs/demo/guia-demo-S5.md`: la columna «Faltantes críticos» del listado refleja el cálculo real y qué pacientes muestran qué número (próstata en 0 con `ENABLED_CANCER_TYPES=mama`).

## 5. evaluación

- [ ] 5.1 (exento) Sin cambio de modelo, prompt, umbral, catálogo ni corpus: `run-ai-eval` no aplica (nota en el PR).

## 6. Verificación

- [ ] 6.1 `openspec validate d5fb-02-listado-faltantes-criticos-reales --strict` en verde.
- [ ] 6.2 Suite de `apps/clinical-api` y de `apps/web` en verde, `contracts:verify-provider`, `tsc --noEmit`, `eslint`, `lint:lenguaje` y `pii-scan` limpios; p95 del listado medido antes y después (seed de 13) y anotado en el PR (design D7).

## Preguntas abiertas

1. ¿Basta con los pacientes de mama del seed con faltantes (g, h, i y los de (a)–(f) que se confirmen)? Previsto: sí, sin añadir pacientes.
2. ¿Presupuesto numérico de p95 para `GET /platform/patients`? Propuesto: sin regresión apreciable y consultas acotadas.
3. ¿Qué menor de `info.version` toma este change según el orden real de merges (tentativo `1.21.0`)?
