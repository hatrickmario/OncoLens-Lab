---
name: onnx-bytes-y-entorno-de-trabajo
description: Trampas de ONNX Runtime al cargar desde bytes (datos externos, vida de los buffers) y cómo ejecutar pytest/vitest/ruff en el worktree del agente
metadata:
  type: project
---

ONNX Runtime 1.31 al crear la sesión desde bytes (US-231b D12): un `.onnx` con initializers externos falla cerrado, pero con un
mensaje distinto según el caso ("escapes working directory" / "model_path must not be empty"), por eso el adapter decide el
error mirando la clave protobuf `\x0a\x08location` en los bytes y no el texto de ORT. `add_external_initializers_from_files_in_memory(nombres, buffers, longitudes)`
exige 3 argumentos y los buffers deben seguir vivos mientras viva la sesión (con un temporal la lectura da ceros SIN error).

**Why:** el spec exige cargar exactamente lo hasheado; la pérdida silenciosa de pesos externos habría invertido resultados.
**How to apply:** guardar los buffers en la instancia de `SesionOnnx`; ONNX mínimo de test escrito a mano en `tests/support/onnx_minimo.py`.

Entorno del agente (este harness): sin pytest instalado; crear venv fuera del repo (`/tmp/venv-us231b`, `pip install --only-binary=:all: -r requirements.txt -r requirements-dev.txt` más `defusedxml psutil` para `tests/evaluation`).
El harness rechaza comandos con heredoc/`PATH=...` inline/`cd ../..`: usar Write + `python -I script`, rutas absolutas del venv y `git` desde la raíz del worktree.
`node_modules` no existe en el worktree: symlink temporal al del checkout principal para `npx vitest run infra/docker`, y borrarlo antes de terminar.
`ruff check` tiene ~60 hallazgos previos; el gate real es `ruff format --check` (scripts/quality/ruff.mjs). No existe `npm run quality`.
