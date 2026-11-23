"""Carga del dataset `parafrasis-v1` y de la configuración de la familia `diagnostico` (US-276, RN-22): lo que rechaza, con qué
mensaje y qué deja en memoria. Los mensajes nombran el par o la clave, nunca el texto de una pregunta ni un valor."""

from __future__ import annotations

import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.config_diagnostico import cargar_config_diagnostico
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.dataset_diagnostico import (
    cargar_dataset_diagnostico,
    dataset_para_el_servicio,
    pregunta_de_redaccion,
)
from app.evaluation.dataset_loader import DatasetInvalido
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO

DATASET = RAIZ_REPO / "data" / "eval" / "parafrasis-v1"
CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "diagnostico-fake.yaml"
CONFIG_LOCAL = RAIZ_APP / "eval" / "configs" / "diagnostico-local.yaml"


def copia(tmp_path: Path, cambiar: Callable[[dict[str, Any], dict[str, Any]], None]) -> Path:
    """Copia editable del dataset: ``cambiar(manifiesto, pares)`` muta el contenido ya leído."""
    destino = tmp_path / "ds"
    shutil.copytree(DATASET, destino)
    manifiesto = yaml.safe_load((destino / "manifest.yaml").read_text(encoding="utf-8"))
    pares = yaml.safe_load((destino / "pares.yaml").read_text(encoding="utf-8"))
    cambiar(manifiesto, pares)
    (destino / "manifest.yaml").write_text(
        yaml.safe_dump(manifiesto, allow_unicode=True), encoding="utf-8"
    )
    (destino / "pares.yaml").write_text(yaml.safe_dump(pares, allow_unicode=True), encoding="utf-8")
    return destino


def config_con(tmp_path: Path, origen: Path, cambiar: Callable[[dict[str, Any]], None]) -> Path:
    crudo = yaml.safe_load(origen.read_text(encoding="utf-8"))
    cambiar(crudo)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return ruta


# --- dataset -----------------------------------------------------------------------------------------------------------


def test_el_dataset_real_carga_con_sus_pares_el_corpus_y_el_chunk_esperado_de_cada_cita() -> None:
    dataset = cargar_dataset_diagnostico(DATASET, pares_minimos=10)

    assert (dataset.clase, dataset.nombre, len(dataset.pares)) == ("sintetico", "parafrasis-v1", 12)
    assert dataset.corpus.nombre == "s5-corpus-ampliado"
    assert all(par.chunks_esperados for par in dataset.pares)
    assert dataset.revision_provisional.rol == "ia"
    p01 = next(p for p in dataset.pares if p.id == "P01")
    assert p01.chunks_esperados == ("ch-nci-prostata-hp-en-2",)


def test_cada_redaccion_es_una_pregunta_de_la_suite_con_id_de_par_y_de_redaccion() -> None:
    dataset = cargar_dataset_diagnostico(DATASET, pares_minimos=10)
    par = dataset.pares[0]

    pregunta = pregunta_de_redaccion(par, par.redacciones[1])

    assert (pregunta.id, pregunta.cancer, pregunta.modo_acierto) == (
        "P01-b",
        "prostata",
        "cualquiera",
    )
    assert pregunta.texto == par.redacciones[1].texto
    assert [e.documento for e in pregunta.evidencia] == ["nci-prostata-hp-en"]


def test_el_corpus_del_servicio_trae_una_opcion_guionada_por_redaccion_que_cita_el_chunk_esperado() -> (
    None
):
    dataset = cargar_dataset_diagnostico(DATASET, pares_minimos=10)

    corpus = dataset_para_el_servicio(dataset)

    assert {p.texto for p in corpus.preguntas} >= {
        r.texto for par in dataset.pares for r in par.redacciones
    }
    (opcion,) = corpus.propuestas["P01-a"]
    assert opcion.citas == ("ch-nci-prostata-hp-en-2",)
    assert len(opcion.justificacion.split()) <= 12
    assert (
        corpus.chunks == dataset.corpus.chunks
    )  # el corpus no cambia: solo se añaden preguntas y propuestas


@pytest.mark.parametrize("clase", ["real_anonimizado", None])
def test_rechaza_un_manifiesto_que_no_declara_clase_sintetico(
    tmp_path: Path, clase: str | None
) -> None:
    destino = copia(tmp_path, lambda m, p: m.update(clase=clase))

    with pytest.raises(DatasetInvalido, match="sintetico"):
        cargar_dataset_diagnostico(destino, pares_minimos=10)


def test_rechaza_un_pares_yaml_con_otra_clase_que_el_manifiesto(tmp_path: Path) -> None:
    destino = copia(tmp_path, lambda m, p: p.update(clase="real_anonimizado"))

    with pytest.raises(DatasetInvalido, match="pares.yaml"):
        cargar_dataset_diagnostico(destino, pares_minimos=10)


def test_rechaza_una_cita_que_no_esta_en_el_corpus_nombrando_el_par_y_no_el_texto(
    tmp_path: Path,
) -> None:
    def cambiar(manifiesto: dict[str, Any], pares: dict[str, Any]) -> None:
        pares["pares"][3]["evidencia"][0]["cita"] = "fragmento inventado que no existe en el corpus"

    with pytest.raises(DatasetInvalido, match="P04") as error:
        cargar_dataset_diagnostico(copia(tmp_path, cambiar), pares_minimos=10)

    assert "inventado" not in str(error.value)


