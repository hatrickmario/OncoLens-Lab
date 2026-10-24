"""Muestra de metadatos para revisión humana (US-118 AC-5, TBD-20): regla pura de selección y escritor YAML."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.application.corpus_ingestion.reporte import Estado, ReporteDeIngesta, ResultadoDeIngesta
from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
from app.domain.corpus_metadata.resultado import CampoDeMetadato, MetadatosResueltos
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from tests.support.fakes import RelojFijo

from app.domain.corpus_metadata.muestra import PorcentajeDeMuestraInvalido, seleccionar_muestra
from app.infrastructure.corpus_metadata.escritor_muestra import (
    EscritorDeMuestraYaml,
    ReleaseNoSeguraComoNombreDeArchivo,
)

IDS = tuple(f"doc-{i:02d}@abc" for i in range(1, 21))


def test_sin_documentos_la_muestra_es_vacia() -> None:
    assert seleccionar_muestra([], 10, "semilla") == ()


def test_el_tamano_redondea_hacia_arriba() -> None:
    assert len(seleccionar_muestra(IDS[:11], 10, "semilla")) == 2
    assert len(seleccionar_muestra(IDS[:1], 10, "semilla")) == 1


def test_el_redondeo_es_exacto_y_30_documentos_al_10_por_ciento_son_3() -> None:
    treinta = tuple(f"d-{i}" for i in range(30))

    assert len(seleccionar_muestra(treinta, 10, "semilla")) == 3


def test_20_documentos_al_10_por_ciento_son_2() -> None:
    assert len(seleccionar_muestra(IDS, 10, "semilla")) == 2


def test_al_0_por_ciento_no_se_elige_ninguno_y_al_100_se_eligen_todos() -> None:
    assert seleccionar_muestra(IDS, 0, "semilla") == ()
    assert set(seleccionar_muestra(IDS, 100, "semilla")) == set(IDS)


def test_la_seleccion_no_depende_del_orden_de_entrada() -> None:
    assert seleccionar_muestra(IDS, 25, "semilla") == seleccionar_muestra(
        tuple(reversed(IDS)), 25, "semilla"
    )


def test_la_misma_semilla_elige_siempre_los_mismos_en_el_mismo_orden() -> None:
    assert seleccionar_muestra(IDS, 25, "semilla") == seleccionar_muestra(IDS, 25, "semilla")


def test_otra_semilla_cambia_la_seleccion() -> None:
    assert seleccionar_muestra(IDS, 25, "semilla-a") != seleccionar_muestra(IDS, 25, "semilla-b")


def test_un_id_repetido_cuenta_una_sola_vez() -> None:
    assert len(seleccionar_muestra(("a", "a", "b", "b"), 50, "semilla")) == 1


@pytest.mark.parametrize("pct", [-1, 100.5, 1000])
def test_un_porcentaje_fuera_de_rango_se_rechaza(pct: float) -> None:
    with pytest.raises(PorcentajeDeMuestraInvalido):
        seleccionar_muestra(IDS, pct, "semilla")


def test_el_escritor_crea_el_directorio_y_escribe_el_yaml_de_la_release(tmp_path: Path) -> None:
    destino = tmp_path / "corpus-metadatos"

    archivo = EscritorDeMuestraYaml(destino).escribir(
        "release-1", {"release": "release-1", "nota": "Mediastino é"}
    )

    assert archivo == destino / "release-1.yaml"
    assert yaml.safe_load(archivo.read_text(encoding="utf-8"))["nota"] == "Mediastino é"


@pytest.mark.parametrize("release", ["../fuera", "a/b", "", "..", ".oculto", "a b"])
def test_el_escritor_rechaza_un_id_de_release_que_no_es_un_nombre_de_archivo_seguro(
    tmp_path: Path, release: str
) -> None:
    with pytest.raises(ReleaseNoSeguraComoNombreDeArchivo):
        EscritorDeMuestraYaml(tmp_path).escribir(release, {})

    assert list(tmp_path.iterdir()) == []


class _EscritorEnMemoria:
    def __init__(self) -> None:
        self.escritos: list[tuple[str, Mapping[str, Any]]] = []

    def escribir(self, release_id: str, contenido: Mapping[str, Any]) -> Path:
        self.escritos.append((release_id, contenido))
        return Path(f"{release_id}.yaml")


def _metadatos(origen: str, *campos: CampoDeMetadato) -> MetadatosResueltos:
    return MetadatosResueltos("otro", None, None, None, {}, origen, campos)


def _resultado(clave: str, origen: str, *campos: CampoDeMetadato) -> ResultadoDeIngesta:
    return ResultadoDeIngesta(
        clave, Estado.EMBEBIDO, metadatos=_metadatos(origen, *campos), document_id=f"{clave}@x"
    )


def _documento(clave: str) -> DocumentoDeSemilla:
    return DocumentoDeSemilla(
        document_key=clave,
        version_group_id=clave,
        source_type="literature",
        source_name="PMC Open Access",
        external_id=f"ext-{clave}",
        title=clave,
        language="en",
        cancer_type_tags=("mama",),
        published_at=date(2024, 1, 1),
        study_design="otro",
        population="adulto",
        original_format="jats_xml",
    )


def _generador(escritor: _EscritorEnMemoria, pct: float = 100) -> GeneradorDeMuestraDeMetadatos:
    return GeneradorDeMuestraDeMetadatos(
        pct=pct,
        semilla="s",
        escritor=escritor,
        reloj=RelojFijo(),
        prompt_version="metadatos_v1",
        llm_model="llm",
        nli_model="nli",
    )


FASE = CampoDeMetadato("trial_phase", "II")


def test_la_muestra_solo_incluye_documentos_extraidos_con_al_menos_un_campo_conservado() -> None:
    escritor = _EscritorEnMemoria()
    reporte = ReporteDeIngesta(
        (
            _resultado("a", "extraido_verificado", FASE),
            _resultado("b", "extraido_verificado"),
            _resultado("c", "fuente_estructurada", FASE),
            _resultado("d", "pendiente"),
        ),
        "release-1",
    )

    muestra = _generador(escritor).generar(reporte, [_documento(c) for c in "abcd"])

    assert muestra.tamano == 1
    assert [d["document_id"] for d in escritor.escritos[0][1]["documentos"]] == ["a@x"]


def test_la_muestra_no_se_escribe_cuando_la_ingesta_no_publico_release() -> None:
    escritor = _EscritorEnMemoria()
    reporte = ReporteDeIngesta((_resultado("a", "extraido_verificado", FASE),), None)

    muestra = _generador(escritor).generar(reporte, [_documento("a")])

    assert (muestra.tamano, muestra.archivo, escritor.escritos) == (0, None, [])


def test_la_muestra_al_0_por_ciento_no_escribe_archivo() -> None:
    escritor = _EscritorEnMemoria()
    reporte = ReporteDeIngesta((_resultado("a", "extraido_verificado", FASE),), "release-1")

    muestra = _generador(escritor, pct=0).generar(reporte, [_documento("a")])

    assert (muestra.tamano, escritor.escritos) == (0, [])


def test_cada_campo_de_la_muestra_nace_pendiente_de_revision_y_sin_nota() -> None:
    escritor = _EscritorEnMemoria()
    reporte = ReporteDeIngesta((_resultado("a", "extraido_verificado", FASE),), "release-1")

    _generador(escritor).generar(reporte, [_documento("a")])

    (cabecera,) = [escritor.escritos[0][1]]
    entrada = cabecera["documentos"][0]
    assert entrada["campos"] == [
        {"campo": "trial_phase", "valor": "II", "revision": "pendiente", "nota": ""}
    ]
    assert entrada["source_url"] == "no_disponible"
    assert cabecera["generated_at"] == RelojFijo().ahora().isoformat()
