---
name: gate-review
description: Ejecuta un gate de calidad de OncoLens con los guardianes en paralelo y consolida un veredicto. gate1 revisa los artefactos (proposal, design, deltas) de uno o varios changes antes de escribir código; gate2 revisa el diff de una rama antes del PR, eligiendo guardianes según los paths tocados; lote revisa SOLID y CUPID sobre el diff combinado de 2–3 changes relacionados. La usan /sprint-start (gate1), implement-story y sprint-orchestrator (gate2).
argument-hint: "gate1 <change...> | gate2 <rama> | lote <rama...>"
arguments: [mode, target]
---

# Gate de calidad: $mode

## Gate 1: artefactos (antes del código)

Guardianes, **siempre los tres**, en paralelo y cada uno con **todo el lote** de changes:
`privacy-guardian`, `contract-keeper`, `clinical-language-auditor`.
Prompt: modo Gate 1, lista de changes con sus rutas en `openspec/changes/`, y la petición
explícita de señalar contradicciones **entre** changes del lote.

## Gate 2: código (antes del PR)

1. Paths tocados: `git fetch origin && git diff --name-only origin/main...origin/$target`.
2. Selección de guardianes:

| Si el diff toca… | Guardián |
|---|---|
| `apps/clinical-api/**`, `apps/rag-orchestrator/**`, `apps/web/app/api/**`, `infra/**`, `scripts/**`, `prisma/**`, `data/**`, logging | `privacy-guardian` |
| `*.schema.ts`, `app/schemas/**`, OpenAPI, `packages/api-contracts/**`, routers o controllers | `contract-keeper` |
| prompts, plantillas de salida, `apps/web/**` (texto visible), mensajes de error visibles | `clinical-language-auditor` |
| modelo, prompts, umbral, `packages/clinical-catalogs/**`, corpus/ingesta, reranker, NLI, OCR, PII | `ai-eval-runner` |
| código en `apps/**` o `packages/**` (no solo datos, docs o configuración) | `design-principles-reviewer` (modo change) |

   `privacy-guardian` corre **siempre** que el diff toque algo fuera de `docs/` u `openspec/`.
3. Lánzalos en paralelo (modo Gate 2, rama `$target`, change asociado).
4. Comprueba además que el implementador dejó en verde `openspec validate <change> --strict` y
   `/opsx:verify` (si no hay evidencia en su reporte, ejecútalos tú en un worktree temporal).
5. **Evidencia de TDD:** `git log --oneline origin/main..origin/$target` muestra, para cada AC, un
   commit `test(L1D-<nn>)` antes de su `feat(L1D-<nn>)`, y el reporte del implementador incluye la
   salida en rojo y en verde. Si falta → FAIL (Mayor), salvo historias sin código (`DEC`, `ADR`).
6. **Contract-first:** si el diff toca una API, `contract-keeper` corre siempre y verifica que el
   commit `contract(L1D-<nn>)` precede a los de test e implementación.
7. **Loop visual:** si el diff toca la UI de `apps/web` (fuera de `app/api/`), el reporte del
   implementador incluye el bloque `## visual-check` con PASS, o PENDIENTE con motivo válido (sin
   stack todavía). Falta el bloque o es FAIL → **Mayor**. Pasa la sección **Red** del reporte a
   `privacy-guardian` y la de **Estados** a `clinical-language-auditor` como evidencia; ellos
   siguen revisando el código. El loop visual es evidencia, no sustituye a los tests E2E.

## Lote: SOLID y CUPID sobre 2–3 changes relacionados

El plan del sprint (`/sprint-start`, paso 5) agrupa en un **lote de revisión** los changes que
tocan el mismo módulo o dependen entre sí. Cuando el **último** change del lote llega al Gate 2:

1. Lanza `design-principles-reviewer` en **modo lote** con las ramas (o PRs mergeados) del lote,
   además del Gate 2 normal de ese change.
2. Los hallazgos del lote se resuelven **en la rama del último change**, con su commit
   `refactor(L1D-<nn>)`, aunque el código pertenezca a historias ya mergeadas; si el refactor
   excede el alcance (más de dos operaciones), se propone como historia de deuda técnica.
3. Así ningún PR anterior del lote espera: la revisión cruzada se paga una sola vez, al final.

## Tratamiento de los hallazgos de design-principles-reviewer

| Severidad | Efecto |
|---|---|
| Bloqueante (P1 sobre una invariante RN) | FAIL del Gate 2: vuelta al implementador |
| Mayor (P1 restante o P2) | El implementador aplica el refactor mínimo en su commit `refactor(L1D-<nn>)` **antes del PR**, y se re-ejecuta solo este revisor |
| Menor (P3) | No bloquea; se copia en el cuerpo del PR |

## Consolidación (todos los modos)

```
## Gate <1|2> · <target> · <fecha>
Veredicto global: PASS | FAIL
| Guardián | Veredicto | Bloqueantes | Mayores | Menores | Preguntas |
### Hallazgos que bloquean (ordenados por severidad)
### Preguntas para el humano
```

FAIL global si cualquier guardián da FAIL. Las **Preguntas** no bloquean el gate por sí solas,
pero se escalan. No reescribas ni suavices hallazgos: cópialos con su ubicación.
