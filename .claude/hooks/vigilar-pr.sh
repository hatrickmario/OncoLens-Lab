#!/usr/bin/env bash
# Vigilante de CI de un PR (decisión del usuario, 2026-11-04). Se lanza en segundo plano tras un push o `gh pr create`
# (`Bash` con run_in_background) y termina con una sola línea final:
#   «#<n> listo para merge …»  (0 fallos, 0 pendientes, 0 alertas de code scanning, mergeStateStatus CLEAN)
#   «#<n> falla <checks>: <url>»  (algún check en fallo; incluye la URL del job para leer el log)
#   «#<n> sin resolver tras <espera>»  (agotó la espera)
# Una fila de statusCheckRollup con conclusion vacía es un check aún pendiente (ci-ok se queda así hasta el final).
# Uso: vigilar-pr.sh <n> [segundos_max=1500]
#      vigilar-pr.sh --main <AAAA-MM-DD>   (tras mergear: alertas de code scanning ABIERTAS EN main creadas desde esa fecha)
# Las alertas de CodeQL aparecen en `main` después del merge: el chequeo del ref del PR da 0 aunque la alerta nazca de él
# (S5: #14 y #15, de #315 y #318). «0 alertas» se confirma también sobre main tras cada merge (retro S5, mejora 1).
set -uo pipefail
if [ "${1:-}" = "--main" ]; then
  DESDE="${2:?uso: vigilar-pr.sh --main <AAAA-MM-DD>}"
  case "$DESDE" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) echo "fecha inválida: $DESDE (AAAA-MM-DD)"; exit 2;; esac
  REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" || { echo "main no se pudo resolver el repo (gh)"; exit 2; }
  NUEVAS="$(gh api "repos/$REPO/code-scanning/alerts?state=open&ref=refs/heads/main&per_page=100" \
    --jq "[.[] | select(.created_at >= \"${DESDE}\") | \"#\\(.number) \\(.rule.id) \\(.most_recent_instance.location.path):\\(.most_recent_instance.location.start_line)\"] | join(\"; \")" 2>/dev/null)" \
    || { echo "main no se pudieron leer las alertas (gh api)"; exit 2; }
  if [ -n "$NUEVAS" ]; then echo "main tiene alertas nuevas abiertas desde $DESDE: $NUEVAS"; exit 1; fi
  echo "main sin alertas nuevas abiertas desde $DESDE"; exit 0
fi
N="${1:?uso: vigilar-pr.sh <n> [segundos_max]}"
MAX="${2:-1500}"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)" || { echo "#$N no se pudo resolver el repo (gh)"; exit 2; }
INICIO=$SECONDS
sleep 20 # deja que GitHub registre los checks del push

while :; do
  RESUMEN="$(gh pr view "$N" --json statusCheckRollup,mergeStateStatus,headRefOid --jq '
    {sha: .headRefOid[0:8], estado: .mergeStateStatus,
     pend: [.statusCheckRollup[] | select((.conclusion // "") == "" ) | .name],
     fallos: [.statusCheckRollup[] | select(.conclusion == "FAILURE" or .conclusion == "CANCELLED" or .conclusion == "TIMED_OUT" or .conclusion == "ACTION_REQUIRED") | "\(.name) \(.detailsUrl // .targetUrl)"]}' 2>/dev/null)"
  if [ -n "$RESUMEN" ]; then
    FALLOS="$(printf '%s' "$RESUMEN" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print("; ".join(d["fallos"]))')"
    PEND="$(printf '%s' "$RESUMEN" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(len(d["pend"]))')"
    ESTADO="$(printf '%s' "$RESUMEN" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d["estado"], d["sha"])')"
    # Un fallo ya es definitivo aunque queden checks pendientes: se avisa sin esperar al resto.
    if [ -n "$FALLOS" ]; then echo "#$N falla $FALLOS ($ESTADO)"; exit 1; fi
    if [ "$PEND" = "0" ]; then
      ALERTAS="$(gh api "repos/$REPO/code-scanning/alerts?state=open&ref=refs/pull/$N/merge" --jq length 2>/dev/null || echo "?")"
      if [ "$ALERTAS" = "0" ] && [ "${ESTADO%% *}" = "CLEAN" ]; then echo "#$N listo para merge (0 fallos, 0 pendientes, 0 alertas, $ESTADO)"; exit 0; fi
      echo "#$N sin fallos ni pendientes, pero no está listo: alertas=$ALERTAS estado=$ESTADO"; exit 1
    fi
  fi
  [ $((SECONDS - INICIO)) -ge "$MAX" ] && { echo "#$N sin resolver tras ${MAX}s (pendientes=${PEND:-?})"; exit 3; }
  sleep 15
done
