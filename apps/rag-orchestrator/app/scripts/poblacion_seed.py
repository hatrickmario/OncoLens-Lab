"""Metadatos de población versionados de la demo (L1D-297, US-247 AC-1 y AC-5, D1).

    python -m app.scripts.poblacion_seed cargar   --archivo data/raw/seed/poblacion-verificada.json
    python -m app.scripts.poblacion_seed exportar --archivo <salida.json>
    python -m app.scripts.poblacion_seed contar

``exportar`` vuelca la población ``extraido_verificado`` que dejó la extracción de US-242 (LLM local + NLI) sobre el corpus de
la demo; el archivo se revisa con la muestra humana de US-118 y se versiona en ``data/raw/seed/``. ``cargar`` lo escribe en
``corpus.corpus_document`` (rol ``rag_corpus``) de una instalación nueva, sin LLM: rechaza todo valor sin ``chunkId`` o sin
``nliResult = entailment`` (RN-25) y todo documento que no esté registrado. ``contar`` imprime solo ``count(*)`` (verificación
del seed, privacy P2). La salida lleva identificadores de documento y conteos; nunca el valor, la URL ni credenciales.

Código de salida: 0 si todo quedó cargado/exportado/contado; 1 si la configuración es inválida o algún documento falla.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.seed_corpus.ports import VersionInexistente
from app.config.settings import CorpusDatabaseSettings
from app.domain.corpus_metadata.poblacion_verificada import (
    METADATA_SOURCE_VERIFICADO,
    criterios_sin_respaldo,
    tiene_valores,
)
from app.infrastructure.catalog.conexion import componer_url, crear_motor
from app.infrastructure.catalog.corpus_document_repository import CorpusDocumentRepository

NOMBRE = "poblacion_seed"
VERSION_DEL_ARCHIVO = 1


class ArchivoDePoblacionInvalido(ValueError):
    """El archivo versionado no cumple su forma. El mensaje nombra documentos/criterios, nunca valores."""


def validar_archivo(contenido: Any) -> dict[str, dict[str, Any]]:
    """Documentos del archivo ya validados: forma, respaldo de cada valor (RN-25) y ``extraido_verificado``."""
    if not isinstance(contenido, dict) or contenido.get("version") != VERSION_DEL_ARCHIVO:
        raise ArchivoDePoblacionInvalido("version no soportada")
    documentos = contenido.get("documentos")
    if not isinstance(documentos, dict) or not documentos:
        raise ArchivoDePoblacionInvalido("sin documentos")
    for document_id, entrada in documentos.items():
        criterios = entrada.get("population_criteria") if isinstance(entrada, dict) else None
        if not isinstance(criterios, dict) or not tiene_valores(criterios):
            raise ArchivoDePoblacionInvalido(f"{document_id}: sin valores de población")
        if entrada.get("metadata_source") != METADATA_SOURCE_VERIFICADO:
            raise ArchivoDePoblacionInvalido(f"{document_id}: metadata_source no verificado")
        sin_respaldo = criterios_sin_respaldo(criterios)
        if sin_respaldo:
            raise ArchivoDePoblacionInvalido(
                f"{document_id}: valores sin chunkId o nliResult en {', '.join(sin_respaldo)}"
            )
    return documentos


def cargar(repositorio: CorpusDocumentRepository, archivo: Path) -> dict[str, int]:
    """Escribe la población versionada. Valida TODO el archivo antes de tocar la base."""
    try:
        documentos = validar_archivo(json.loads(archivo.read_text(encoding="utf-8")))
    except (OSError, ValueError) as error:
        if isinstance(error, ArchivoDePoblacionInvalido):
            raise
        raise ArchivoDePoblacionInvalido("archivo ilegible") from None
    for document_id, entrada in documentos.items():
        try:
            repositorio.guardar_poblacion_verificada(
                document_id,
                entrada["population_criteria"],
                entrada["extracted_fields"],
                entrada["metadata_source"],
            )
        except VersionInexistente:
            raise ArchivoDePoblacionInvalido(f"{document_id}: no está en el corpus") from None
    return {"documentos_cargados": len(documentos)}


def exportar(repositorio: CorpusDocumentRepository, archivo: Path) -> dict[str, int]:
    """Vuelca la población verificada vigente; no escribe nada que ``cargar`` fuera a rechazar."""
    documentos = {
        document_id: entrada
        for document_id, entrada in sorted(repositorio.leer_poblaciones_verificadas().items())
        if tiene_valores(entrada["population_criteria"])
    }
    contenido = {"version": VERSION_DEL_ARCHIVO, "documentos": documentos}
    validar_archivo(contenido)
    archivo.write_text(json.dumps(contenido, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"documentos_exportados": len(documentos)}


def _argumentos(argv: Sequence[str] | None) -> argparse.Namespace:
    analizador = argparse.ArgumentParser(prog=f"python -m app.scripts.{NOMBRE}", description=__doc__)
    modos = analizador.add_subparsers(dest="modo", required=True)
    for modo in ("cargar", "exportar"):
        modos.add_parser(modo).add_argument("--archivo", type=Path, required=True)
    modos.add_parser("contar")
    return analizador.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    argumentos = _argumentos(argv)
    try:
        base = CorpusDatabaseSettings(_env_file=None)  # type: ignore[call-arg]
    except ValidationError as error:
        claves = ", ".join(sorted({str(e["loc"][0]).upper() for e in error.errors() if e["loc"]}))
        print(f"{NOMBRE}: configuración inválida en: {claves}", file=sys.stderr)
        return 1
    motor = crear_motor(
        componer_url(
            base.corpus_database_url,
            base.pg_rag_corpus_password_file,
            "PG_RAG_CORPUS_PASSWORD_FILE",
        )
    )
    try:
        repositorio = CorpusDocumentRepository(motor)
        if argumentos.modo == "cargar":
            resultado = cargar(repositorio, argumentos.archivo)
        elif argumentos.modo == "exportar":
            resultado = exportar(repositorio, argumentos.archivo)
        else:
            resultado = {"conteos": repositorio.contar_para_verificacion()}
    except ArchivoDePoblacionInvalido as error:
        print(f"{NOMBRE}: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # noqa: BLE001 - el mensaje de la base puede traer una URI: solo la clase
        print(f"{NOMBRE}: falló ({type(error).__name__})", file=sys.stderr)
        return 1
    finally:
        motor.dispose()
    print(json.dumps(resultado, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
