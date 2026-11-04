#!/usr/bin/env bash
# Red `clinical-net` del proyecto Compose actual. Se carga con `source` desde levantar.sh (y desde su prueba).

red_clinica_del_proyecto() {
  docker network ls --filter "name=clinical-net" --format '{{.Name}}' | head -1
}
