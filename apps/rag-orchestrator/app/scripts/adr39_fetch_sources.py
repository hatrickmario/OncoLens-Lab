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
from collections.abc import Callable, Mapping, Sequence
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


def _url_jats(fuente: Fuente) -> str:
    return EUROPE_PMC_TEXTO.format(pmcid=fuente.datos["pmcid"])


def _url_registro_ctgov(fuente: Fuente) -> str:
    return CTGOV_API_V2.format(nct_id=fuente.datos["nct_id"])


def _url_directa(fuente: Fuente) -> str:
    return str(fuente.datos["url"])


# formato_original -> (extensión del archivo en caché, URL de descarga, parser a secciones)
FORMATOS: dict[str, tuple[str, Callable[[Fuente], str], Callable[[bytes], Sequence[Seccion]]]] = {
    "jats_xml": ("xml", _url_jats, PARSERS["jats_xml"]),
    "json_api": ("json", _url_registro_ctgov, PARSERS["json_api"]),
    "html": ("html", _url_directa, PARSERS["html"]),
}


def _formato(fuente: Fuente) -> tuple[str, Callable[[Fuente], str], Callable[[bytes], Sequence[Seccion]]]:
    try:
        return FORMATOS[fuente.formato_original]
    except KeyError:
        raise FormatoNoSoportado(f"la fuente {fuente.id} declara formato_original {fuente.formato_original!r}; admitidos: {sorted(FORMATOS)}") from None


def url_de(fuente: Fuente) -> str:
    return _formato(fuente)[1](fuente)


def _archivo_de(carpeta: Path, fuente: Fuente) -> Path:
    return carpeta / f"{fuente.id}.{_formato(fuente)[0]}"


def _leer_y_verificar(archivo: Path, fuente: Fuente, registro: dict[str, dict[str, object]]) -> tuple[bytes, str]:
    """Contenido de la caché y su SHA-256; falla si difiere del registrado."""
    contenido = archivo.read_bytes()
    sha = hashlib.sha256(contenido).hexdigest()
    previo = registro.get(fuente.id, {}).get("sha256")
    if previo not in (None, sha):
        raise FuenteNoDescargable(f"la caché de {fuente.id} no coincide con su SHA-256 registrado")
    return contenido, sha


def _fuente_descargada(fuente: Fuente, sha: str, contenido: bytes) -> FuenteDescargada:
    return FuenteDescargada(id=fuente.id, sha256=sha, bytes=len(contenido), secciones=tuple(_formato(fuente)[2](contenido)))


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
        archivo = _archivo_de(carpeta, fuente)
        if refrescar or not archivo.exists():
            contenido = _descargar(url_de(fuente), cliente, dormir)
            archivo.write_bytes(contenido)
            sha = hashlib.sha256(contenido).hexdigest()
            registro[fuente.id] = {"sha256": sha, "bytes": len(contenido), "url": url_de(fuente), "descargado": ahora().isoformat()}
        else:
            contenido, sha = _leer_y_verificar(archivo, fuente, registro)
            registro.setdefault(fuente.id, {"sha256": sha, "bytes": len(contenido), "url": url_de(fuente), "descargado": ahora().isoformat()})
        resultado[fuente.id] = _fuente_descargada(fuente, str(registro[fuente.id]["sha256"]), contenido)
    ruta_registro.write_text(json.dumps(registro, indent=2, sort_keys=True), encoding="utf-8")
    return resultado


def leer_fuentes_de_cache(dataset: Dataset, cache_dir: Path) -> dict[str, FuenteDescargada]:
    """Secciones de las fuentes ya descargadas, sin red; falla si falta alguna (la descarga la hace el orquestador)."""
    carpeta = cache_dir / SUBDIRECTORIO
    registro = _leer_registro(carpeta / REGISTRO)
    resultado: dict[str, FuenteDescargada] = {}
    for fuente in dataset.fuentes:
        archivo = _archivo_de(carpeta, fuente)
        if not archivo.exists() or fuente.id not in registro:
            raise FuenteNoDescargable(f"falta {fuente.id} en la caché; ejecute adr39_fetch_sources")
        contenido, sha = _leer_y_verificar(archivo, fuente, registro)
        resultado[fuente.id] = _fuente_descargada(fuente, sha, contenido)
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
