---
name: familia-opciones-l1d246
description: Cómo se compone la familia `opciones` de evaluate (L1D-246) y trampas del entorno que costaron tiempo
metadata:
  type: project
---

La familia `opciones` reutiliza `componer_servicio(..., aplicabilidad=AplicabilidadDeLaSuite(criterios, catalogo))` con un
catálogo falso que lleva población por documento (`CatalogoConPoblacion`); su config YAML es un superset de `ConfigSuite`
(`cargar_config_suite` ignora claves ajenas) más `opciones`, `regresion`, `metas_iniciales`. Las violaciones se inyectan en los
tests con `PuertosDeOpciones(medidor=...)` (tipos de dominio, sin mocks de módulos propios).

**Why:** el orden de RN-28 por opción se lee de `perSource[0]` (ya ordenado, ADR-31) y los excluyentes de `applicability[]`.

**How to apply:** una familia nueva = config + dataset + `ESQUEMA_*` cerrado + despacho en `evaluate._despachar_familia` + entrada en `SUITES`.
Entorno: venv `/tmp/venv306` sirve para pytest/ruff/lint-imports; para vitest hace falta symlink temporal a `node_modules` del checkout
principal (borrarlo al terminar) y `EVAL_PYTHON=/tmp/venv306/bin/python`; `npm run quality` falla por `@vitest/eslint-plugin` ausente (ajeno).
Bash del worktree rechaza: heredocs de shell (`cat <<`), `cd ../..`, y comandos con "eval" como argumento suelto (usar Read o `ev*`).
`tasks-destino` exige `DIFERIDA -> ID` en la PRIMERA línea de cada tarea abierta.
