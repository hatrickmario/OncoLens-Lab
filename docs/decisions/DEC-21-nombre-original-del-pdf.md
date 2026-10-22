# DEC-21 — Nombre original del PDF (`original_filename`) en claro mientras todo sea sintético

> Linear: pendiente (límite de issues del workspace) · Historia: US-235 (FEAT-01a) · Origen: L1D-56 (US-076), Gate 2, `privacy-guardian` Mayor 2 · Decisión de producto y seguridad (S2, 2026-10-22)

- **Estado:** decidida (usuario, 2026-10-22, `[S2 resp. 19]`)
- **Decide:** usuario (responsable del producto) · **Valida / firma:** no requiere firma externa · **Fecha:** 2026-10-22
- **Requisitos:** RN-10, RN-13, FR-07; `docs/architecture/data-model.md` (`original_filename` "cifrado o enmascarado")

## Contexto

`docs/architecture/data-model.md` pide que `original_filename` se guarde cifrado o enmascarado, porque un nombre de archivo suele llevar identidad (RN-10). L1D-56 lo guarda en claro en `clinical.document`, normalizado en el borde (NFC, sin control ni formato, 255), y nunca en logs, `audit`, metadatos de MinIO ni Backend 2 (lo cubre el test de no-fuga). Con datos sintéticos (RN-13) el riesgo es nulo.

## Decisión

Opción A del Gate 2 de L1D-56: se acepta `original_filename` en claro en la fila `document` mientras todo dato sea sintético; `clinical-api` no lo registra ni lo envía a Backend 2. Se cifra (con la clave de identidad) o se enmascara **antes de G-Piloto**, y `preflight real-data` falla mientras queden filas con el nombre en claro. La historia dueña es **US-235** (S6). `[S2 resp. 19]`

## Alternativas descartadas

- Cifrar ahora con el AES-256-GCM de `identity`: abre el cifrador de identidad a un segundo módulo y amplía el alcance de L1D-56 sin reducir un riesgo que con datos sintéticos es nulo.

## Desbloquea

- US-235 (cifrado o enmascarado y bloqueo en `preflight`), US-143 (`preflight`, G-Piloto)

## Validación pendiente

Ninguna externa. La condición de G-Piloto la verifica el AC-3 de US-235.
