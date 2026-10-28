# Definition of Done

> Decidida en el cierre del Pre-S1 (2026-10-13, `backlog/sprints/Pre-S1-cierre.md`, P-2). Es la contraparte de la
> Definition of Ready de `/sprint-refine`. El checklist del tipo que toca se copia en la plantilla de PR
> (`.github/pull_request_template.md`), y el Gate 2 (`gate-review`) lo comprueba.

## Común a todo PR

- [ ] Título `[L1D-nn] <título>` y la historia en el Markdown de `backlog/features/` (el Markdown es la fuente; Linear, el espejo).
- [ ] Gate 2 en verde con los guardianes que tocan según los paths del diff. Los Menores van en el cuerpo del PR.
- [ ] `openspec validate <change> --strict` y `/opsx:verify` en verde.
- [ ] `tasks.md` conciliado antes de pedir el merge: cada tarea cumplida en `[x]` con su evidencia (test o CI) y cada diferida con su **ID destino** escrito en la línea (lección del S1 y del S3). Nada `[x]` sin evidencia ejecutada.
- [ ] Ningún dato real, secreto ni identificador de paciente (RN-13, RN-14). Ejemplos y fixtures solo sintéticos (`SINT-`).
- [ ] Suite `evaluate` con su reporte adjunto si el PR toca modelo, prompt, umbral, catálogo o corpus (OL-06). Comando: `npm run evaluate -- --suite <familia> --report json` (sin `--config` usa la de la CI, adapters falsos).
- [ ] `visual-check` en PASS si el PR toca la UI de `apps/web`.
- [ ] Sin `.skip`, `.only`, `xit`, `xfail` ni tests borrados sin el *trailer* `Test-Removal:`.
- [ ] `ci-ok` en verde (build y tests, contratos, secretos, PII y clase de datos, smoke del stack): `docs/process/ci.md`.

## Historia de usuario (feature nueva)

- [ ] **Contract-first:** si toca una API, el `openapi.yaml` del proveedor cambia antes que el código (primer commit `contract(L1D-nn)`). Además `contracts:check` está en verde y lo generado (TS, Zod, Pydantic) está al día (`contracts:generate:check`).
- [ ] Endpoint o componente implementado con el patrón de su capa (`Controller → Service → Repository` y Zod en el borde; hexagonal y Pydantic en `rag-orchestrator`).
- [ ] Validación de entradas y salidas cubierta con tests unitarios (lógica pura) y de integración (Supertest/`TestClient` con BD real).
- [ ] Un test de aceptación por cada AC Given/When/Then, con el tag `[US-xxx AC-n]`, en rojo antes del `feat` según la matriz TDD de `CLAUDE.md`.
- [ ] Change de OpenSpec listo para archivarse en `/sprint-close` tras el merge (tareas `[x]`).

## Bug

- [ ] Test que reproduce el bug, **en rojo y en su propio commit** `test(L1D-nn)`, antes del fix.
- [ ] Fix implementado (`fix(L1D-nn)`).
- [ ] El mismo test pasa a verde, sin tocar sus aserciones.
- [ ] Análisis 5-whys en el issue: qué clase de bug es y por qué no lo detectó ningún gate (si falta una regla o un test de contrato, se propone).

## Refactor

- [ ] La **cobertura del módulo no baja** respecto de `main`. En un refactor bloquea; en el resto de tipos es solo una alerta (`CLAUDE.md`).
- [ ] Comportamiento observable inalterado: mismos contratos, `contracts:check` sin cambios y ningún test de aceptación modificado.
- [ ] El PR explica la mejora de diseño: qué principio (SOLID/CUPID) o hallazgo de `design-principles-reviewer` resuelve.

## ADR o DEC

- [ ] ADR en formato MADR (`docs/architecture/adr/_plantilla-madr.md`), con su fila en el índice. DEC con `docs/decisions/_plantilla-dec.md`.
- [ ] Decisión del humano registrada en la historia (`Decidido (usuario, fecha)`) y marcada en `backlog/02-adrs.md`.
- [ ] Opciones descartadas con su motivo. Si es una decisión cara de revertir, tres propuestas.
- [ ] Firma o validación externa que exija la historia (p. ej., la del oncólogo), con fecha. Sin ella, la historia no pasa a Done.

## Spike

- [ ] Informe con la pregunta, el método, el resultado y la recomendación, enlazado desde la historia.
- [ ] El código del *spike* **no se mergea**. Si sirve, se reescribe dentro de una historia con su DoD.

## Feature (épica)

- [ ] Todas sus historias mergeadas o movidas con motivo.
- [ ] Demo del recorrido con datos sintéticos en el cierre del sprint.
- [ ] Trazabilidad regenerada (`backlog/03-trazabilidad.md`) sin huecos Bloqueantes.
