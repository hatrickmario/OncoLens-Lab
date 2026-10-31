#!/usr/bin/env python3
"""Compara los conteos del seed publicados por el propio seed con los obtenidos por `count(*)` (L1D-297, AC-6).

Entradas: solo JSON de conteos (nunca filas, identidad ni cadenas de conexión). Imprime una línea por conteo y, ante un
conteo incorrecto, `FALLA <nombre>: esperado N, obtenido M` y sale con código 1.

    verificar-conteos.py --seed seed-conteos.json --clinico '{"conteos": {...}}' --corpus '{"conteos": {...}}' \
        --documentos 10 --poblacion data/raw/seed/poblacion-verificada.json
"""

import argparse
import json
import sys

PACIENTES = "clinical.patient"
IDENTIDADES = "identity.patient_identity"
USUARIOS = 'auth."user"'
MINIMOS = {"corpus.con_poblacion_verificada"}


def comparaciones(
    seed: dict, clinico: dict, corpus: dict, documentos: int, con_poblacion: int
):
    """(nombre, esperado, obtenido): pacientes = identidades = pacientes del seed, usuarios y documentos del corpus."""
    pacientes_del_seed = seed[PACIENTES]
    return [
        (PACIENTES, pacientes_del_seed, clinico[PACIENTES]),
        (IDENTIDADES, pacientes_del_seed, clinico[IDENTIDADES]),
        # Una re-ejecución idempotente del seed no republica los usuarios que ya existen: sin conteo publicado basta con que haya.
        (USUARIOS, seed.get(USUARIOS, 1), clinico[USUARIOS]),
        ("corpus.documentos_vigentes", documentos, corpus["documentos_vigentes"]),
        (
            "corpus.con_poblacion_verificada",
            con_poblacion,
            corpus["con_poblacion_verificada"],
        ),
    ]


def main(argv=None) -> int:
    analizador = argparse.ArgumentParser()
    analizador.add_argument("--seed", required=True)
    analizador.add_argument("--clinico", required=True)
    analizador.add_argument("--corpus", required=True)
    analizador.add_argument("--documentos", type=int, required=True)
    analizador.add_argument("--poblacion", required=True)
    argumentos = analizador.parse_args(argv)
    try:
        seed = json.load(open(argumentos.seed, encoding="utf-8"))
        clinico = json.loads(argumentos.clinico)["conteos"]
        corpus = json.loads(argumentos.corpus)["conteos"]
        con_poblacion = len(
            json.load(open(argumentos.poblacion, encoding="utf-8"))["documentos"]
        )
        filas = comparaciones(
            seed, clinico, corpus, argumentos.documentos, con_poblacion
        )
    except (OSError, ValueError, KeyError, TypeError):
        print("FALLA entrada: los conteos no tienen la forma esperada", file=sys.stderr)
        return 1
    # Los documentos con población verificada son «al menos» los del archivo versionado: una ingesta completa (US-242) puede
    # dejar más (metadato verificado en documentos que no aportaron valores de población).
    minimos = MINIMOS | ({USUARIOS} if USUARIOS not in seed else set())
    fallos = [f for f in filas if (f[2] < f[1] if f[0] in minimos else f[1] != f[2])]
    for nombre, esperado, obtenido in filas:
        etiqueta = "minimo" if nombre in minimos else "esperado"
        print(f"  {nombre}: {etiqueta}={esperado} obtenido={obtenido}")
    for nombre, esperado, obtenido in fallos:
        previo = "al menos " if nombre in minimos else ""
        print(
            f"FALLA {nombre}: esperado {previo}{esperado}, obtenido {obtenido}",
            file=sys.stderr,
        )
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