def test_rechaza_un_dataset_sin_la_marca_de_revision_provisional(tmp_path: Path) -> None:
    destino = copia(tmp_path, lambda m, p: m.pop("revision_provisional"))

    with pytest.raises(DatasetInvalido, match="revision_provisional"):
        cargar_dataset_diagnostico(destino, pares_minimos=10)


def test_rechaza_un_dataset_con_menos_pares_que_los_minimos() -> None:
    with pytest.raises(DatasetInvalido, match="pares_minimos"):
        cargar_dataset_diagnostico(DATASET, pares_minimos=13)


def test_rechaza_un_dataset_al_que_le_falta_un_tipo_de_variacion(tmp_path: Path) -> None:
    def cambiar(manifiesto: dict[str, Any], pares: dict[str, Any]) -> None:
        pares["pares"] = [p for p in pares["pares"] if p["tipo"] != "es_en"]

    with pytest.raises(DatasetInvalido, match="es_en"):
        cargar_dataset_diagnostico(copia(tmp_path, cambiar), pares_minimos=5)


def test_rechaza_un_par_con_una_sola_redaccion_o_con_redacciones_iguales(tmp_path: Path) -> None:
    def cambiar(manifiesto: dict[str, Any], pares: dict[str, Any]) -> None:
        pares["pares"][0]["redacciones"][1] = dict(pares["pares"][0]["redacciones"][0], id="b")

    with pytest.raises(DatasetInvalido, match="P01"):
        cargar_dataset_diagnostico(copia(tmp_path, cambiar), pares_minimos=10)


def test_rechaza_un_tipo_de_variacion_desconocido_y_un_id_de_par_repetido(tmp_path: Path) -> None:
    def tipo(manifiesto: dict[str, Any], pares: dict[str, Any]) -> None:
        pares["pares"][0]["tipo"] = "inventado"

    def repetido(manifiesto: dict[str, Any], pares: dict[str, Any]) -> None:
        pares["pares"][1]["id"] = "P01"

    with pytest.raises(DatasetInvalido, match="P01"):
        cargar_dataset_diagnostico(copia(tmp_path / "a", tipo), pares_minimos=10)
    with pytest.raises(DatasetInvalido, match="repite"):
        cargar_dataset_diagnostico(copia(tmp_path / "b", repetido), pares_minimos=10)


# --- configuración -----------------------------------------------------------------------------------------------------


def test_la_configuracion_de_la_ci_declara_los_parametros_de_la_familia_sin_valores_en_codigo() -> (
    None
):
    suite = cargar_config_suite(CONFIG_FAKE)

    config = cargar_config_diagnostico(CONFIG_FAKE, suite)

    assert (config.pares_minimos, config.nli_banda_inferior, config.nli_ancho_de_tramo) == (
        10,
        0.5,
        0.1,
    )
    assert config.reranker_max_pairs == 20


@pytest.mark.parametrize("clave", ["pares_minimos", "nli_banda_inferior", "nli_ancho_de_tramo"])
def test_una_clave_ausente_es_una_configuracion_invalida_que_nombra_la_clave(
    tmp_path: Path, clave: str
) -> None:
    ruta = config_con(tmp_path, CONFIG_FAKE, lambda c: c["diagnostico"].pop(clave))

    with pytest.raises(ConfigInvalida, match=clave):
        cargar_config_diagnostico(ruta, cargar_config_suite(ruta))


@pytest.mark.parametrize(
    ("clave", "valor"),
    [
        ("pares_minimos", 0),
        ("pares_minimos", True),
        ("nli_banda_inferior", 0.7),  # no menor que NLI_ENTAILMENT_THRESHOLD
        ("nli_banda_inferior", -0.1),
        ("nli_ancho_de_tramo", 0.3),  # no divide [0, 1] en tramos iguales
        ("nli_ancho_de_tramo", 0),
        ("reranker_max_pairs", 0),
    ],
)
def test_un_valor_invalido_es_una_configuracion_invalida_que_nombra_la_clave_y_no_el_valor(
    tmp_path: Path, clave: str, valor: object
) -> None:
    ruta = config_con(tmp_path, CONFIG_FAKE, lambda c: c["diagnostico"].update({clave: valor}))

    with pytest.raises(ConfigInvalida, match=clave) as error:
        cargar_config_diagnostico(ruta, cargar_config_suite(ruta))

    assert str(valor) not in str(error.value) or str(valor) in ("0", "True")


def test_el_corte_a_los_pares_del_reranker_solo_se_declara_con_adaptadores_falsos(
    tmp_path: Path,
) -> None:
    ruta = config_con(
        tmp_path, CONFIG_LOCAL, lambda c: c["diagnostico"].update(reranker_max_pairs=20)
    )

    with pytest.raises(ConfigInvalida, match="reranker_max_pairs"):
        cargar_config_diagnostico(ruta, cargar_config_suite(ruta))


def test_la_configuracion_local_usa_los_umbrales_vigentes_y_los_modelos_de_adr_39() -> None:
    suite = cargar_config_suite(CONFIG_LOCAL)

    config = cargar_config_diagnostico(CONFIG_LOCAL, suite)

    assert suite.proveedor == "local"
    assert suite.llm_modelo == "gemma4:26b-a4b-it-q4_K_M"
    assert (
        suite.umbrales.relevance_threshold,
        suite.umbrales.nli_entailment_threshold,
        suite.umbrales.retrieval_top_k,
        suite.umbrales.rerank_top_n,
    ) == (0.30, 0.7, 30, 10)
    assert config.reranker_max_pairs is None  # manda el del reranker cargado (RERANKER_MAX_PAIRS)
