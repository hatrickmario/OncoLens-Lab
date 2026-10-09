---
name: preflight-real-data
description: Checklist de solo lectura del gate G-Piloto de OncoLens (S6) antes de cargar cualquier dato real — preflight técnico, opt-out con 403, auditoría completa, proveedores solo locales, VPN/HTTPS, backups con prueba de restauración, catálogos validados por feedback y decisiones legales. Se invoca solo a mano con /preflight-real-data.
disable-model-invocation: true
---

# Preflight de datos reales (G-Piloto, PRD §14 y RN-13)

Solo lees y ejecutas comprobaciones: **no** activas `REAL_*_ENABLED`, no cargas datos y no
cambias configuración. El resultado es un informe para que el humano decida.

## Comprobaciones

| # | Comprobación | Cómo | Fuente |
|---|---|---|---|
| 1 | `preflight real-data` en verde | `npm run preflight:real-data` (o `scripts/preflight-real-data.sh`) | RN-13, CLAUDE.md |
| 2 | G-Demo en verde (cierre del S5) | `backlog/sprints/S5-cierre.md` | PRD §14, B-02 |
| 3 | AC-T1.5 auditoría completa (FR-18) | tests con tag `AC-T1.5` en verde | PRD §14 |
| 4 | AC-T3.3 `403` por opt-out en **toda** generación con IA (análisis, resumen, re-ejecución) | tests con tag `AC-T3.3`; marca de prueba vía CLI | RN-15, B-05 |
| 5 | Solo proveedores locales con datos reales | config de `LLMAdapter`; test de la regla de proveedores | RN-12 |
| 6 | Solo `web` publica puerto; VPN/HTTPS con CA interna | `docker compose config`; certificados presentes fuera del repo | PRD §8, §11 |
| 7 | Backups cifrados fuera del equipo y **prueba de restauración** del sprint | registro de la prueba | PRD §14 |
| 8 | FileVault activo | `fdesetup status` | readme §2.4 |
| 9 | Catálogos de datos críticos y de aplicabilidad validados por feedback (VM-5 ≥ 80 %, VM-4 ≥ 70 %) | reporte de FEAT-T5c | B-04 |
| 10 | Mapeos terminológicos firmados (DEC-17), matriz ítem → campo, tipos de cáncer "listos" (DEC-19) | registros de decisión en `backlog/` | PRD §14 |
| 11 | Criterio de inclusión "solo adultos" (DEC-18) configurado | configuración | B-14 |
| 12 | Repo sin datos reales ni secretos | escaneo de secretos/PII del CI en verde en `main` | RN-14 |

## Salida

Tabla `# · comprobación · estado (OK | FALLA | SIN EVIDENCIA) · evidencia`. G-Piloto solo está en
verde si **todas** son OK. Cualquier FALLA o SIN EVIDENCIA bloquea la carga de datos reales;
nómbrala con su dueño. Guarda el informe en `backlog/sprints/S6-preflight.md`.
