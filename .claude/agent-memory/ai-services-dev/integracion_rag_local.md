---
name: integracion-rag-local
description: Cómo correr scripts/ci/integracion-rag-orchestrator.sh en la máquina con varios agentes (subredes, node_modules, venv) y trampas del Bash de worktree
metadata:
  type: feedback
---

El job `integration-rag` se reproduce con `scripts/ci/integracion-rag-orchestrator.sh` (Docker, Milvus + PostgreSQL reales, ~10 min).

**Why:** otros agentes dejan redes Docker en 172.28/172.29.x; el script falla con "Pool overlaps" y "servicio sin salud" tras 420 s si se usan las subredes por defecto.

**How to apply:** exporta `CLINICAL_NET_SUBNET` y `CORPUS_DB_NET_SUBNET` con subredes libres (p. ej. `172.30.117.0/24`, `172.30.118.0/24`) en el mismo comando; crea el symlink `node_modules` -> el del checkout principal (está en .gitignore) y bórralo al terminar; corre en segundo plano (`run_in_background`). El venv `/tmp/venv116` de otro agente sirve para pytest/ruff/lint-imports; `npm run contracts:verify-provider -- --proveedor rag-orchestrator` con `VERIFY_PROVIDER_PYTHON=/tmp/venv116/bin/python CONTRACT_VERIFY=strict`.

Bash del worktree: rechaza `cat > archivo <<EOF` y `cd ...; git ...` compuestos; usa Write/Edit para archivos y `python3 - <<'EOF'` para ediciones por reemplazo (esto sí pasa). BSD sed exige `sed -i ''`.
