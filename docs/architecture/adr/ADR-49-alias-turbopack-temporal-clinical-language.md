# ADR-49 — Alias de Turbopack temporal para los imports NodeNext de packages/clinical-language en apps/web

> Linear: sin issue propio · Historia: US-246 [L1D-296](https://linear.app/l1der-lab-mjbc/issue/L1D-296) · Deuda: D4-22 en [`S4-deuda.md`](../../../backlog/sprints/S4-deuda.md) · Feature: FEAT-10a
> Plantilla: MADR 4 (variante mínima, en español).

- **Estado:** Propuesto — pendiente de firma del usuario
- **Fecha:** 2026-10-31
- **Decisores:** usuario (product owner); la firma está pendiente
- **Consultados / informados:** `frontend-dev`, `sprint-orchestrator`, sesión principal
- **Requisitos:** RN-23 (lenguaje no prescriptivo en el cliente); CLAUDE.md, «Build»: `web` usa Turbopack sin `webpack()` personalizado y «si hiciera falta, ADR»

> Nota de numeración: el ADR-48 está reservado en el backlog para US-248 (fusión híbrida, `si-hay-capacidad`), por lo que este ADR toma el siguiente número libre, el 49.

## Contexto y problema

El filtro RN-23 del cliente (L1D-296) importa `packages/clinical-language/src`, que está escrito para NodeNext con extensión `.js` en sus imports relativos. Turbopack no resuelve `./normalizar.js`, `./secuencias.js` ni `./tipos.js` (da `500` en `next dev`; `test:build` lo cubre). Para desbloquear el PR se añadió un `turbopack.resolveAlias` en `apps/web/next.config.ts`, lo que es una excepción al principio de no personalizar el bundler y por eso requiere ADR. Además, cualquier import de `apps/web` hacia `packages/*` exige el `COPY` correspondiente en el Dockerfile de `web` (la CI de #267 falló por eso).

## Factores de decisión

- No personalizar el bundler sin ADR (CLAUDE.md).
- Una sola fuente de la lista de términos prohibidos (RN-23), sin duplicarla en `web`.
- Que la excepción sea pequeña, temporal, con fecha de retirada y vigilada por tests.

## Opciones consideradas

1. **A · Alias temporal** (`turbopack.resolveAlias`) en `next.config.ts`, con guardia transitiva y `COPY` del Dockerfile, retirado en el S5.
2. **B · Subpath puro `./verificador`** en `packages/clinical-language`, sin `node:fs` ni extensiones `.js` (D4-22, S5).
3. **C · Imports sin extensión** en todo el paquete.
4. **D · Deep-import con `webpack()` personalizado.**
5. **E · Endpoint de filtro en el backend.**

## Decisión

Opción propuesta: **A, como puente hasta que B se entregue en el Sprint 5**, porque desbloquea L1D-296 sin tocar el paquete compartido en pleno sprint y B es la solución preferida pero no cabe en el S4 (D4-22 queda fuera del sprint).

- Alias temporal en `apps/web/next.config.ts` hacia el código del verificador.
- Guardia transitiva: `apps/web/tests/lib/alias-verificador-rn23.test.ts` falla si el alias deja de resolver la cadena de imports.
- Guardia de infraestructura: `infra/docker/__tests__/dockerfile-web-copias.test.mjs` comprueba el `COPY` de `packages/clinical-language` en el Dockerfile de `web`.
- **Plazo de retirada: Sprint 5.** Al retirarlo se borran el alias y sus guardias.

### Consecuencias

- **Positivas:** L1D-296 se entrega con la lista RN-23 única; la excepción está acotada y vigilada.
- **Negativas:** `next.config.ts` queda con una personalización del bundler hasta el S5; el paquete sigue acoplado a NodeNext; hay riesgo de que el alias se quede si D4-22 no se prioriza.
- **Configuración (RN-22):** ninguna.

### Confirmación

Los dos tests nombrados arriba, `test:build` de `web` y el Gate 2 (`design-principles-reviewer`). La retirada se confirma cuando `next.config.ts` ya no contiene `resolveAlias`.

## Pros y contras de las opciones

### A · Alias temporal
- A favor: inmediato, reversible, sin cambios en el paquete.
- En contra: excepción al principio de no personalizar el bundler; deuda con plazo.

### B · Subpath puro `./verificador` (preferida, D4-22, S5)
- A favor: sin alias ni `node:fs` en el cliente; Turbopack lo resuelve sin excepción.
- En contra: toca el paquete y sus consumidores; no cabe en el S4.

### C · Imports sin extensión
- A favor: simple.
- En contra: rompe la compilación NodeNext del backend que consume el paquete.

### D · Deep-import con `webpack()`
- A favor: resuelve el import.
- En contra: descartada por CLAUDE.md (sin `webpack()` personalizado; `web` usa Turbopack).

### E · Endpoint de filtro en el backend
- A favor: ninguna dependencia del cliente.
- En contra: un viaje de red por render y un cambio de contrato; el filtro del cliente es de nivel A por decisión del usuario.
