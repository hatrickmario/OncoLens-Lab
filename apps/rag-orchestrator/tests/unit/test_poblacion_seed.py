"""Metadatos de población versionados de la demo (L1D-297): regla pura de respaldo y cargador/exportador con un catálogo falso."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.application.seed_corpus.ports import VersionInexistente
from app.domain.corpus_metadata.poblacion_verificada import criterios_sin_respaldo, tiene_valores
from app.scripts.poblacion_seed import (
    ArchivoDePoblacionInvalido,
    cargar,
    exportar,
    validar_archivo,
)

RAIZ = Path(__file__).resolve().parents[4]
ARCHIVO_VERSIONADO = RAIZ / "data" / "raw" / "seed" / "poblacion-verificada.json"


def _valor(chunk: str | None = "ch-1", nli: str = "entailment") -> dict[str, Any]:
    valor: dict[str, Any] = {
        "value": "HER2-negative",
        "scope": "elegibilidad",
        "promptVersion": "poblacion_v1",
        "modelVersion": "m",
        "catalogVersion": "1.2.0",
        "nliResult": nli,
    }
    if chunk is not None:
        valor["chunkId"] = chunk
    return valor


def _archivo(criterios: dict[str, Any], fuente: str = "extraido_verificado") -> dict[str, Any]:
    return {
        "version": 1,
        "documentos": {
            "doc-a": {
                "population_criteria": criterios,
                "extracted_fields": [c for c, v in criterios.items() if isinstance(v, list) and v],
                "metadata_source": fuente,
            }
        },
    }


class CatalogoFalso:
    def __init__(self, existentes: set[str], verificadas: dict[str, dict[str, Any]] | None = None):
        self.existentes = existentes
        self.verificadas = verificadas or {}
        self.escrituras: list[tuple[str, dict[str, Any], list[str], str]] = []

    def guardar_poblacion_verificada(self, document_id, criterios, campos, fuente) -> None:
        if document_id not in self.existentes:
            raise VersionInexistente(document_id)
        self.escrituras.append((document_id, dict(criterios), list(campos), fuente))

    def leer_poblaciones_verificadas(self) -> dict[str, dict[str, Any]]:
        return self.verificadas


# --- regla pura (US-247 AC-8) -------------------------------------------------------------------------------


def test_criterios_sin_respaldo_nombra_el_criterio_cuando_un_valor_no_trae_chunk_id():
    criterios = {"estado_her2": [_valor(chunk=None)], "ecog": [_valor()]}

    assert criterios_sin_respaldo(criterios) == ("estado_her2",)


def test_criterios_sin_respaldo_nombra_el_criterio_cuando_el_nli_no_es_entailment():
    assert criterios_sin_respaldo({"ecog": [_valor(nli="neutral")]}) == ("ecog",)


def test_criterios_sin_respaldo_no_incumple_cuando_el_criterio_es_pendiente_o_esta_vacio():
    criterios = {"ecog": {"status": "pendiente", "values": []}, "linea": []}

    assert criterios_sin_respaldo(criterios) == ()
    assert not tiene_valores(criterios)


# --- cargador -------------------------------------------------------------------------------------------------


def test_cargar_escribe_la_poblacion_cuando_el_archivo_es_valido(tmp_path):
    archivo = tmp_path / "p.json"
    archivo.write_text(json.dumps(_archivo({"estado_her2": [_valor()]})), encoding="utf-8")
    catalogo = CatalogoFalso({"doc-a"})

    assert cargar(catalogo, archivo) == {"documentos_cargados": 1}  # type: ignore[arg-type]
    assert catalogo.escrituras[0][0] == "doc-a"
    assert catalogo.escrituras[0][3] == "extraido_verificado"


def test_cargar_rechaza_sin_escribir_nada_cuando_un_valor_no_trae_chunk_id(tmp_path):
    archivo = tmp_path / "p.json"
    archivo.write_text(
        json.dumps(_archivo({"estado_her2": [_valor(chunk=None)]})), encoding="utf-8"
    )
    catalogo = CatalogoFalso({"doc-a"})

    with pytest.raises(ArchivoDePoblacionInvalido, match="estado_her2"):
        cargar(catalogo, archivo)  # type: ignore[arg-type]
    assert catalogo.escrituras == []


def test_cargar_rechaza_cuando_el_documento_no_esta_en_el_corpus(tmp_path):
    archivo = tmp_path / "p.json"
    archivo.write_text(json.dumps(_archivo({"estado_her2": [_valor()]})), encoding="utf-8")

    with pytest.raises(ArchivoDePoblacionInvalido, match="doc-a: no está en el corpus"):
        cargar(CatalogoFalso(set()), archivo)  # type: ignore[arg-type]


def test_validar_archivo_rechaza_cuando_la_fuente_de_metadatos_no_es_verificada():
    with pytest.raises(ArchivoDePoblacionInvalido, match="metadata_source"):
        validar_archivo(_archivo({"estado_her2": [_valor()]}, fuente="pendiente"))


def test_exportar_escribe_un_archivo_que_el_cargador_acepta(tmp_path):
    entrada = _archivo({"estado_her2": [_valor()]})["documentos"]
    catalogo = CatalogoFalso({"doc-a"}, verificadas=entrada)
    salida = tmp_path / "salida.json"

    assert exportar(catalogo, salida) == {"documentos_exportados": 1}  # type: ignore[arg-type]
    assert cargar(catalogo, salida) == {"documentos_cargados": 1}  # type: ignore[arg-type]


# --- el archivo versionado de la demo (US-247 AC-1 y AC-8) ---------------------------------------------------


def test_el_archivo_versionado_de_la_demo_no_tiene_valores_sin_chunk_id_ni_nli():
    """Chequeo de CI: ningún valor de población de la demo carece de ``chunkId`` o ``nliResult`` [US-247 AC-8]."""
    documentos = validar_archivo(json.loads(ARCHIVO_VERSIONADO.read_text(encoding="utf-8")))

    assert documentos


@pytest.mark.ac("US-247", 1)
def test_el_corpus_de_la_demo_trae_al_menos_tres_documentos_con_poblacion_verificada():
    """[US-247 AC-1] Al menos 3 documentos con ``extraido_verificado``, cada valor con ``chunkId`` de SU documento y
    ``nliResult = entailment``; la licencia aceptada sale del manifiesto de la semilla (RN-21)."""
    import yaml  # noqa: PLC0415

    documentos = validar_archivo(json.loads(ARCHIVO_VERSIONADO.read_text(encoding="utf-8")))
    manifiesto = yaml.safe_load(
        (RAIZ / "data" / "raw" / "seed" / "manifest.yaml").read_text(encoding="utf-8")
    )
    checksums = {d["document_key"]: d["checksum"] for d in manifiesto["documentos"] if d["license"]}

    assert len(documentos) >= 3
    for document_id, entrada in documentos.items():
        clave, _, huella = document_id.partition("@")
        # El document_id lleva la huella del texto: el archivo versionado corresponde al texto del manifiesto (RN-21).
        assert checksums[clave].startswith(huella)
        for valores in entrada["population_criteria"].values():
            for valor in valores if isinstance(valores, list) else []:
                assert valor["chunkId"].startswith(f"{document_id}#")
