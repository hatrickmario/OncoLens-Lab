---
name: seed-ampliado-trampas
description: Trampas al ampliar los pacientes semilla (L1D-310): letras ya tomadas, ordinales de 2 digitos, oraculos de ATC, E2E con solo mama
metadata:
  type: reference
---

Al ampliar `PACIENTES_SEMILLA` (L1D-310, pacientes (g)–(m), total 13):

- Los changes de openspec se escribieron suponiendo 5 pacientes; (f) = FX-T3-a (L1D-196) ya existia. Contar `ls prisma/seed/pacientes/` y leer `indice.ts` antes de fijar letras/ordinales.
- Ordinales >= 10: `identidades.test.ts` armaba `SINT-000000${n}` y leia `slice(-1)`; las iniciales del listado de web son «P. S. 1.» para «Prueba Sintética 10»…13 (distinguir por «•••• NN»). `PAGE_SIZE_DE_TEST` debe dar dos paginas (`ceil(N/2)`).
- `codigos-del-catalogo.test.ts` resuelve el ATC por nombre entero del regimen: los combinados («A + B») exigen resolver por farmaco (`TratamientoPreviaSemilla.farmacos`). `sin-codigos-escritos-a-mano.test.ts` rechaza cualquier codigo ATC/CIE/LOINC en comentarios del seed.
- `scripts/e2e/ejecutar.sh` fija `ENABLED_CANCER_TYPES=mama`: los pacientes de prostata no admiten analisis en el E2E (solo ficha con aviso); esta fuera de los paths de clinical-platform-dev.
- En este hook los heredocs con `python3 - <<EOF` funcionan si no hay `git`/`cd` computado en el mismo comando; `docker network inspect $(...)` y `sleep` encadenado se rechazan.

**Why:** perdi tiempo con cada una. **How to apply:** revisar estos puntos al tocar el seed o el numero de pacientes.
