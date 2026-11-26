"""La configuración local de la comparación de contexto y los resúmenes de ``reindex-context`` (US-279 AC-5, l1d-337 tareas 2.2 y 2.3): RN-12.

Todo sin modelos reales: la configuración local solo se carga, y las guardas de RN-12 de la suite se ejercitan antes de cargar nada.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.application.corpus_ingestion.contexto_llm import PROMPT_VERSION
from app.domain.corpus_seed.coleccion_de_la_variante import (
    coleccion_de_la_variante,
    exigir_coleccion_de_la_variante,
)
from app.domain.corpus_seed.contexto_del_chunk import VERSION_DE_LA_PLANTILLA, VarianteDeContexto
from app.evaluation.armado_comparacion import _indice_del_brazo, _llm_del_brazo
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.corrida_brazos import IndiceEnMemoriaDelBrazo, ResultadoDeBrazo
from app.evaluation.evaluate import leer_resumenes_de_contexto, main
from app.evaluation.indice_del_corpus import IndiceDelCorpus, ResumenDelIndice
from app.schemas.generated.models import RetrievalMode
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIGS = RAIZ_APP / "eval" / "configs"
CONFIG_LOCAL = CONFIGS / "s7-contexto.yaml"
ENTORNO_LOCAL = {
    "STACK_MEMORY_LIMIT_GB": "30",
    "RETRIEVAL_REGRESSION_TOLERANCE": "0.05",
    "RELEVANCE_THRESHOLD": "0.30",
    "NLI_ENTAILMENT_THRESHOLD": "0.7",
    "RETRIEVAL_TOP_K": "30",
    "RERANK_TOP_N": "10",
}
BRAZOS = ["A0", "A0-determinista", "A0-llm"]


# --- la configuración local --------------------------------------------------------------------------------------------


def test_la_configuracion_local_declara_los_tres_brazos_con_una_coleccion_por_variante() -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)

    brazos = config.comparacion.brazos  # type: ignore[union-attr]

    assert config.proveedor == "local" and config.indice_fuente == "milvus"
    assert [b.nombre for b in brazos] == BRAZOS
    assert [b.contexto for b in brazos] == list(VarianteDeContexto)
    assert brazos[0].coleccion is None  # ninguno lee MILVUS_COLLECTION_NAME: la ingesta de l1d-119
    assert config.corpus_declarado == "l1d-119"
    assert (
        config.umbrales_de_settings is True
    )  # los umbrales actuales salen de Settings ([S7 resp. 11])


def test_el_nombre_de_la_coleccion_de_cada_brazo_corresponde_a_su_variante_segun_la_regla_de_dominio() -> (
    None
):
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)

    for brazo in config.comparacion.brazos[1:]:  # type: ignore[union-attr]
        assert brazo.contexto is not None and brazo.coleccion is not None
        exigir_coleccion_de_la_variante(brazo.coleccion, brazo.contexto)
        assert brazo.coleccion == coleccion_de_la_variante("corpus_chunks", brazo.contexto)


def test_la_configuracion_local_no_declara_umbrales_ni_el_llm_de_la_ingesta_en_el_brazo() -> None:
    crudo: dict[str, Any] = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))

    assert "umbrales" not in crudo
    assert crudo["adaptadores"]["proveedor"] == "local"
    assert crudo["comparacion"]["parafrasis"]["ruta"] == "data/eval/parafrasis-v1"


def test_un_brazo_de_contexto_con_modelos_locales_exige_una_coleccion_de_milvus(
    tmp_path: Path,
) -> None:
    crudo: dict[str, Any] = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))
    crudo["indice"] = {"fuente": "en_memoria"}
    ruta = tmp_path / "en-memoria.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    with pytest.raises(ConfigInvalida, match="indice.fuente: milvus"):
        cargar_config_suite(ruta, ENTORNO_LOCAL)


# --- RN-12: el brazo llm no se mide con un proveedor que no sea local -------------------------------------------------------


@pytest.mark.ac("US-279", 5)
def test_con_una_url_de_llm_fuera_de_la_lista_local_la_suite_se_niega_antes_de_indexar_y_no_escribe_cifras(
    tmp_path: Path, capsys: Any
) -> None:
    """[US-279 AC-5] RN-12: el brazo ``llm`` solo se mide con ``proveedor: local`` y una URL de la lista local cerrada."""
    crudo: dict[str, Any] = yaml.safe_load(CONFIG_LOCAL.read_text(encoding="utf-8"))
    crudo["adaptadores"]["urls"]["llm"] = "https://api.nube-de-prueba.invalid/v1"
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    codigo = main(
        ["--config", str(ruta), "--suite", "retrieval", "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
        entorno=ENTORNO_LOCAL,
    )

    error = capsys.readouterr().err
    assert codigo == 1 and "RN-12" in error and "nube-de-prueba" not in error
    assert list((tmp_path / "s").glob("*")) == []


# --- --resumenes-de-contexto -------------------------------------------------------------------------------------------------


def _resumenes(tmp_path: Path, contenido: object) -> Path:
    ruta = tmp_path / "resumenes.json"
    ruta.write_text(json.dumps(contenido), encoding="utf-8")
    return ruta


def _resumen(variante: str, **extra: Any) -> dict[str, Any]:
    return {
        "modo": "reindex-context",
        "variante": variante,
        "version_de_la_plantilla": VERSION_DE_LA_PLANTILLA,
        "duracion_s": 12.5,
        "con_respaldo_por_salida_invalida": 3,
        "con_respaldo_por_llm_no_disponible": 1,
        **extra,
    }


def test_sin_el_archivo_de_resumenes_no_hay_ninguno() -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)

    assert leer_resumenes_de_contexto(None, config) == {}


def test_lee_el_resumen_de_cada_brazo_cuando_es_de_su_variante(tmp_path: Path) -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)
    ruta = _resumenes(
        tmp_path, {"A0-determinista": _resumen("determinista"), "A0-llm": _resumen("llm")}
    )

    resumenes = leer_resumenes_de_contexto(ruta, config)

    assert set(resumenes) == {"A0-determinista", "A0-llm"}
    assert resumenes["A0-llm"]["duracion_s"] == 12.5


@pytest.mark.parametrize(
    "contenido",
    [
        {"otro-brazo": {"variante": "llm"}},
        {"A0-llm": _resumen("determinista")},
        {"A0": _resumen("ninguno"), "A0-llm": "no es un mapa"},
        ["no", "es", "un", "mapa"],
    ],
)
def test_un_resumen_ajeno_o_de_otra_variante_se_rechaza(tmp_path: Path, contenido: object) -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)

    with pytest.raises(ConfigInvalida, match="resumenes-de-contexto"):
        leer_resumenes_de_contexto(_resumenes(tmp_path, contenido), config)


def test_un_archivo_que_no_es_json_se_rechaza_sin_su_contenido(tmp_path: Path) -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)
    ruta = tmp_path / "roto.json"
    ruta.write_text("{contenido-secreto", encoding="utf-8")

    with pytest.raises(ConfigInvalida) as error:
        leer_resumenes_de_contexto(ruta, config)

    assert "contenido-secreto" not in str(error.value)


# --- lo que el informe toma del resumen -------------------------------------------------------------------------------------


def _resultado(
    variante: VarianteDeContexto,
    *,
    indice: IndiceDelCorpus | None = None,
    en_memoria: IndiceEnMemoriaDelBrazo | None = None,
) -> ResultadoDeBrazo:
    return ResultadoDeBrazo(
        Brazo("A0-x", RetrievalMode.dense, contexto=variante),
        servicio=None,  # type: ignore[arg-type]
        resultados=[],
        metas=[],
        sin_terminos_lexicos=0,
        indice=indice,
        indice_en_memoria=en_memoria,
    )


def _indice(coleccion: str = "corpus_chunks__ctx_llm_v1", vigentes: int = 120) -> IndiceDelCorpus:
    return IndiceDelCorpus(None, ResumenDelIndice(coleccion, vigentes, "a" * 64))  # type: ignore[arg-type]


def test_el_indice_de_milvus_toma_la_duracion_del_resumen_y_los_vigentes_de_la_coleccion() -> None:
    brazo = _resultado(VarianteDeContexto.LLM, indice=_indice())

    assert _indice_del_brazo(brazo, _resumen("llm")) == {
        "construccion_s": 12.5,
        "chunks_vigentes": 120,
    }


def test_sin_el_resumen_la_duracion_es_null_y_no_cero() -> None:
    brazo = _resultado(VarianteDeContexto.NINGUNO, indice=_indice("corpus_chunks"))

    assert _indice_del_brazo(brazo, None) == {"construccion_s": None, "chunks_vigentes": 120}


def test_el_indice_en_memoria_manda_sobre_cualquier_resumen() -> None:
    brazo = _resultado(
        VarianteDeContexto.DETERMINISTA, en_memoria=IndiceEnMemoriaDelBrazo(0.25, 40, 0, 0)
    )

    assert _indice_del_brazo(brazo, _resumen("determinista")) == {
        "construccion_s": 0.25,
        "chunks_vigentes": 40,
    }


def test_el_bloque_llm_trae_modelo_prompt_y_respaldos_del_resumen() -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)
    brazo = _resultado(VarianteDeContexto.LLM, indice=_indice())

    assert _llm_del_brazo(config, brazo, _resumen("llm")) == {
        "modelo": "gemma4:26b-a4b-it-q4_K_M",
        "version_del_prompt": PROMPT_VERSION,
        "chunks_con_respaldo": {"salida_invalida": 3, "llm_no_disponible": 1},
    }


def test_sin_resumen_los_respaldos_son_null_y_no_cero() -> None:
    config = cargar_config_suite(CONFIG_LOCAL, ENTORNO_LOCAL)
    brazo = _resultado(VarianteDeContexto.LLM, indice=_indice())

    respaldos = _llm_del_brazo(config, brazo, None)["chunks_con_respaldo"]

    assert respaldos == {"salida_invalida": None, "llm_no_disponible": None}
