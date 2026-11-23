# S7 · Deuda

> Origen: planificación del S7 (`/sprint-start S7`, 2026-11-22). Plan: [`S7-plan.md`](S7-plan.md).

| ID | Change | Tarea | Resumen | Destino |
|---|---|---|---|---|
| D7-01 | `l1d-113-faltantes-desconocido-prompt` | S7.2b | `/case/summary` rechaza con `422 faltante_no_catalogado` un faltante que no está en el catálogo. Sale del S7 por decisión del usuario `[S7 resp. 12]`: no es calidad del RAG y cambia el contrato, que hoy dice que esa ruta no aplica esa validación. Si se retoma, va contract-first (descripción, `422` y ejemplo en `openapi.yaml` antes del código). | Post-MVP |
