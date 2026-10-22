# Tasks — l1d-267-auditoria-dependencias

## 1. clinical-platform

- [x] 1.0 (adelantada a O1, dentro de `l1d-277`) Subir `certifi` a `==2026.10.19` en `apps/rag-orchestrator/requirements.txt` por el aviso crítico de Dependabot (#2); `pip-audit` sin hallazgos críticos · test después
- [x] 1.1 [Test después · CI] Tests de `hallazgosBloqueantes()` en `scripts/ci/__tests__/auditarDependencias.test.mjs` con salidas JSON fijas de `npm audit` y `pip-audit` (sin red) y fecha inyectada: limpio, aviso alto de npm, aviso de pip, excepción vigente, vencida y sin `mitigacion` [US-217 AC-1, AC-2, AC-3]
- [x] 1.2 `scripts/ci/auditar-dependencias.mjs` (función pura + CLI) y schema de `security/audit-exceptions.json`; extraer `excepcionVencida()` [US-217 AC-2, AC-3]
- [x] 1.3 `pip-audit` fijado en `scripts/ci/requirements-audit.txt` (se instala con pip); job `dependencies` en `ci.yml` (`permissions: contents: read`, acciones por SHA, `timeout-minutes`) y en `needs` de `ci-ok` [US-217 AC-1]
- [x] 1.4 Resolver o registrar como excepción los 4 avisos `high` actuales de `main` (design.md, Open Questions) para que el job entre en verde [US-217 AC-1]
- [x] 1.5 [Test después] `.github/dependabot.yml` (design.md D3) y test que lo inspecciona [US-217 AC-4]
- [x] 1.6 Refactor: Extract Method / Inline Method en los archivos tocados, sin cambio de comportamiento, tests en verde antes y después, commit `refactor(L1D-267)` (sin refactor necesario)

## 2. ai-services

- [x] 2.1 Comprobar en local que `pip-audit -r` sobre `requirements.txt`, `requirements-dev.txt` y `requirements-eval.txt` resuelve sin instalar el entorno completo; si algún aviso aparece, se resuelve o se registra (1.4)

## 3. Cierre

- [x] 3.1 `openspec validate l1d-267-auditoria-dependencias --strict`
- [x] 3.2 `npx vitest run scripts/ci` en verde y el job `dependencies` verde en el PR _(verificado 2026-10-22: CI de main verde en 11dc5cc8 y openspec validate --strict ok)_
