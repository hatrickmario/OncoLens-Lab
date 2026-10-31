"""Unitarios y de borde de la comparación híbrida vs densa (US-133): configuración, guarda de partición, adapters falsos
*sparse* y cableado de los modelos locales. La aceptación vive en ``test_comparacion_hibrida_aceptacion.py``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
import yaml

from app.application.ports import FalloDeInferencia
from app.config.settings import Settings
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.evaluation.adaptadores_falsos import (
    BuscadorSparseEnMemoria,
    CodificadorSparseLexico,
    EmbedderBolsaDePalabras,
    NliLexico,
    RerankerLexico,
)
from app.evaluation.armado_comparacion import armar_comparacion
from app.evaluation.composicion_suite import componer_servicio
from app.evaluation.config_suite import (
    Comparacion,
    ConfigInvalida,
    cargar_config_suite,
)
from app.evaluation.corrida_brazos import ResultadoDeBrazo
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.evaluate import main
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada, verificar_golden_sha256
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.models.local import ModelosDeRecuperacion
from app.schemas.generated.models import Fusion, RagMeta, RetrievalMode
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.test_comparacion_hibrida_aceptacion import (
    CONFIG,
    FIXTURE,
    config_con,
    leer_comparacion,
    por_nombre,
)
from tests.evaluation.test_proveedor_local_aceptacion import (
    COMPLETIONS,
    EmbedderDePasajesFalso,
    respuesta_del_generador,
)
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

PARTICION_FAKE = RAIZ_APP / "eval" / "particiones" / "fx-t5a-a"
CONFIG_REAL = RAIZ_APP / "eval" / "configs" / "s4-hibrida.yaml"
PARTICION_OL06 = RAIZ_REPO / "data" / "eval" / "ol06-particion-v1"


def cargar(tmp_path: Path, cambios: dict[str, Any], entorno: dict[str, str] | None = None) -> Any:
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    for clave, valor in cambios.items():
        if valor is None:
            crudo["comparacion"].pop(clave, None)
        else:
            crudo["comparacion"][clave] = valor
    ruta = tmp_path / "cfg.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return cargar_config_suite(ruta, entorno)


def test_la_configuracion_falsa_carga_los_tres_brazos_con_los_parametros_de_la_fuente() -> None:
    comparacion = cargar_config_suite(CONFIG).comparacion

    assert isinstance(comparacion, Comparacion)
    assert [(b.nombre, b.trazado_esperado()) for b in comparacion.brazos] == [
        ("A0", (RetrievalMode.dense, Fusion.ninguna, 0)),
        ("A2", (RetrievalMode.hibrida, Fusion.rrf, 60)),
        ("A2b", (RetrievalMode.hibrida, Fusion.ponderada, 0.3)),
    ]


def test_la_configuracion_real_declara_los_tres_brazos_y_exige_la_tolerancia_por_entorno() -> None:
    with pytest.raises(ConfigInvalida, match="tolerancia_retroceso"):
        cargar_config_suite(
            CONFIG_REAL
        )  # sin valor por defecto inventado: lo fija la preinscripción P1

    config = cargar_config_suite(CONFIG_REAL, {"RETRIEVAL_REGRESSION_TOLERANCE": "0.05"})

    assert config.comparacion is not None
    assert [b.nombre for b in config.comparacion.brazos] == ["A0", "A2", "A2b"]
    assert config.comparacion.tolerancia_retroceso == 0.05
    assert config.proveedor == "local" and config.subconjunto == "desarrollo"


def test_la_tolerancia_del_entorno_sustituye_a_la_del_yaml_y_cambia_la_huella(
    tmp_path: Path,
) -> None:
    base = cargar(tmp_path, {})
    con_entorno = cargar(tmp_path, {}, {"RETRIEVAL_REGRESSION_TOLERANCE": "0.1"})

    assert con_entorno.comparacion.tolerancia_retroceso == 0.1
    assert con_entorno.hash_config != base.hash_config


@pytest.mark.parametrize(
    ("cambio", "clave"),
    [
        ({"tolerancia_retroceso": None}, "tolerancia_retroceso"),
        ({"tolerancia_retroceso": 1.5}, "tolerancia_retroceso"),
        ({"brazos": [{"nombre": "A0", "RETRIEVAL_MODE": "dense"}]}, "comparacion.brazos"),
        (
            {
                "brazos": [
                    {
                        "nombre": "A2",
                        "RETRIEVAL_MODE": "hibrida",
                        "RETRIEVAL_FUSION": "rrf",
                        "RRF_K": 60,
                    },
                    {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
                ]
            },
            "comparacion.brazos",
        ),
        (
            {
                "brazos": [
                    {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
                    {"nombre": "A2", "RETRIEVAL_MODE": "hibrida", "RETRIEVAL_FUSION": "rrf"},
                ]
            },
            "RRF_K",
        ),
        (
            {
                "brazos": [
                    {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
                    {
                        "nombre": "A2b",
                        "RETRIEVAL_MODE": "hibrida",
                        "RETRIEVAL_FUSION": "ponderada",
                        "HYBRID_SPARSE_WEIGHT": 1.0,
                    },
                ]
            },
            "HYBRID_SPARSE_WEIGHT",
        ),
        (
            {
                "brazos": [
                    {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
                    {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
                ]
            },
            "únicos",
        ),
    ],
)
def test_una_comparacion_mal_formada_se_rechaza_nombrando_la_clave(
    tmp_path: Path, cambio: dict[str, Any], clave: str
) -> None:
    with pytest.raises(ConfigInvalida, match=clave):
        cargar(tmp_path, cambio)


def test_la_particion_congelada_de_ol06_coincide_con_el_golden_vigente() -> None:
    verificar_golden_sha256(PARTICION_OL06)  # no lanza


def test_la_particion_sintetica_del_fixture_coincide_con_su_golden() -> None:
    verificar_golden_sha256(PARTICION_FAKE)


def test_una_particion_sin_huella_aborta_pidiendo_la_version_nueva(tmp_path: Path) -> None:
    (tmp_path / "particion.yaml").write_text("clase: sintetico\n", encoding="utf-8")
    (tmp_path / "manifest.yaml").write_text(
        yaml.safe_dump({"origen": str(FIXTURE), "archivo_golden": "preguntas.yaml"}),
        encoding="utf-8",
    )

    with pytest.raises(SuiteAbortada, match="particion-v2"):
        verificar_golden_sha256(tmp_path)


def test_el_codificador_sparse_falso_falla_con_un_texto_sin_terminos_igual_que_el_real() -> None:
    codificador = CodificadorSparseLexico()

    with pytest.raises(FalloDeInferencia):
        codificador.embeber_sparse("¿qué es eso?")
    assert codificador.vector_de("¿qué es eso?") == {}


def test_la_busqueda_sparse_falsa_ordena_por_producto_interno_y_omite_los_que_no_comparten_terminos() -> (
    None
):
    dataset = FuenteDatasetEnDirectorio(FIXTURE).cargar()
    codificador = CodificadorSparseLexico()
    buscador = BuscadorSparseEnMemoria(
        dataset, [codificador.vector_de(c.texto) for c in dataset.chunks]
    )

    aciertos = buscador.search_sparse(
        codificador.embeber_sparse("anti-HER2 therapy adjuvant"), limit=10, filtro=None
    )

    assert aciertos and aciertos[0].chunk_id == "ch-m1-1"
    assert all(a.similitud_sparse > 0 for a in aciertos)
    assert [a.similitud_sparse for a in aciertos] == sorted(
        (a.similitud_sparse for a in aciertos), reverse=True
    )


def test_la_comparacion_aborta_si_una_consulta_trae_el_retrieval_params_de_otro_brazo() -> None:
    config = cargar_config_suite(CONFIG)
    assert config.comparacion is not None
    dataset = FuenteDatasetEnDirectorio(FIXTURE).cargar()
    meta_dense = _meta_de_ejemplo(RetrievalMode.dense, Fusion.ninguna, 0)
    servicio = componer_servicio(config, dataset, Cronometro(RelojSimulado()), RelojFijo())
    a2 = config.comparacion.brazos[1]
    brazos = [
        ResultadoDeBrazo(config.comparacion.brazos[0], servicio, [], [meta_dense], 0),
        ResultadoDeBrazo(a2, servicio, [], [meta_dense], 0),  # A2 con la traza de dense
    ]

    with pytest.raises(SuiteAbortada, match="A2"):
        armar_comparacion(config, config.comparacion, brazos)


def _meta_de_ejemplo(modo: RetrievalMode, fusion: Fusion, parametro: float) -> RagMeta:
    ejemplo = json.loads(
        (RAIZ_REPO / "contracts" / "examples" / "rag-query-con-evidencia.json").read_text(
            encoding="utf-8"
        )
    )["meta"]
    ejemplo["retrievalParams"].update(
        {"retrievalMode": modo.value, "fusion": fusion.value, "fusionParam": parametro}
    )
    return RagMeta.model_validate(ejemplo)


def test_con_proveedor_local_los_brazos_comparten_los_modelos_y_el_cargador_recibe_el_modo_hibrido(
    tmp_path: Path,
) -> None:
    recibidos: list[Settings] = []
    cargas = 0

    def cargador(settings: Settings) -> ModelosDeRecuperacion:
        nonlocal cargas
        cargas += 1
        recibidos.append(settings)
        return ModelosDeRecuperacion(
            detector_idioma=DetectorDeIdiomaLocal("es"),
            embedder_consulta=EmbedderBolsaDePalabras(),
            embedder_pasajes=EmbedderDePasajesFalso(),
            reranker=RerankerLexico(),
            clasificador_nli=NliLexico(),
            embedder_sparse_consulta=CodificadorSparseLexico(),
        )

    config = config_con(
        tmp_path,
        FIXTURE,
        PARTICION_FAKE,
        **{
            "adaptadores": {"proveedor": "local", "urls": {"llm": "http://127.0.0.1:11434/v1"}},
            "modelos": {"llm": "gemma-fingido@1"},
            "medicion": {"reloj": "simulado", "rss_limite_mib": 4489},
        },
    )
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables
    salida = tmp_path / "salida"
    with respx.mock(assert_all_called=False) as http:
        http.route(url=COMPLETIONS).mock(return_value=respuesta_del_generador())
        http.route().mock(return_value=httpx.Response(404))
        codigo = main(
            ["--config", str(config), "--suite", "all", "--salida", str(salida)],
            reloj=RelojFijo(),
            entorno=entorno,
            cargador_de_modelos=cargador,
            lector_rss=lambda: 100.0,
        )

    assert codigo == 0
    assert cargas == 1 and recibidos[0].retrieval_mode == "hibrida"
    brazos = por_nombre(leer_comparacion(salida))
    assert brazos["A2"]["trazabilidad"] == {"consultas": 5, "coherentes": 5}


def test_la_comparacion_no_escribe_textos_de_preguntas_ni_de_fragmentos(tmp_path: Path) -> None:
    main(
        ["--config", str(CONFIG), "--suite", "all", "--salida", str(tmp_path)],
        reloj=RelojFijo(),
    )

    contenido = next(tmp_path.glob("*.json")).read_text(encoding="utf-8")
    preguntas = yaml.safe_load((FIXTURE / "preguntas.yaml").read_text(encoding="utf-8"))[
        "preguntas"
    ]
    assert not any(p["pregunta"] in contenido for p in preguntas)
    assert EstrategiaDeFusion.rrf.value in contenido
