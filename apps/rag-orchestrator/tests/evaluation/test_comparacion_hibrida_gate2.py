"""Gate 2 de L1D-245, vuelta 1: hallazgos P1-1, P1-2, P2-3, P2-4 y menores 5 y 7 de ``design-principles-reviewer``."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.application.ports import FalloDeInferencia, SinTerminosLexicos
from app.config.settings import Settings
from app.domain.fusion_de_candidatos import EstrategiaDeFusion
from app.evaluation.adaptadores_falsos import (
    BuscadorSparseEnMemoria,
    CodificadorSparseLexico,
    EmbedderBolsaDePalabras,
    NliLexico,
    RerankerLexico,
)
from app.evaluation.armado_comparacion import armar_comparacion, exigir_trazabilidad_coherente
from app.evaluation.brazos_recuperacion import Brazo, MetricasDeBrazo, marcar_retroceso
from app.evaluation.composicion_suite import componer_servicio, parametros_de_recuperacion
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida_brazos import ResultadoDeBrazo
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.evaluate import _medir_comparacion, main
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.llamadas import RegistroDeLlamadas
from app.evaluation.modelos_locales import OrigenLocal
from app.infrastructure.language.detector_local import DetectorDeIdiomaLocal
from app.infrastructure.models.local import ModelosDeRecuperacion
from app.schemas.generated.models import Fusion, RetrievalMode
from tests.evaluation.test_comparacion_hibrida_aceptacion import (
    CONFIG,
    CORPUS_DE_REGRESION,
    FIXTURE,
    PREGUNTA_DE_REGRESION,
    config_con,
    dataset_de_prueba,
    escribir_particion,
)
from tests.evaluation.test_comparacion_hibrida_unitarios import PARTICION_FAKE, _meta_de_ejemplo
from tests.evaluation.test_proveedor_local_aceptacion import (
    COMPLETIONS,
    EmbedderDePasajesFalso,
    respuesta_del_generador,
)
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos


def brazo_con_traza_de_dense(tmp_path: Path) -> ResultadoDeBrazo:
    config = cargar_config_suite(CONFIG)
    assert config.comparacion is not None
    dataset = FuenteDatasetEnDirectorio(FIXTURE).cargar()
    servicio = componer_servicio(config, dataset, Cronometro(RelojSimulado()), RelojFijo())
    meta = _meta_de_ejemplo(RetrievalMode.dense, Fusion.ninguna, 0)
    return ResultadoDeBrazo(config.comparacion.brazos[1], servicio, [], [meta], 0)


def test_la_traza_de_otro_brazo_se_exige_aparte_y_arma_comparacion_no_decide_en_silencio(
    tmp_path: Path,
) -> None:
    brazo = brazo_con_traza_de_dense(tmp_path)

    with pytest.raises(SuiteAbortada, match="A2"):
        exigir_trazabilidad_coherente(brazo)


def test_armar_la_comparacion_con_una_traza_incoherente_aborta_antes_de_devolver_datos(
    tmp_path: Path,
) -> None:
    config = cargar_config_suite(CONFIG)
    assert config.comparacion is not None
    incoherente = brazo_con_traza_de_dense(tmp_path)
    referencia = ResultadoDeBrazo(
        config.comparacion.brazos[0], incoherente.servicio, [], [incoherente.metas[0]], 0
    )

    with pytest.raises(SuiteAbortada):
        armar_comparacion(config, config.comparacion, [referencia, incoherente])


def test_la_medicion_de_la_comparacion_expone_el_retroceso_sin_leer_el_reporte(
    tmp_path: Path,
) -> None:
    dataset = dataset_de_prueba(tmp_path / "ds", [PREGUNTA_DE_REGRESION], CORPUS_DE_REGRESION)
    particion = escribir_particion(
        tmp_path / "part", dataset / "preguntas.yaml", {"desarrollo": ["RG-01"]}
    )
    brazos = [
        {"nombre": "A0", "RETRIEVAL_MODE": "dense"},
        {
            "nombre": "A2b",
            "RETRIEVAL_MODE": "hibrida",
            "RETRIEVAL_FUSION": "ponderada",
            "HYBRID_SPARSE_WEIGHT": 0.9,
        },
    ]
    config = cargar_config_suite(
        config_con(
            tmp_path,
            dataset,
            particion,
            **{"umbrales.retrieval_top_k": 1, "comparacion.brazos": brazos},
        )
    )
    cargado = FuenteDatasetEnDirectorio(dataset, frozenset({"RG-01"})).cargar()

    medido = _medir_comparacion(
        config, cargado, RelojFijo(), RegistroDeLlamadas(), OrigenLocal({}, None, lambda: 0.0)
    )

    assert getattr(medido, "retroceso", None) is True


def modelos_con_codificador(codificador: Any) -> Any:
    def cargador(_: Settings) -> ModelosDeRecuperacion:
        return ModelosDeRecuperacion(
            detector_idioma=DetectorDeIdiomaLocal("es"),
            embedder_consulta=EmbedderBolsaDePalabras(),
            embedder_pasajes=EmbedderDePasajesFalso(),
            reranker=RerankerLexico(),
            clasificador_nli=NliLexico(),
            embedder_sparse_consulta=codificador,
        )

    return cargador


class CodificadorRoto:
    """Un codificador sparse que falla por inferencia, no por falta de términos."""

    def embeber_sparse(self, texto: str) -> dict[int, float]:
        raise FalloDeInferencia("sparse: fallo de inferencia")


def correr_local_con(tmp_path: Path, codificador: Any) -> int:
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
    with respx.mock(assert_all_called=False) as http:
        http.route(url=COMPLETIONS).mock(return_value=respuesta_del_generador())
        http.route().mock(return_value=httpx.Response(404))
        return main(
            ["--config", str(config), "--suite", "all", "--salida", str(tmp_path / "salida")],
            reloj=RelojFijo(),
            entorno=entorno,
            cargador_de_modelos=modelos_con_codificador(codificador),
            lector_rss=lambda: 100.0,
        )


def test_un_codificador_sparse_roto_aborta_la_corrida_y_no_cuenta_preguntas_sin_terminos(
    tmp_path: Path,
) -> None:
    codigo = correr_local_con(tmp_path, CodificadorRoto())

    assert codigo == 1
    assert not (tmp_path / "salida").exists()


def test_el_codificador_falso_lanza_sin_terminos_lexicos_y_no_un_fallo_generico() -> None:
    with pytest.raises(SinTerminosLexicos):
        CodificadorSparseLexico().embeber_sparse("¿qué es eso?")


def test_la_busqueda_sparse_falsa_rechaza_un_vector_vacio_igual_que_la_real() -> None:
    dataset = FuenteDatasetEnDirectorio(FIXTURE).cargar()
    codificador = CodificadorSparseLexico()
    buscador = BuscadorSparseEnMemoria(
        dataset, [codificador.vector_de(c.texto) for c in dataset.chunks]
    )

    with pytest.raises(ValueError):
        buscador.search_sparse({}, 5)


def test_una_caida_igual_a_la_tolerancia_con_decimales_no_es_retroceso() -> None:
    diferencia = MetricasDeBrazo(0.60 - 0.65, 0.0, 0.0)

    assert marcar_retroceso(diferencia, 0.05) is False


def test_un_parametro_de_fusion_en_cero_se_respeta_y_no_se_sustituye_por_el_valor_inicial() -> None:
    config = cargar_config_suite(CONFIG)
    brazo = Brazo("X", RetrievalMode.hibrida, EstrategiaDeFusion.ponderada, peso_sparse=0.0)

    parametros = parametros_de_recuperacion(config, (), brazo)

    assert parametros.peso_sparse == 0.0
    assert asyncio.iscoroutinefunction(main) is False
