"""Muestra de metadatos para revisión humana (US-118 AC-5, TBD-20): regla pura de selección y escritor YAML."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.application.corpus_ingestion.reporte import ReporteDeIngesta
from app.application.corpus_metadata.muestra_de_metadatos import GeneradorDeMuestraDeMetadatos
from app.application.seed_corpus.ports import RegistroDeDocumento, RegistroDeRelease
from app.application.seed_corpus.registros import registro_embebido
from app.domain.corpus_metadata.muestra import PorcentajeDeMuestraInvalido, seleccionar_muestra
from app.domain.corpus_metadata.resultado import MetadatosResueltos
from app.domain.corpus_seed.admisibilidad import Admision
from app.domain.corpus_seed.documento import DocumentoDeSemilla
from app.domain.corpus_seed.poblacion import resolver_criterios_poblacion
from app.infrastructure.corpus_metadata.escritor_muestra import (
    ArchivoDeMuestraEsUnEnlace,
    EscritorDeMuestraYaml,
    ReleaseNoSeguraComoNombreDeArchivo,
)
from tests.support.almacenes_falsos import CatalogoEnMemoria
from tests.support.fakes import RelojFijo

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


AHORA = RelojFijo().ahora()
ADMITIDO = Admision(None, "dominio_publico")


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


def _fila(clave: str, origen: str, **metadatos: Any) -> RegistroDeDocumento:
    """Fila del catálogo como la deja la ingesta: ``trial_phase`` etc. son los valores conservados."""
    resueltos = MetadatosResueltos(
        study_design=metadatos.get("study_design", "otro"),
        trial_phase=metadatos.get("trial_phase"),
        sample_size=metadatos.get("sample_size"),
        primary_endpoint=metadatos.get("primary_endpoint"),
        population_criteria=metadatos.get(
            "population_criteria", resolver_criterios_poblacion(None)
        ),
        metadata_source=origen,
    )
    return registro_embebido(_documento(clave), ADMITIDO, "ab" * 32, AHORA, resueltos)


def _catalogo(*filas: RegistroDeDocumento, release: str | None = "release-1") -> CatalogoEnMemoria:
    catalogo = CatalogoEnMemoria()
    for fila in filas:
        catalogo.guardar_documento(fila)
    if release:
        catalogo.publicar_release(
            RegistroDeRelease(
                release, date(2026, 10, 16), (), AHORA, tuple(f.document_id for f in filas)
            )
        )
    return catalogo


def _generador(
    escritor: _EscritorEnMemoria, catalogo: CatalogoEnMemoria, pct: float = 100
) -> GeneradorDeMuestraDeMetadatos:
    return GeneradorDeMuestraDeMetadatos(
        pct=pct,
        semilla="s",
        escritor=escritor,
        catalogo=catalogo,
        reloj=RelojFijo(),
        prompt_version="metadatos_v1",
        llm_model="llm",
        nli_model="nli",
    )


def _reporte(release: str | None = "release-1") -> ReporteDeIngesta:
    return ReporteDeIngesta((), release)


def test_la_muestra_solo_incluye_documentos_extraidos_con_al_menos_un_campo_conservado() -> None:
    escritor = _EscritorEnMemoria()
    catalogo = _catalogo(
        _fila("a", "extraido_verificado", trial_phase="II"),
        _fila("b", "extraido_verificado"),
        _fila("c", "fuente_estructurada", trial_phase="II"),
        _fila("d", "pendiente"),
    )

    muestra = _generador(escritor, catalogo).generar(_reporte())

    assert muestra.tamano == 1
    assert [d["document_id"] for d in escritor.escritos[0][1]["documentos"]] == ["a@" + "ab" * 6]


def test_la_muestra_no_se_escribe_cuando_la_ingesta_no_publico_release() -> None:
    escritor = _EscritorEnMemoria()
    catalogo = _catalogo(_fila("a", "extraido_verificado", trial_phase="II"), release=None)

    muestra = _generador(escritor, catalogo).generar(_reporte(None))

    assert (muestra.tamano, muestra.archivo, escritor.escritos) == (0, None, [])


def test_la_muestra_al_0_por_ciento_no_escribe_archivo() -> None:
    escritor = _EscritorEnMemoria()
    catalogo = _catalogo(_fila("a", "extraido_verificado", trial_phase="II"))

    muestra = _generador(escritor, catalogo, pct=0).generar(_reporte())

    assert (muestra.tamano, escritor.escritos) == (0, [])


def test_la_muestra_solo_considera_los_documentos_de_la_release_publicada() -> None:
    escritor = _EscritorEnMemoria()
    catalogo = _catalogo(_fila("a", "extraido_verificado", trial_phase="II"))
    catalogo.guardar_documento(_fila("fuera", "extraido_verificado", trial_phase="III"))

    muestra = _generador(escritor, catalogo).generar(_reporte())

    assert muestra.tamano == 1


def test_cada_campo_de_la_muestra_nace_pendiente_de_revision_y_sin_nota() -> None:
    escritor = _EscritorEnMemoria()
    catalogo = _catalogo(
        _fila(
            "a",
            "extraido_verificado",
            trial_phase="II",
            population_criteria={
                **resolver_criterios_poblacion(None),
                "estadio": "I–III",
                "biomarcadores": {"her2": "positivo"},
            },
        )
    )

    _generador(escritor, catalogo).generar(_reporte())

    cabecera = escritor.escritos[0][1]
    entrada = cabecera["documentos"][0]
    assert entrada["campos"] == [
        {"campo": "trial_phase", "valor": "II", "revision": "pendiente", "nota": ""},
        {"campo": "estadio", "valor": "I–III", "revision": "pendiente", "nota": ""},
        {"campo": "biomarcadores.her2", "valor": "positivo", "revision": "pendiente", "nota": ""},
    ]
    assert entrada["source_url"] == "no_disponible"
    assert cabecera["generated_at"] == RelojFijo().ahora().isoformat()


def test_el_escritor_no_sigue_un_enlace_simbolico_existente_y_no_toca_su_destino(
    tmp_path: Path,
) -> None:
    ajeno = tmp_path / "ajeno.txt"
    ajeno.write_text("intacto", encoding="utf-8")
    destino = tmp_path / "muestra"
    destino.mkdir()
    (destino / "release-1.yaml").symlink_to(ajeno)

    with pytest.raises(ArchivoDeMuestraEsUnEnlace):
        EscritorDeMuestraYaml(destino).escribir("release-1", {"a": 1})

    assert ajeno.read_text(encoding="utf-8") == "intacto"
