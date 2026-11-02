# S5 · Deuda de proceso heredada del S4

> Origen: retrospectiva del cierre del S4 ([`S4-cierre.md`](S4-cierre.md) §7), mejoras aprobadas por el usuario el 2026-11-02. Las reglas, el job `higiene-proceso` y los scripts se aplicaron en el PR `chore/s4-retro-mejoras`; lo de esta tabla es lo que **no** se construyó entonces.

| ID | Deuda | Origen | Dueño propuesto | Estado |
|---|---|---|---|---|
| D5-01 | `contracts/examples/index.json` se genera desde un fichero por ejemplo (hoy es un solo fichero que chocó en #243, #279 y #276); partir también `S<n>-deuda.md` por sección con propietario para que dos historias no editen el mismo fichero. | Retro S4, M3 (propuesta 4) | `clinical-platform-dev` + `ai-services-dev`, con ADR corto si cambia el contrato de los ejemplos | Aprobado (usuario, 2026-11-02); pendiente de historia en el S5 |
| D5-02 | Job de CI que ejecute `contracts:check` contra `main` fusionado en cada PR que toque `contracts/examples/**` (los ejemplos de #276 quedaron fuera de contrato por `optionsNotShown` y `queryRewrite`, requeridos desde #271 y #274). Absorbe la propuesta 6 del status. | Retro S4, M3 (propuestas 5 y 6) | `clinical-platform-dev` | Aprobado (usuario, 2026-11-02); pendiente de historia en el S5 |
| D5-03 | Permiso `Write(./reports/eval/**)` para el evaluador en `.claude/settings.json`: el clasificador lo bloqueó como automodificación de permisos. **Tarea humana**: añadirlo a mano en `permissions.allow`. | Retro S4, M1 | Humano | Pendiente |
| D5-04 | Desactivar en los ajustes de la integración GitHub–Linear el cierre automático al mergear un PR (causa raíz de los `Done` prematuros, ≥ 7 en el S4). **Tarea humana**; las reglas del orquestador (`Refs L1D-nn`) solo cubren el cuerpo del PR, no el nombre de la rama ni el título. | Retro S4, M4a | Humano | Pendiente |
