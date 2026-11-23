"""Configuración de los brazos del reranker (US-278 AC-4, AC-5): campos del brazo, huella, validación y las tres configuraciones."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
import yaml

from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.evaluation.adaptadores_falsos import RerankerLexico
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.schemas.generated.models import RetrievalMode
from tests.evaluation.conftest import RAIZ_APP

CONFIGS = RAIZ_APP / "eval" / "configs"
ENTORNO = {
    "STACK_MEMORY_LIMIT_GB": "30",
    "RELEVANCE_THRESHOLD": "0.30",
    "NLI_ENTAILMENT_THRESHOLD": "0.7",
    "RETRIEVAL_TOP_K": "30",
    "RERANK_TOP_N": "10",
}

# SHA-256 de la configuración canónica de A0, A2 y A2b de ``s4-hibrida*.yaml`` ANTES de que ``Brazo`` ganara los campos del
# reranker: capturados de ``main`` con la fórmula de entonces. No deben cambiar (la huella forma parte del nombre del informe).
HUELLA_A0 = "f1e76d5f7f7124bd2ae634c9ae91e9041b5592b49993fe3599ba8201b493a379"
HUELLA_A2 = "de21035202e79b1e291771f64451dcf2651f771245bae00e3356dffac059db27"
HUELLA_A2B = "be3c69cd98653e93dadfdd4e69155bd42512279150e9b8f4919f7a3503c3f9ae"


def _config_con_brazo(tmp_path: Path, brazo: dict[str, Any]) -> Path:
    crudo = yaml.safe_load((CONFIGS / "s7-reranker-ventanas-fake.yaml").read_text(encoding="utf-8"))
    crudo["comparacion"]["brazos"] = [crudo["comparacion"]["brazos"][0], brazo]
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return ruta


def test_la_huella_de_a0_a2_y_a2b_de_las_configuraciones_hibridas_no_cambia_con_los_campos_del_reranker() -> (
    None
):
    for nombre in ("s4-hibrida-fake.yaml", "s4-hibrida.yaml"):
        config = cargar_config_suite(CONFIGS / nombre, {"RETRIEVAL_REGRESSION_TOLERANCE": "0.05"})

        huellas = {b.nombre: b.huella() for b in config.comparacion.brazos}  # type: ignore[union-attr]

        assert huellas == {"A0": HUELLA_A0, "A2": HUELLA_A2, "A2b": HUELLA_A2B}, nombre


def test_la_huella_cambia_cuando_un_brazo_declara_su_modo_o_su_largo_de_ventana() -> None:
    base = Brazo("A0", RetrievalMode.dense)

    con_modo = Brazo("A0", RetrievalMode.dense, reranker_modo="maximo")
    con_largo = Brazo("A0", RetrievalMode.dense, reranker_max_length=1024)
    con_indice = Brazo("A0", RetrievalMode.dense, indice="corpus_chunks_512")

    assert len({base.huella(), con_modo.huella(), con_largo.huella(), con_indice.huella()}) == 4
    assert base.cambia_el_reranker is False and con_modo.cambia_el_reranker is True
    assert con_indice.cambia_el_reranker is False  # otro índice no es otra etapa del reranker


def test_un_brazo_hibrido_tambien_lleva_los_campos_del_reranker() -> None:
    brazo = Brazo(
        "A2m",
        RetrievalMode.hibrida,
        EstrategiaDeFusion.rrf,
        rrf_k=60,
        reranker_modo="maximo",
        reranker_solape=8,
    )

    assert (
        brazo.reranker_modo == "maximo"
        and brazo.huella()
        != Brazo("A2m", RetrievalMode.hibrida, EstrategiaDeFusion.rrf, rrf_k=60).huella()
    )


def test_la_configuracion_lee_los_campos_del_reranker_de_cada_brazo() -> None:
    config = cargar_config_suite(CONFIGS / "s7-reranker-ventanas-fake.yaml", ENTORNO)

    brazos = {b.nombre: b for b in config.comparacion.brazos}  # type: ignore[union-attr]

    assert brazos["A0"].reranker_modo == "primera" and brazos["A0"].reranker_max_length == 12
    assert (
        brazos["A0-maximo"].reranker_modo == "maximo" and brazos["A0-maximo"].reranker_solape == 2
    )
    assert brazos["A0-longitud-ampliada"].reranker_max_length == 24
    assert config.comparacion.viabilidad.limite_memoria_gb == 30.0  # type: ignore[union-attr]
    assert config.comparacion.viabilidad.tope_p95_s == 20.0  # type: ignore[union-attr]  # de metas-iniciales.yaml


@pytest.mark.parametrize(
    ("brazo", "clave"),
    [
        ({"RERANKER_CHUNK_WINDOWS": "promedio"}, "RERANKER_CHUNK_WINDOWS"),
        ({"RERANKER_WINDOW_OVERLAP": -1}, "RERANKER_WINDOW_OVERLAP"),
        ({"RERANKER_WINDOW_OVERLAP": 1.5}, "RERANKER_WINDOW_OVERLAP"),
        ({"RERANKER_MAX_LENGTH": 0}, "RERANKER_MAX_LENGTH"),
        ({"RERANKER_MAX_LENGTH": 8, "RERANKER_WINDOW_OVERLAP": 8}, "RERANKER_WINDOW_OVERLAP"),
        ({"indice": "con espacios"}, "indice"),
    ],
    ids=[
        "modo",
        "solape-negativo",
        "solape-decimal",
        "largo-cero",
        "solape-no-menor-que-el-largo",
        "indice",
    ],
)
def test_un_brazo_con_un_campo_del_reranker_invalido_se_rechaza_nombrando_la_clave_y_no_el_valor(
    tmp_path: Path, brazo: dict[str, Any], clave: str
) -> None:
    ruta = _config_con_brazo(tmp_path, {"nombre": "A0-x", "RETRIEVAL_MODE": "dense", **brazo})

    with pytest.raises(ConfigInvalida) as error:
        cargar_config_suite(ruta, ENTORNO)

    assert clave in str(error.value)
    assert "promedio" not in str(error.value) and "con espacios" not in str(error.value)


def test_la_viabilidad_exige_el_limite_de_memoria_del_entorno_y_lo_nombra_cuando_falta() -> None:
    entorno = {k: v for k, v in ENTORNO.items() if k != "STACK_MEMORY_LIMIT_GB"}

    with pytest.raises(ConfigInvalida, match="STACK_MEMORY_LIMIT_GB"):
        cargar_config_suite(CONFIGS / "s7-reranker-ventanas-fake.yaml", entorno)


def test_la_viabilidad_exige_la_meta_del_p95_en_el_yaml_de_metas(tmp_path: Path) -> None:
    metas = tmp_path / "metas.yaml"
    metas.write_text(
        yaml.safe_dump({"metas": {"mrr": {"etiqueta": "MRR", "minimo": 0.6}}}), encoding="utf-8"
    )
    crudo = yaml.safe_load((CONFIGS / "s7-reranker-ventanas-fake.yaml").read_text(encoding="utf-8"))
    crudo["comparacion"]["metas"] = str(metas)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")

    with pytest.raises(ConfigInvalida, match="p95_evidence_analyses_s"):
        cargar_config_suite(ruta, ENTORNO)


def test_una_comparacion_sin_brazos_del_reranker_no_pide_metas_ni_limite_de_memoria() -> None:
    config = cargar_config_suite(CONFIGS / "s4-hibrida-fake.yaml", {})

    assert config.comparacion is not None and config.comparacion.viabilidad is None
    assert config.comparacion.parafrasis is None


@pytest.mark.ac("US-278", 4)
@pytest.mark.parametrize("nombre", ["s7-reranker-ventanas.yaml", "s7-reranker-chunks512.yaml"])
def test_las_configuraciones_con_modelos_locales_cargan_con_la_ingesta_como_fuente_del_indice(
    nombre: str,
) -> None:
    config = cargar_config_suite(
        CONFIGS / nombre, {**ENTORNO, "RETRIEVAL_REGRESSION_TOLERANCE": "0.05"}
    )

    assert config.proveedor == "local" and config.indice_fuente == "milvus"
    assert config.corpus_declarado == "l1d-119"
    assert (
        config.umbrales_de_settings is True
    )  # los umbrales actuales salen de Settings, no se copian ([S7 resp. 11])
    assert config.comparacion is not None and config.comparacion.brazos[0].nombre == "A0"


def test_la_configuracion_de_chunks_de_512_declara_su_coleccion_propia_solo_en_su_brazo() -> None:
    config = cargar_config_suite(
        CONFIGS / "s7-reranker-chunks512.yaml",
        {**ENTORNO, "RETRIEVAL_REGRESSION_TOLERANCE": "0.05"},
    )

    indices = {b.nombre: b.indice for b in config.comparacion.brazos}  # type: ignore[union-attr]

    assert indices == {"A0": None, "A512": "corpus_chunks_512"}


def test_la_configuracion_real_de_los_brazos_declara_el_solape_solo_en_el_brazo_de_ventanas() -> (
    None
):
    config = cargar_config_suite(
        CONFIGS / "s7-reranker-ventanas.yaml", {**ENTORNO, "RETRIEVAL_REGRESSION_TOLERANCE": "0.05"}
    )

    brazos = {b.nombre: b for b in config.comparacion.brazos}  # type: ignore[union-attr]

    assert [brazos[n].reranker_modo for n in brazos] == ["primera", "maximo", "primera"]
    assert brazos["A0-maximo"].reranker_solape == 64
    assert brazos["A0-longitud-ampliada"].reranker_max_length == 1024


# --- el reranker falso con ventanas (mismo contrato que el real: un puntaje por candidato en [0, 1]) --------------------------


class _Candidato:
    def __init__(self, texto: str, chunk_id: str = "c") -> None:
        self.chunk_id, self.document_id, self.chunk_text, self.similitud_dense = (
            chunk_id,
            "d",
            texto,
            0.1,
        )


TEXTO_LARGO = ("relleno " * 20) + "pembrolizumab quimioterapia neoadyuvante cancer"
PREGUNTA = "pembrolizumab quimioterapia neoadyuvante cancer"


def test_el_reranker_falso_sin_largo_puntua_el_texto_entero_como_antes() -> None:
    assert RerankerLexico().puntuar(PREGUNTA, [_Candidato(TEXTO_LARGO)]) == [1.0]


def test_el_reranker_falso_con_primera_solo_lee_las_primeras_palabras() -> None:
    reranker = RerankerLexico(max_length=10)

    assert reranker.puntuar(PREGUNTA, [_Candidato(TEXTO_LARGO)]) == [0.0]


def test_el_reranker_falso_con_maximo_encuentra_la_evidencia_del_final_y_nunca_puntua_menos_que_primera() -> (
    None
):
    primera = RerankerLexico(max_length=10, solape=2)
    maximo = primera.variante(modo_de_ventanas="maximo")

    assert maximo.puntuar(PREGUNTA, [_Candidato(TEXTO_LARGO)]) == [1.0]
    for texto in ("corto", TEXTO_LARGO, "pembrolizumab " + TEXTO_LARGO):
        assert (
            maximo.puntuar(PREGUNTA, [_Candidato(texto)])[0]
            >= primera.puntuar(PREGUNTA, [_Candidato(texto)])[0]
        )


def test_el_reranker_falso_expone_su_configuracion_y_una_variante_cambia_solo_lo_pedido() -> None:
    base = RerankerLexico(max_length=10, solape=2)

    variante = base.variante(modo_de_ventanas="maximo", max_length=20)

    assert (
        variante.configuracion.modo,
        variante.configuracion.solape,
        variante.configuracion.max_length,
    ) == (
        "maximo",
        2,
        20,
    )
    assert base.configuracion.modo == "primera"
