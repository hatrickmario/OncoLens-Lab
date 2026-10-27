# Tasks — l1d-95a-seed-codigos-catalogo

> Parte del seed de L1D-95 (US-003) adelantada al S3 (decisión del usuario, 2026-10-27). Va **antes** de L1D-98 y L1D-181.
> Matriz TDD (CLAUDE.md): seed y fixtures = **test después** (en el mismo PR); el test del checklist con el catálogo real
> es el control. Sin `.skip`/`.only`/`it.todo`. Sin cambio de API: no hay commit `contract(L1D-95a)`.

## 1. contratos

- [ ] 1.1 (exento: sin cambio de spec) Confirmar que no hay cambio en `apps/clinical-api/openapi.yaml` ni en `contracts/examples/`; reportar a `ai-services-dev` los `biomarkerName: "Receptor de estrógeno"` de los ejemplos.

## 2. clinical-platform

- [ ] 2.1 (test después: seed) Renombrar `nombre` a `RE` / `RP` en `prisma/seed/pacientes/{a,c,e}.ts` (las `clave:` no cambian) y actualizar el comentario de (c). Verificación: `contenido.test.ts`, `codigos-del-catalogo.test.ts` y `ficha.test.ts` en verde con las aserciones al nombre nuevo. Commit `feat(L1D-95a)`.
- [ ] 2.2 (test después: fixtures) Alinear `tests/support/filas-sinteticas.ts` (`insertarFxT1aA`) y los tests que lo consumen (`fixture-fx-t1a-a.test.ts`, `base-analisis-datos-por-revisar.test.ts`, `base-del-analisis`) a `RE`/`RP`; ajustar solo cadenas derivadas del nombre, sin debilitar aserciones. Verificación: suite del contexto en verde.
- [ ] 2.2b PENDIENTE de decisión del usuario: alinear `exam_type` del seed (`inmunohistoquimica` → `IHQ`) para `her2_ihq` (design D3b); no aplicar hasta que se decida.
- [ ] 2.3 (test después) Test de integración `tests/integration/completeness/seed-catalogo-real.test.ts` `[US-003 AC-1]`: con el catálogo real 1.1.0, `re` presente en la semilla (a), `rp` en la (c), y `re`/`rp`/`brca_germinal` en un paciente de test con nombres leídos del catálogo; más el escenario del nombre antiguo → `re` faltante. Verificación: en verde; la salida se guarda. Commit `test(L1D-95a)`.
- [ ] 2.4 Refactor: Extract/Inline Method en los archivos tocados si procede (p. ej. nombres de biomarcador del catálogo en `tests/support`), tests en verde antes y después; commit `refactor(L1D-95a)` o «refactor: sin cambios».
- [ ] 2.5 Verificación final: tests del contexto, `tsc --noEmit`, `npm run quality`, `openspec validate l1d-95a-seed-codigos-catalogo --strict`; L1D-98/L1D-181 solo rebasan.
