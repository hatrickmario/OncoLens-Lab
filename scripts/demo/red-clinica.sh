#!/usr/bin/env bash
# Red `clinical-net` del proyecto Compose actual. Se carga con `source` desde levantar.sh (y desde su prueba).
# Filtra por la etiqueta del proyecto además del nombre: otro proyecto en la misma máquina (p. ej. `ol310_clinical-net`)
# nunca se toma por error (D5-56, Prisma fallaba con credenciales de otro stack).

red_clinica_del_proyecto() {
  local proyecto="${COMPOSE_PROJECT_NAME:-oncolens}"
  docker network ls \
    --filter "label=com.docker.compose.project=${proyecto}" \
    --filter "name=clinical-net" --format '{{.Name}}' | head -1
}
