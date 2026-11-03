"""Genera ``corpus.yaml`` del dataset S5 desde ``data/raw/s3`` (US-120, L1D-119): fragmentos LITERALES de los textos públicos.

Determinista y sin red: lee ``data/raw/s3/manifest.yaml`` y sus ``docs/``; de cada documento toma hasta ``FRAGMENTOS`` párrafos
repartidos de forma pareja y los recorta al límite de palabras sin reescribir ni traducir una sola palabra (un fragmento es
siempre un prefijo literal del párrafo). Solo lee el corpus público con licencia registrada: ningún dato de pacientes.
Uso: ``python data/eval/s5-corpus-ampliado/generar_corpus.py`` (desde la raíz del repositorio).
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

RAIZ = Path(__file__).resolve().parents[3]
S3 = RAIZ / "data/raw/s3"
SALIDA = Path(__file__).resolve().parent / "corpus.yaml"
FRAGMENTOS = 5
PALABRAS_MIN = 45
PALABRAS_MAX = 130
RELEASE = "rel-s5-corpus-ampliado-1"
CORTE = "2026-11-03"
ES_REFERENCIA = re.compile(r"\[(?:PUBMED|PMID)|^\W*\d+\W|doi\.org|et al\.", re.IGNORECASE)
# Secciones administrativas de los artículos y el encabezado de procedencia de los registros de ensayos: no son evidencia.
ES_ADMINISTRATIVO = re.compile(
    r"(?:Conflicts? of Interest|Footnotes|Funding|Contributor|Author Contributions|Acknowledg|Data Availability|"
    r"Ethics|Source: ClinicalTrials|Disclaimer|Declarations?|Abbreviations|Supplementary|Publisher.s note|"
    r"[\w ]{3,40}: Conceptualization)",
    re.IGNORECASE,
)


def _recortar(parrafo: str) -> str:
    """Prefijo literal de ``parrafo`` de hasta ``PALABRAS_MAX`` palabras, terminado en un punto si lo hay."""
    palabras = parrafo.split(" ")
    if len(palabras) <= PALABRAS_MAX:
        return parrafo
    corte = " ".join(palabras[:PALABRAS_MAX])
    ultimo_punto = corte.rfind(". ")
    return corte[: ultimo_punto + 1] if ultimo_punto > len(corte) // 2 else corte


def _candidatos(texto: str) -> list[str]:
    candidatos = []
    for bloque in re.split(r"\n\s*\n", texto):
        parrafo = " ".join(bloque.split())
        palabras = len(parrafo.split())
        if (
            palabras < PALABRAS_MIN
            or ES_REFERENCIA.search(parrafo[:60])
            or ES_ADMINISTRATIVO.match(parrafo)
            or "http" in parrafo
        ):
            continue
        candidatos.append(_recortar(parrafo))
    return candidatos


def _repartidos(candidatos: list[str], n: int) -> list[str]:
    if len(candidatos) <= n:
        return candidatos
    paso = len(candidatos) / n
    return [candidatos[int(i * paso)] for i in range(n)]


def construir() -> dict[str, object]:
    manifiesto = yaml.safe_load((S3 / "manifest.yaml").read_text(encoding="utf-8"))
    documentos, chunks = [], []
    for d in manifiesto["documentos"]:
        texto = (S3 / d["text_path"]).read_text(encoding="utf-8")
        documentos.append(
            {"id": d["document_key"], "titulo": d["title"], "cancer": d["cancer_type_tags"][0]}
        )
        for numero, fragmento in enumerate(_repartidos(_candidatos(texto), FRAGMENTOS), 1):
            chunks.append(
                {
                    "id": f"ch-{d['document_key']}-{numero}",
                    "documento": d["document_key"],
                    "texto": fragmento,
                }
            )
    return {
        "clase": "sintetico",
        "release": RELEASE,
        "corte": CORTE,
        "documentos": documentos,
        "chunks": chunks,
    }


def main() -> None:
    cabecera = (
        "# Corpus del dataset S5 derivado de data/raw/s3 (US-120, L1D-119): fragmentos literales de textos públicos con\n"
        "# licencia registrada (ver data/raw/s3/ATTRIBUTION.md). Se regenera con generar_corpus.py; no editar a mano.\n"
    )
    cuerpo = yaml.safe_dump(
        construir(), allow_unicode=True, sort_keys=False, width=10_000, default_flow_style=False
    )
    SALIDA.write_text(cabecera + cuerpo, encoding="utf-8")


if __name__ == "__main__":
    main()
