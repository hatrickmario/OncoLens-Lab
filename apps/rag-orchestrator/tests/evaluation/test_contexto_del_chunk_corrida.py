"""La corrida de los brazos de contexto del chunk (US-279 AC-5, l1d-337 tarea 2.2): colección por brazo, población y configuración."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest

from app.domain.corpus_seed.contexto_del_chunk import VarianteDeContexto
from app.evaluation.armado_comparacion import _diferencia_pareada_del_brazo
from app.evaluation.brazos_contexto import regla_de_adopcion
from app.evaluation.brazos_recuperacion import Brazo
from app.evaluation.config_suite import ConfigInvalida, cargar_config_suite
from app.evaluation.corrida_brazos import (
    IndiceEnMemoriaDelBrazo,
    ResultadoDeBrazo,
    exigir_brazo_sin_poblacion,
    exigir_coleccion_del_brazo,
)
from app.evaluation.cronometro import Cronometro, RelojSimulado
from app.evaluation.guardas import SuiteAbortada
from app.evaluation.indice_del_corpus import IndiceDelCorpus, ResumenDelIndice
from app.schemas.generated.models import (
    RagQueryInternalResponse,
    RetrievalMode,
    SourceApplicability,
)
from tests.evaluation.conftest import RAIZ_APP

CONFIGS = RAIZ_APP / "eval" / "configs"
ENTORNO = {"STACK_MEMORY_LIMIT_GB": "30"}


def _brazo(variante: VarianteDeContexto, **cambios: Any) -> Brazo:
    return Brazo(
        f"A0-{variante.value}", RetrievalMode.dense, variante_de_contexto=variante, **cambios
    )


def _indice(coleccion: str) -> IndiceDelCorpus:
    return IndiceDelCorpus(
        puertos=None,  # type: ignore[arg-type]
        resumen=ResumenDelIndice(coleccion, 10, "a" * 64),
    )


@pytest.mark.parametrize(
    ("variante", "coleccion"),
    [
        (VarianteDeContexto.NINGUNO, "corpus_chunks"),
        (VarianteDeContexto.DETERMINISTA, "corpus_chunks__ctx_determinista_v1"),
        (VarianteDeContexto.LLM, "corpus_chunks__ctx_llm_v1"),
    ],
)
def test_un_brazo_que_lee_la_coleccion_de_su_variante_pasa(
    variante: VarianteDeContexto, coleccion: str
) -> None:
    exigir_coleccion_del_brazo(_brazo(variante), _indice(coleccion))


@pytest.mark.parametrize(
    ("variante", "coleccion"),
    [
        (VarianteDeContexto.DETERMINISTA, "corpus_chunks"),
        (VarianteDeContexto.LLM, "corpus_chunks__ctx_determinista_v1"),
        (VarianteDeContexto.NINGUNO, "corpus_chunks__ctx_llm_v1"),
    ],
)
def test_un_brazo_que_apunta_a_la_coleccion_de_otra_variante_aborta_nombrando_las_dos_variables(
    variante: VarianteDeContexto, coleccion: str
) -> None:
    with pytest.raises(SuiteAbortada) as error:
        exigir_coleccion_del_brazo(_brazo(variante), _indice(coleccion))

    assert "CORPUS_CHUNK_CONTEXT" in str(error.value)
    assert "MILVUS_COLLECTION_NAME" in str(error.value)


def test_un_brazo_sin_variante_o_sin_indice_no_se_somete_a_la_guarda_de_coleccion() -> None:
    exigir_coleccion_del_brazo(Brazo("A1", RetrievalMode.dense), _indice("cualquiera"))
    exigir_coleccion_del_brazo(_brazo(VarianteDeContexto.LLM), None)


def _respuesta_con_criterios() -> RagQueryInternalResponse:
    fuente = SourceApplicability.model_construct(externalId="fuente-1", criteria=[object()])
    return RagQueryInternalResponse.model_construct(applicability=[fuente])


def test_un_brazo_de_contexto_con_coleccion_propia_si_consume_la_poblacion_porque_los_chunk_id_no_cambian() -> (
    None
):
    brazo = _brazo(VarianteDeContexto.DETERMINISTA, coleccion="corpus_chunks__ctx_determinista_v1")

    exigir_brazo_sin_poblacion(brazo, _respuesta_con_criterios())


def test_un_brazo_de_otra_coleccion_que_no_es_de_contexto_sigue_sin_consumir_la_poblacion() -> None:
    brazo = Brazo("A0-512", RetrievalMode.dense, coleccion="otra_coleccion")

    with pytest.raises(SuiteAbortada, match="población"):
        exigir_brazo_sin_poblacion(brazo, _respuesta_con_criterios())


def test_el_cronometro_mide_en_segundos_con_el_reloj_inyectado_sin_registrar_ninguna_etapa() -> (
    None
):
    cronometro = Cronometro(RelojSimulado())

    resultado, segundos = cronometro.cronometrar(lambda x: x * 2, 21)

    assert resultado == 42 and segundos == pytest.approx(0.001)
    assert all(p95 is None for p95 in cronometro.p95_ms().values())


def test_el_indice_en_memoria_del_brazo_guarda_costo_y_cobertura() -> None:
    indice = IndiceEnMemoriaDelBrazo(0.5, 100, 1, 2)

    assert (indice.construccion_s, indice.chunks) == (0.5, 100)
    assert (indice.respaldo_por_salida_invalida, indice.respaldo_por_llm_no_disponible) == (1, 2)


# --- la configuración ------------------------------------------------------------------------------------------------


def test_la_configuracion_fake_declara_los_tres_brazos_con_su_variante() -> None:
    config = cargar_config_suite(CONFIGS / "s7-contexto-fake.yaml", ENTORNO)

    brazos = config.comparacion.brazos  # type: ignore[union-attr]

    assert [b.nombre for b in brazos] == ["A0", "A0-determinista", "A0-llm"]
    assert [b.variante_de_contexto for b in brazos] == list(VarianteDeContexto)
    assert config.comparacion.viabilidad is not None  # type: ignore[union-attr]


def test_la_variante_del_brazo_entra_en_su_huella() -> None:
    a = Brazo("A0", RetrievalMode.dense, variante_de_contexto=VarianteDeContexto.NINGUNO)
    b = replace(a, variante_de_contexto=VarianteDeContexto.DETERMINISTA)

    assert a.huella() != b.huella()
    assert a.huella() != Brazo("A0", RetrievalMode.dense).huella()


def _config_con(tmp_path: Path, antes: str, despues: str) -> Path:
    contenido = (CONFIGS / "s7-contexto-fake.yaml").read_text(encoding="utf-8")
    assert antes in contenido
    ruta = tmp_path / "config.yaml"
    ruta.write_text(contenido.replace(antes, despues), encoding="utf-8")
    return ruta


def test_una_variante_fuera_del_conjunto_se_rechaza_nombrando_la_clave(tmp_path: Path) -> None:
    ruta = _config_con(tmp_path, "CORPUS_CHUNK_CONTEXT: llm", "CORPUS_CHUNK_CONTEXT: resumen")

    with pytest.raises(ConfigInvalida, match="CORPUS_CHUNK_CONTEXT"):
        cargar_config_suite(ruta, ENTORNO)


def test_una_referencia_que_no_es_ninguno_se_rechaza(tmp_path: Path) -> None:
    intercambiada = _config_con(
        tmp_path,
        "{nombre: A0, RETRIEVAL_MODE: dense, CORPUS_CHUNK_CONTEXT: ninguno}",
        "{nombre: A0, RETRIEVAL_MODE: dense, CORPUS_CHUNK_CONTEXT: llm}",
    )
    contenido = intercambiada.read_text(encoding="utf-8").replace(
        "{nombre: A0-llm, RETRIEVAL_MODE: dense, CORPUS_CHUNK_CONTEXT: llm}",
        "{nombre: A0-llm, RETRIEVAL_MODE: dense, CORPUS_CHUNK_CONTEXT: ninguno}",
    )
    ruta = tmp_path / "referencia-llm.yaml"
    ruta.write_text(contenido, encoding="utf-8")

    with pytest.raises(ConfigInvalida, match="ninguno"):
        cargar_config_suite(ruta, ENTORNO)


def test_un_brazo_sin_variante_cuando_otros_la_declaran_se_rechaza(tmp_path: Path) -> None:
    ruta = _config_con(
        tmp_path,
        "{nombre: A0-llm, RETRIEVAL_MODE: dense, CORPUS_CHUNK_CONTEXT: llm}",
        "{nombre: A0-llm, RETRIEVAL_MODE: dense}",
    )

    with pytest.raises(ConfigInvalida, match="todos los brazos"):
        cargar_config_suite(ruta, ENTORNO)


@pytest.mark.ac("US-279", 5)
def test_una_metrica_sin_preguntas_es_null_y_el_brazo_no_se_marca_como_cumple_la_regla() -> None:
    """[US-279 AC-5] Sin preguntas con respuesta que medir la diferencia es null (no 0.0) y la regla no marca ni cumple ni no cumple."""
    config = cargar_config_suite(CONFIGS / "s7-contexto-fake.yaml", ENTORNO)
    vacio = ResultadoDeBrazo(
        _brazo(VarianteDeContexto.DETERMINISTA),
        servicio=None,  # type: ignore[arg-type]
        resultados=[],
        metas=[],
        sin_terminos_lexicos=0,
    )

    diferencias = _diferencia_pareada_del_brazo(config, vacio, vacio)
    regla = regla_de_adopcion(
        inferior=diferencias["recall_at_10_total"].inferior, p95_consulta_s=1.0, tope_p95_s=20.0
    )

    assert diferencias["recall_at_10_total"].diferencia is None
    assert diferencias["mrr"].diferencia is None
    assert regla.mejora_fuera_del_ruido is None


def test_un_brazo_ninguno_con_otra_coleccion_consume_poblacion_con_ids_colisionados_y_aborta() -> (
    None
):
    brazo = Brazo(
        "A0-512",
        RetrievalMode.dense,
        variante_de_contexto=VarianteDeContexto.NINGUNO,
        coleccion="corpus_chunks_512",
    )

    with pytest.raises(SuiteAbortada, match="población"):
        exigir_brazo_sin_poblacion(brazo, _respuesta_con_criterios())


def test_la_marca_de_contexto_en_el_nombre_decide_si_la_coleccion_es_de_contexto() -> None:
    from app.domain.corpus_seed.coleccion_de_la_variante import es_coleccion_de_contexto

    assert es_coleccion_de_contexto("corpus_chunks__ctx_llm_v1")
    assert not es_coleccion_de_contexto("corpus_chunks_512")


def test_la_suite_declara_la_reescritura_esperada_del_brazo_al_construir_las_observaciones() -> (
    None
):
    from app.evaluation.composicion_suite import componer_servicio
    from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
    from tests.support.fakes import RelojFijo

    config = cargar_config_suite(CONFIGS / "s7-contexto-fake.yaml", ENTORNO)
    dataset = FuenteDatasetEnDirectorio(config.dataset).cargar()
    con = Brazo("A0", RetrievalMode.dense, query_rewrite_enabled=True)

    def observaciones(brazo: Brazo | None):  # type: ignore[no-untyped-def]
        return componer_servicio(
            config, dataset, Cronometro(RelojSimulado()), RelojFijo(), brazo=brazo
        ).observaciones

    assert observaciones(con).reescritura_esperada is True
    assert observaciones(replace(con, query_rewrite_enabled=False)).reescritura_esperada is False
    assert observaciones(None).reescritura_esperada is None
    assert isinstance(_brazo(VarianteDeContexto.LLM).variante_de_contexto, VarianteDeContexto)
