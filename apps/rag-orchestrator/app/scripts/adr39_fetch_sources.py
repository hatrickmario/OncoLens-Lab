"""Descarga reproducible de las fuentes del mini-dataset de ADR-39 (US-012 AC-13).

    python -m app.scripts.adr39_fetch_sources [--dataset-dir DIR] [--cache-dir DIR] [--refresh]

Descarga cada documento del manifiesto a ``DATA_CACHE_DIR`` (PMC en JATS por Europe PMC, ClinicalTrials.gov
API v2, NCI en HTML), registra su SHA-256 y termina con código 1 si una cita del golden no aparece en su
documento. Los textos descargados **nunca** entran al repo (RN-14); la caché vive en un volumen.
Atribución: Source: ClinicalTrials.gov, National Library of Medicine (sin aval de NLM); texto de NCI con
crédito y enlace al original.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.evaluation.chunking_variants import Seccion
from app.evaluation.dataset_loader import Dataset, DatasetInvalido, Fuente, cargar_dataset
from app.evaluation.parsers_fuentes import PARSERS
from app.evaluation.retrieval_metrics import contiene_cita

EUROPE_PMC_TEXTO = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
CTGOV_API_V2 = "https://clinicaltrials.gov/api/v2/studies/{nct_id}"
USER_AGENT = "OncoLens-Lab-ADR39/1.0 (investigacion academica; evaluacion de modelos de recuperacion)"
EXTENSIONES = {"jats_xml": "xml", "json_api": "json", "html": "html"}
SUBDIRECTORIO = "adr39"
REGISTRO = "descargas.json"
INTENTOS = 3


class FormatoNoSoportado(ValueError):
    """El manifiesto declara un ``formato_original`` sin extensión, URL ni parser."""


class FuenteNoDescargable(RuntimeError):
    """La fuente no se pudo descargar tras los reintentos."""


@dataclass(frozen=True)
class CitaAusente:
    pregunta: str
    documento: str


@dataclass(frozen=True)
class FuenteDescargada:
    id: str
    sha256: str
    bytes: int
    secciones: tuple[Seccion, ...]


def url_de(fuente: Fuente) -> str:
    if fuente.formato_original == "jats_xml":
        return EUROPE_PMC_TEXTO.format(pmcid=fuente.datos["pmcid"])
    if fuente.formato_original == "json_api":
        return CTGOV_API_V2.format(nct_id=fuente.datos["nct_id"])
    return str(fuente.datos["url"])


def _descargar(url: str, cliente: httpx.Client, dormir: Callable[[float], None]) -> bytes:
    ultimo: Exception | None = None
    for intento in range(1, INTENTOS + 1):
        try:
            respuesta = cliente.get(url, headers={"User-Agent": USER_AGENT}, follow_redirects=True, timeout=60.0)
            respuesta.raise_for_status()
            return respuesta.content
        except httpx.HTTPError as exc:
            ultimo = exc
            dormir(2.0 * intento)
    raise FuenteNoDescargable(f"no se pudo descargar {url}: {ultimo}")


def _leer_registro(ruta: Path) -> dict[str, dict[str, object]]:
    return json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}


def descargar_fuentes(
    dataset: Dataset,
    cache_dir: Path,
    cliente: httpx.Client,
    ahora: Callable[[], datetime],
    dormir: Callable[[float], None] = time.sleep,
    refrescar: bool = False,
) -> dict[str, FuenteDescargada]:
    """Descarga (o reutiliza de la caché) cada fuente, comprueba su checksum registrado y la divide en secciones."""
    carpeta = cache_dir / SUBDIRECTORIO
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta_registro = carpeta / REGISTRO
    registro = _leer_registro(ruta_registro)
    resultado: dict[str, FuenteDescargada] = {}
    for fuente in dataset.fuentes:
        archivo = carpeta / f"{fuente.id}.{EXTENSIONES[fuente.formato_original]}"
        if refrescar or not archivo.exists():
            contenido = _descargar(url_de(fuente), cliente, dormir)
            archivo.write_bytes(contenido)
            registro[fuente.id] = {
                "sha256": hashlib.sha256(contenido).hexdigest(),
                "bytes": len(contenido),
                "url": url_de(fuente),
                "descargado": ahora().isoformat(),
            }
        else:
            contenido = archivo.read_bytes()
            sha = hashlib.sha256(contenido).hexdigest()
            previo = registro.get(fuente.id, {}).get("sha256")
            if previo not in (None, sha):
                raise FuenteNoDescargable(f"la caché de {fuente.id} no coincide con su SHA-256 registrado")
            registro.setdefault(
                fuente.id,
                {"sha256": sha, "bytes": len(contenido), "url": url_de(fuente), "descargado": ahora().isoformat()},
            )
        resultado[fuente.id] = FuenteDescargada(
            id=fuente.id,
            sha256=str(registro[fuente.id]["sha256"]),
            bytes=len(contenido),
            secciones=tuple(PARSERS[fuente.formato_original](contenido)),
        )
    ruta_registro.write_text(json.dumps(registro, indent=2, sort_keys=True), encoding="utf-8")
    return resultado


def leer_fuentes_de_cache(dataset: Dataset, cache_dir: Path) -> dict[str, FuenteDescargada]:
    """Secciones de las fuentes ya descargadas, sin red; falla si falta alguna (la descarga la hace el orquestador)."""
    carpeta = cache_dir / SUBDIRECTORIO
    registro = _leer_registro(carpeta / REGISTRO)
    resultado: dict[str, FuenteDescargada] = {}
    for fuente in dataset.fuentes:
        archivo = carpeta / f"{fuente.id}.{EXTENSIONES[fuente.formato_original]}"
        if not archivo.exists() or fuente.id not in registro:
            raise FuenteNoDescargable(f"falta {fuente.id} en la caché; ejecute adr39_fetch_sources")
        contenido = archivo.read_bytes()
        resultado[fuente.id] = FuenteDescargada(
            id=fuente.id,
            sha256=str(registro[fuente.id]["sha256"]),
            bytes=len(contenido),
            secciones=tuple(PARSERS[fuente.formato_original](contenido)),
        )
    return resultado


def verificar_citas(dataset: Dataset, fuentes: Mapping[str, FuenteDescargada]) -> list[CitaAusente]:
    """Citas del golden que no aparecen en el texto de su documento (AC-13); informa pregunta y documento."""
    ausentes: list[CitaAusente] = []
    for pregunta in dataset.preguntas:
        for evidencia in pregunta.evidencia:
            texto = " ".join(s.texto for s in fuentes[evidencia.documento].secciones)
            if not contiene_cita(texto, evidencia.cita):
                ausentes.append(CitaAusente(pregunta.id, evidencia.documento))
    return ausentes


def _raiz_repo() -> Path:
    return Path(__file__).resolve().parents[4]


def main(argv: list[str] | None = None, cliente: httpx.Client | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset-dir", type=Path, default=_raiz_repo() / "data" / "eval" / "adr39-mini")
    parser.add_argument("--cache-dir", type=Path, default=Path(os.environ.get("DATA_CACHE_DIR", ".cache/data")))
    parser.add_argument("--refresh", action="store_true", help="vuelve a descargar aunque exista la caché")
    args = parser.parse_args(argv)

    try:
        dataset = cargar_dataset(args.dataset_dir)
    except DatasetInvalido as exc:
        print(f"dataset inválido: {exc}", file=sys.stderr)
        return 2
    cliente = cliente or httpx.Client()
    try:
        fuentes = descargar_fuentes(dataset, args.cache_dir, cliente, lambda: datetime.now(timezone.utc), refrescar=args.refresh)
    except FuenteNoDescargable as exc:
        print(str(exc), file=sys.stderr)
        return 3
    ausentes = verificar_citas(dataset, fuentes)
    for a in ausentes:
        print(f"cita ausente: pregunta {a.pregunta} en el documento {a.documento}", file=sys.stderr)
    if ausentes:
        return 1
    print(f"{len(fuentes)} fuentes descargadas y {sum(len(p.evidencia) for p in dataset.preguntas)} citas verificadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
