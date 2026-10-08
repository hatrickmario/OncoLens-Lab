---
name: gate-review
description: Ejecuta un gate de calidad de OncoLens con los guardianes en paralelo y consolida un veredicto. gate1 revisa los artefactos (proposal, design, deltas) de uno o varios changes antes de escribir código; gate2 revisa el diff de una rama antes del PR, eligiendo guardianes según los paths tocados. La usan /sprint-start (gate1), implement-story y sprint-orchestrator (gate2).
argument-hint: "gate1 <change...> | gate2 <rama>"
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

   `privacy-guardian` corre **siempre** que el diff toque algo fuera de `docs/` u `openspec/`.
3. Lánzalos en paralelo (modo Gate 2, rama `$target`, change asociado).
4. Comprueba además que el implementador dejó en verde `openspec validate <change> --strict` y
   `/opsx:verify` (si no hay evidencia en su reporte, ejecútalos tú en un worktree temporal).

## Consolidación (ambos modos)

```
## Gate <1|2> · <target> · <fecha>
Veredicto global: PASS | FAIL
| Guardián | Veredicto | Bloqueantes | Mayores | Menores | Preguntas |
### Hallazgos que bloquean (ordenados por severidad)
### Preguntas para el humano
```

FAIL global si cualquier guardián da FAIL. Las **Preguntas** no bloquean el gate por sí solas,
pero se escalan. No reescribas ni suavices hallazgos: cópialos con su ubicación.
