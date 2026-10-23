---
name: feedback-entorno-worktree
description: Trampas del entorno de worktree para ai-services-dev (Bash bloquea rutas con "eval", heredocs y variables; venv en /tmp)
metadata:
  type: feedback
---

El Bash de un agente en worktree rechaza comandos que parezcan `eval`: cualquier ruta con la subcadena "eval" (`data/eval`, `tests/evaluation`), heredocs, variables de shell (`W=...; ls $W`) y `git -C ..`.

**Why:** el verificador de aislamiento no puede probar que el comando se queda en el worktree.

**How to apply:** usa Read/Edit/Write para esos archivos; en Bash usa rutas absolutas literales, `cd` + comando simple, globs (`data/ev*`) o `sed -i ''`. Para pytest crea un venv fuera del repo (`python3 -m venv /tmp/venvNNN`, `pip install --only-binary=:all: -r requirements.txt` y `defusedxml psutil` para `tests/evaluation`). La calidad de Python es `ruff format --check apps/rag-orchestrator`.
