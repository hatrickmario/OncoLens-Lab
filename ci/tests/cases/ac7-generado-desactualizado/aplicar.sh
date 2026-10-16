#!/usr/bin/env bash
set -euo pipefail
printf '\nexport type EdicionAMano = string;\n' >> packages/api-contracts/src/types/rag-orchestrator/types.gen.ts
