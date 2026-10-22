# Tasks — l1d-263-calidad-capas-umbrales

> Configuración y CI: **test después** (fixtures de PR en el mismo PR). Sin cambios de API.

## 1. clinical-platform

- [x] 1.1 `quality-thresholds.json` con los valores de D1 y validación (clave ausente o no numérica → falla nombrando la clave); `eslint.config.js` lo lee · test después [US-213 AC-6]
- [x] 1.2 `dependency-cruiser` (versión exacta, dev) y `.dependency-cruiser.cjs` con las cinco reglas · fixtures [US-213 AC-2]
- [x] 1.3 ESLint `max-lines-per-function` y `complexity` en `clinical-api` (tests excluidos) · fixture [US-213 AC-4]
- [x] 1.4 Tamaño de componentes `.tsx` de `web` (100 alerta, 150 error; excluye `components/ui/**`, tests, stories y generados) · fixtures [US-213 AC-7]
- [x] 1.5 `npm run quality` y `npm run quality:report` → `reports/quality/latest.json`; `reports/` en `.gitignore` [US-213 AC-1]
- [x] 1.6 Job `quality` de `ci.yml` ejecuta `npm run quality` y los tests de fixtures [US-213 AC-1]
- [x] 1.7 Correr sobre `main` y aplicar D5 (refactor o excepción con caducidad) antes de activar el job — 16 excepciones por archivo (14 de `max-lines-per-function` y 2 de `complexity`; 21 hallazgos en `clinical-api`, >2 operaciones por archivo) en `quality-thresholds.json`, caducan 2026-11-30; deuda a registrar en el backlog (fuera de los paths de este agente)

## 2. ai-services

- [ ] 2.1 `import-linter` (versión exacta en `requirements-dev.txt`) y `.importlinter` con `dominio-independiente` y `capas-hexagonales` · fixture [US-213 AC-3]
- [ ] 2.2 `scripts/quality/sync-ruff-thresholds` genera `[tool.ruff.lint.mccabe]` y `[tool.ruff.lint.pylint]` desde `quality-thresholds.json`; la CI comprueba la sincronía · fixture [US-213 AC-5, AC-6]

## 3. Cierre

- [x] 3.1 `openspec validate l1d-263-calidad-capas-umbrales --strict`
- [x] 3.2 `npm run quality` y `npm run test:quality` en verde (Pytest de `rag-orchestrator` queda para el cierre de `## ai-services`, 2.1–2.2: ese change no toca Python en esta sección)
