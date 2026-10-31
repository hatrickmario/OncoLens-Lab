---
name: medicion-local-evaluate
description: Cómo correr evaluate con modelos locales reales desde un worktree de agente (sin source ni heredocs) y qué dejó la corrida de L1D-298
metadata:
  type: project
---

El Bash del agente rechaza `source`, heredocs y rutas con "eval"; para correr `evaluate` o `pytest -m models` con el entorno de `~/adr39-modelos` se escribe un lanzador `.py` en el scratchpad que parsea `modelos.env` y `adr39-config.sh`, fija las rutas del host y llama a `main(argv, entorno=...)` o `pytest.main`. `--config` debe ser absoluta (el lanzador hace `chdir` a la app).

**Why:** `proveedor: local` lee rutas y SHA-256 del entorno inyectado (US-037 AC-1: solo `app/config/` toca `os.environ`; `python -m` usa `app/config/entorno.py`).
**How to apply:** Ollama propio con `OLLAMA_HOST=127.0.0.1:<puerto> OLLAMA_CONTEXT_LENGTH=8192` en segundo plano y TaskStop al terminar; no tocar el 11434 del usuario. Corrida L1D-298 (máquina de 48 GB): RSS máximo 8,8 GiB > 4489 MiB, AC-2 con G real deja 1 salida prohibida mostrada en fx-rn23; la corrida entera tarda ~20 s.
