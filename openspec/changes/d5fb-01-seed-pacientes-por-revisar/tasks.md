# Tasks — d5fb-01-seed-pacientes-por-revisar

> Sin cambios de API ni de contrato: no hay sección `## contratos`. Un solo bounded context: clinical-platform (seed) más
> documentación de la demo. Seed → **test después** (CLAUDE.md, Política TDD): el test va en el mismo PR. Mocks solo en los
> bordes; nunca `.skip`, `.only`, `xfail`. Origen: feedback de la Demo 5 (2026-11-05), sin L1D asignado.

## clinical-platform

### 1. Seed

- [ ] 1.1 En `apps/clinical-api/prisma/seed/pacientes/h.ts`, mover el Ki-67 `20 %` de `examen-ihq` a un examen propio
  `examen-ki67` (misma `diasAntes` o una cercana, ≤ 140) con `estadoDeRevision: 'requiere_revision'`; `RE`, `RP` y `HER2`
  quedan en `examen-ihq`. Si se usa el helper `ki67()`, ampliarlo con un parámetro opcional `resto` en `auxiliares.ts`
  sin cambiar la salida para los demás pacientes · test después (lo cubren 2.1 y 2.2)

### 2. Tests (en el mismo PR)

- [ ] 2.1 `apps/clinical-api/tests/integration/seed/contenido.test.ts`: la afirmación «todo biomarcador está verificado salvo
  los de (f)» excluye además el `Ki-67` de (h); añadir un caso «(h) tiene el Ki-67 en requiere_revision en un examen propio y
  RE, RP y HER2 verificados» · integración (PostgreSQL real, seed)
- [ ] 2.2 Test de integración del listado sobre el seed real: «`pendingReviewCount` es 2 para (f), 1 para (h) y 0 para el
  resto, con al menos dos pacientes con valor mayor que 0 [US-048 AC-1]» (ubicar junto a
  `tests/integration/pacientes/listado.test.ts`, usando el seed y el mismo arnés)
- [ ] 2.3 Confirmar que siguen en verde sin cambios: `tests/integration/case-view/pacientes-momentos.test.ts` (faltantes de
  (g), (k), (l); (h) conserva su checklist), `seed/momentos-enfermedad.test.ts`, `pacientes/pendientes-de-revision.test.ts`
  y `scripts/demo/__tests__`; el comando de verificación es `npm test` del workspace `clinical-api` filtrado por esos
  ficheros. Si alguno fija el estado del Ki-67 de (h), ajustar su aserción solo porque el AC cambió

### 3. Documentación de la demo

- [ ] 3.1 `docs/demo/guia-demo-S5.md`: fila de (h) con «Ki-67 20 % (por revisar)»; en la sección del listado indicar que
  «Por revisar» muestra a (f) con 2 y a (h) con 1. Sin tocar el «13» ni los conteos de `levantar.sh`
- [ ] 3.2 Verificación final: `openspec validate d5fb-01-seed-pacientes-por-revisar --strict` y, con el Compose de la demo
  arriba y el seed recién sembrado, `GET /platform/patients` muestra dos pacientes con `pendingReviewCount > 0`
