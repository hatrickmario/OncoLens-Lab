# DEC-03 — Estimación de capacidad de los Sprints 1–6

> Linear: [L1D-52](https://linear.app/l1der-lab-mjbc/issue/L1D-52) · Historia: US-009 · DEC-03 (FEAT-00, Pre-S1) · TBD-19 · SUP-1 · R-25

- **Estado:** Decidida (usuario, 2026-10-09; ajustada el 2026-10-11) `[Pre-S1 resp. 5, 9, 14–17, 20]`.
- **Dueño:** Ingeniería; aprueba el usuario (PO). **Fecha:** 2026-10-09.
- **Insumo:** el backlog de `backlog/features/` (tabla de puntos en `backlog/features/README.md`).

## Capacidad supuesta

**80–90 puntos por sprint.** La velocidad real se mide al cerrar el S1 (`/sprint-close S1`) y esta DEC se revisa con ese dato.

## Veredicto

**No cabe en el reparto original.** El MVP total sí cabe en seis sprints (499 puntos frente a 480–540 de capacidad), pero el S1 sumaba **124**. Se aplicó un **repliegue** aprobado por el usuario y no se recortó alcance.

## Repliegue aplicado (resp. 9)

| Historia | De | A | Puntos |
|---|---|---|---|
| US-213 (umbrales de calidad en la CI) | S1 | S2 | 5 |
| US-214 (verificación del proveedor) | S1 | S2 | 3 |
| US-217 (Dependabot y auditoría de dependencias) | S1 | S2 | 2 |
| US-016 · DEC-06 | S1 | S2 | 1 |
| US-014 · ADR-41 | S1 | S2 | 3 |
| US-072 (suite `evaluate`) | S1 | S2 | 8 |
| US-074 (suite en cada PR de IA) | S1 | S2 | 3 |
| US-216 (cabeceras de seguridad de `web`) | S1 | S6, antes de G-Piloto | 3 |

## Alcance añadido después del repliegue (2026-10-11)

| Historia | Sprint | Puntos | Origen |
|---|---|---|---|
| US-218 y US-219 (preguntas de seguimiento) | S5 | 8 | Diseño E2E aprobado `[resp. 14]` |
| US-220 (filtro de antigüedad) | S5 | 3 | `[resp. 15]` |
| US-221 y US-222 (registro y consola del administrador) | S6 (baja prioridad) | 8 | `[resp. 16]` |
| US-033 (re-estimada 5 → 8 → 10) | Pre-S1 | +5 | AC-11…AC-18 y generador mínimo `[resp. 20]` |

## Puntos por sprint (vigentes)

| Sprint | Puntos | Frente a 80–90 |
|---|---|---|
| Pre-S1 | 17 | Sprint de decisiones |
| S1 | 96 | +6 sobre el máximo; aceptado |
| S2 | 96 + `?` (US-073, rango 3–5) | +6 a +11; aceptado |
| S3 | 85 | Dentro |
| S4 | 79 | Dentro |
| S5 | 89 | Dentro |
| S6 | 76 | Dentro; es el camino crítico de G-Piloto |
| **MVP** | **518 + `?`** (523 con US-073 = 5) | — |

**Estimaciones en rango (AC-3):** US-073 está en `?`, con rango 3–5, y se re-estima al cerrar DEC-07 (S2). US-032 · ADR-7 es Futuro y no suma.

## Contingencia preaprobada (AC-2)

Si la velocidad real es de ~65 puntos, se aplican estos recortes **en este orden** y antes de tocar el S6:

1. US-123: población solo en texto (5).
2. US-101: aviso de dato sin verificar en la tarjeta (5).
3. US-062: estados de espera y error del panel (3).
4. Opciones de 3 a 1 en US-134 y US-135.
5. US-047: alta manual de pacientes; el seed o la CLI hacen de *workaround* (5).

## Lo que nunca se mueve (AC-4)

Ninguna historia dueña de RN-01, RN-06, RN-10…RN-14 o RN-23 sale del S1 por capacidad. El S6 no absorbe nada nuevo que retrase G-Piloto.
