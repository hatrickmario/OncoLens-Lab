"""Extracción de la población del estudio en abanico (US-242, ADR-47): aceptación de AC-1…AC-9 sobre FX-06c-c.

Integración: el ``IngestionPipelineService`` real con el ``PopulationFanoutExtractor`` real, sobre memoria y, donde existe
el Compose de test, PostgreSQL ``corpus`` y Milvus reales. Se fingen solo los bordes (LLM, NLI, recuperador, embeddings).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import pytest

from app.domain.corpus_metadata.campos import LONGITUD_MAXIMA_DE_VALOR

from tests.integration.corpus_ingestion.conftest import Montaje
from tests.integration.corpus_ingestion.montaje_poblacion import (
    CONFIGURACION_DE_TEST,
    MontajeDePoblacion,
    montar_poblacion,
)
from tests.support.poblacion_abanico import (
    CRITERIO_QUE_SE_CORTA,
    CRITERIOS_DE_MAMA,
    FRAGMENTOS_POR_DOCUMENTO,
    TOP_K_DE_TEST,
    VERSION_DE_CATALOGO_DE_TEST,
    VERSION_DEL_MODELO_DE_TEST,
    VERSION_DEL_PROMPT_DE_TEST,
    VALOR_PROHIBIDO,
    FakePopulationLlm,
    RecuperadorFalsoPorDocumento,
    documentos_e,
)
from tests.support.poblacion_lista import poblacion_guardada
from tests.support.semilla import DIRECTORIO_DE_FIXTURES


@pytest.fixture
def montar(fabrica_de_montaje: Callable[[Path], Montaje]) -> Callable[..., MontajeDePoblacion]:
    def _montar(llm: FakePopulationLlm | None = None, **kwargs: object) -> MontajeDePoblacion:
        return montar_poblacion(fabrica_de_montaje(DIRECTORIO_DE_FIXTURES), llm, **kwargs)  # type: ignore[arg-type]

    return _montar


def _procedencia(nli: str = "entailment") -> dict[str, str]:
    return {
        "promptVersion": VERSION_DEL_PROMPT_DE_TEST,
        "modelVersion": VERSION_DEL_MODELO_DE_TEST,
        "catalogVersion": VERSION_DE_CATALOGO_DE_TEST,
        "nliResult": nli,
    }


@pytest.mark.ac("US-242", 1)
def test_ingesta_doce_e1_seis_llamadas_valores_con_fragmento(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-1] Seis llamadas por documento (una por criterio) y los valores se guardan con su fragmento y su procedencia."""
    montaje = montar()

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    assert montaje.llm.invocaciones == len(CRITERIOS_DE_MAMA) == 6
    assert sorted(c.criterio for c in montaje.llm.llamadas) == sorted(CRITERIOS_DE_MAMA)
    ids_de_doc_e1 = {f.chunk_id for f in FRAGMENTOS_POR_DOCUMENTO["doc-e1"]}
    assert all(
        0 < len(c.chunk_ids) <= TOP_K_DE_TEST and set(c.chunk_ids) <= ids_de_doc_e1
        for c in montaje.llm.llamadas
    )
    poblacion = montaje.poblacion_de("doc-e1")
    assert poblacion.metadata_source == "extraido_verificado"
    assert poblacion.population_criteria["estado_menopausico"] == [
        {
            "value": valor,
            "chunkId": "ch-e1-1",
            "scope": "elegibilidad",
            **_procedencia(),
        }
        for valor in ("premenopausal women", "postmenopausal women")
    ]


@pytest.mark.ac("US-242", 2)
def test_ingesta_relleno_y_fragmento_ajeno_dejan_lista_vacia_y_se_cuentan(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-2] El relleno y el fragmento ajeno dejan el criterio vacío y suman a ``valoresRechazados`` por motivo."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-RELLENO", "EXT-AJENO")))

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["ecog"] == []
    assert criterios["estadio"] == []
    assert criterios["biomarcadores.her2"] == []
    assert len(criterios["estado_menopausico"]) == 2
    contadores = reporte.contadores_de_poblacion
    assert contadores.valores_rechazados == 3
    assert (
        contadores.valores_rechazados_por_relleno,
        contadores.valores_rechazados_por_chunk_ajeno,
    ) == (2, 1)
    resumen = reporte.como_diccionario()["poblacion"]
    assert resumen["valoresRechazados"] == 3
    assert resumen["valoresRechazadosPorMotivo"] == {"relleno": 2, "chunk_ajeno": 1}


@pytest.mark.ac("US-242", 4)
def test_ingesta_duplicados_con_distinta_capitalizacion_quedan_en_un_valor(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-4] Dos valores que solo difieren en la capitalización se guardan una vez, el primero y de su fragmento."""
    montaje = montar(FakePopulationLlm(("EXT-DUP",)))

    montaje.ingerir("doc-e1")

    guardados = montaje.poblacion_de("doc-e1").population_criteria["estado_menopausico"]
    assert [(v["value"], v["chunkId"]) for v in guardados] == [("postmenopausal women", "ch-e1-1")]


def test_ingesta_une_los_sinonimos_del_catalogo_en_un_solo_valor(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 D4] Dos formas que el catálogo declara sinónimas (RN-27) se guardan una vez, la de mayor alcance."""
    sinonimos = {
        "postmenopausal women": "postmenopausal women",
        "post menopausal": "postmenopausal women",
    }
    montaje = montar(FakePopulationLlm(("EXT-SINONIMO",)), sinonimos=sinonimos)

    montaje.ingerir("doc-e1")

    guardados = montaje.poblacion_de("doc-e1").population_criteria["estado_menopausico"]
    assert [v["value"] for v in guardados] == ["postmenopausal women"]


@pytest.mark.ac("US-242", 5)
def test_ingesta_cuatro_valores_de_un_fragmento_se_reducen_a_tres_y_marca_truncado(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-5] El tope por fragmento y criterio deja 3 valores (elegibilidad primero) y registra el recorte."""
    montaje = montar(FakePopulationLlm(("EXT-CUATRO",)))

    reporte = montaje.ingerir("doc-e1")

    guardados = montaje.poblacion_de("doc-e1").population_criteria["linea"]
    assert [(v["value"], v["scope"]) for v in guardados] == [
        ("first line", "elegibilidad"),
        ("second line", "elegibilidad"),
        ("adjuvant setting", "mencion"),
    ]
    contadores = reporte.contadores_de_poblacion
    assert (contadores.truncado, contadores.valores_fuera_del_tope) == (True, 1)
    resumen = reporte.como_diccionario()["poblacion"]
    assert (resumen["truncado"], resumen["valoresFueraDelTope"]) == (True, 1)


@pytest.mark.ac("US-242", 6)
def test_ingesta_salida_cortada_se_reintenta_una_vez_con_otra_semilla_y_guarda_los_valores(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-6] Con ``finish_reason = length`` el criterio hace exactamente 2 llamadas, la segunda con otra semilla."""
    montaje = montar(FakePopulationLlm(("EXT-OK",), cortes={CRITERIO_QUE_SE_CORTA: 1}))

    reporte = montaje.ingerir("doc-e1")

    llamadas = montaje.llm.llamadas_de(CRITERIO_QUE_SE_CORTA)
    assert len(llamadas) == 2
    assert llamadas[0].semilla != llamadas[1].semilla
    assert len(montaje.poblacion_de("doc-e1").population_criteria["estado_menopausico"]) == 2
    assert reporte.contadores_de_poblacion.finish_reason_length == 1
    assert reporte.contadores_de_poblacion.criterios_pendientes == 0


@pytest.mark.ac("US-242", 6)
def test_ingesta_dos_cortes_dejan_el_criterio_pendiente_sin_bloquear_el_documento(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-6] Si el reintento también se corta, el criterio queda ``pendiente``, los demás se guardan y el documento
    queda ``embebido``."""
    montaje = montar(FakePopulationLlm(("EXT-OK",), cortes={CRITERIO_QUE_SE_CORTA: 2}))

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["estado_menopausico"] == {"status": "pendiente", "values": []}
    assert len(criterios["biomarcadores.her2"]) == 1
    assert len(montaje.llm.llamadas_de(CRITERIO_QUE_SE_CORTA)) == 2
    assert reporte.contadores_de_poblacion.finish_reason_length == 2
    assert reporte.como_diccionario()["poblacion"]["finishReasonLength"] == 2
    assert reporte.contadores_de_poblacion.criterios_pendientes == 1


@pytest.mark.ac("US-242", 7)
def test_ingesta_misma_version_cero_llamadas_y_otra_version_seis(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-7] Reingerir con las mismas versiones no llama al extractor; cambiar el prompt reextrae los 6 criterios."""
    montaje = montar()
    montaje.ingerir("doc-e1")
    llamadas_iniciales = montaje.llm.invocaciones

    montaje.ingerir("doc-e1")

    assert montaje.llm.invocaciones == llamadas_iniciales
    escrituras = getattr(montaje.base.catalogo, "escrituras_de_poblacion", 0)
    assert escrituras == 0  # mismas versiones: ni llamadas ni UPDATE de población

    otra_version = montaje.con_configuracion(version_del_prompt="poblacion_v2")
    otra_version.ingerir("doc-e1")

    assert montaje.llm.invocaciones == llamadas_iniciales + 6
    guardado = montaje.poblacion_de("doc-e1").population_criteria["estado_menopausico"]
    assert {v["promptVersion"] for v in guardado} == {"poblacion_v2"}
    campos = montaje.poblacion_de("doc-e1").extracted_fields
    assert {
        "estado_menopausico",
        "biomarcadores.her2",
        "biomarcadores.receptores_hormonales",
    } <= set(campos)


@pytest.mark.ac("US-242", 8)
def test_ingesta_doce_llamadas_nunca_mas_de_dos_simultaneas_y_ninguna_mezcla_documentos(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-8] Con concurrencia 2, dos documentos hacen 12 llamadas, de a dos como máximo, y cada una lleva fragmentos
    de una sola fuente."""
    montaje = montar(configuracion=replace(CONFIGURACION_DE_TEST, concurrencia=2))

    montaje.ingerir("doc-e1", "doc-e2")

    assert montaje.llm.invocaciones == 12
    assert montaje.llm.maximo_simultaneo == 2
    fuentes = {f.chunk_id: clave for clave, fs in FRAGMENTOS_POR_DOCUMENTO.items() for f in fs}
    assert all(
        len({fuentes[c] for c in llamada.chunk_ids}) == 1 for llamada in montaje.llm.llamadas
    )
    assert {fuentes[c] for ll in montaje.llm.llamadas for c in ll.chunk_ids} == {"doc-e1", "doc-e2"}


@pytest.mark.ac("US-242", 3)
def test_ingesta_valor_sin_soporte_nli_no_se_guarda_y_se_cuenta(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-3] Un valor que el NLI no confirma contra su fragmento no se guarda y suma a ``valoresSinSoporte``."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-NLI")))

    reporte = montaje.ingerir("doc-e1")

    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["estadio"] == []
    assert len(criterios["estado_menopausico"]) == 2
    assert reporte.contadores_de_poblacion.valores_sin_soporte == 1
    assert reporte.como_diccionario()["poblacion"]["valoresSinSoporte"] == 1


@pytest.mark.ac("US-242", 9)
def test_ingesta_omite_y_cuenta_el_valor_con_termino_prohibido_y_conserva_los_demas(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 AC-9] Un valor con término prohibido (RN-23) en un fragmento citado se omite y se cuenta; nunca se sustituye."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-PROHIBIDO")))

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["ecog"] == []
    assert len(criterios["estado_menopausico"]) == 2
    assert len(criterios["biomarcadores.her2"]) == 1
    assert reporte.contadores_de_poblacion.valores_con_lenguaje_prescriptivo == 1
    assert reporte.como_diccionario()["poblacion"]["valoresConLenguajePrescriptivo"] == 1
    assert VALOR_PROHIBIDO not in str(criterios)
    assert VALOR_PROHIBIDO not in "".join(p.hipotesis for p in montaje.nli.pares)


def test_ingesta_recorta_o_descarta_un_valor_de_201_caracteres_y_cuenta_el_descarte(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 D12] Un ``value`` de más de 200 caracteres nunca se guarda (``maxLength`` del contrato) y suma al descarte."""
    montaje = montar(FakePopulationLlm(("EXT-OK", "EXT-LARGO")))

    reporte = montaje.ingerir("doc-e1")

    assert reporte.resultado_de("doc-e1").estado.value == "embebido"
    criterios = montaje.poblacion_de("doc-e1").population_criteria
    assert criterios["ecog"] == []
    assert reporte.contadores_de_poblacion.valores_descartados_por_longitud == 1
    assert all(
        len(v["value"]) <= LONGITUD_MAXIMA_DE_VALOR
        for lista in criterios.values()
        if isinstance(lista, list)
        for v in lista
    )


def test_ingesta_escribe_population_form_coherente_con_la_forma_de_cada_fila(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 D10] ``population_form`` es ``lista`` y el lector de US-241 lee todos los criterios sin forma inválida."""
    montaje = montar(FakePopulationLlm(("EXT-OK",), cortes={CRITERIO_QUE_SE_CORTA: 2}))

    montaje.ingerir("doc-e1")

    poblacion = montaje.poblacion_de("doc-e1")
    assert poblacion.population_form == "lista"
    leida = poblacion_guardada("extraido_verificado", poblacion.population_criteria)
    assert all(c.invalidez is None for c in leida.criterios.values())
    assert leida.criterios["estado_menopausico"].pendiente is True
    assert len(leida.criterios["estado_menopausico"].valores) == 0
    assert len(leida.criterios["biomarcadores.her2"].valores) == 1


def test_ingesta_nunca_emite_values_sin_status_ni_cadenas_de_la_forma_antigua(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 D11] Cada criterio guardado es una lista o exactamente la marca ``pendiente``; nunca ``{values}`` sin ``status``."""
    montaje = montar(FakePopulationLlm(("EXT-OK",), cortes={CRITERIO_QUE_SE_CORTA: 2}))

    montaje.ingerir("doc-e1")

    for clave, contenido in montaje.poblacion_de("doc-e1").population_criteria.items():
        if isinstance(contenido, dict):
            assert contenido == {"status": "pendiente", "values": []}, clave
        else:
            assert isinstance(contenido, list), clave


def test_ingesta_rechazada_por_licencia_no_invoca_al_extractor(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[RN-21] Una fuente con licencia que no se acepta se rechaza antes de extraer: 0 llamadas."""
    montaje = montar()
    sin_derivadas = replace(
        documentos_e()["doc-e1"],
        document_key="doc-nd",
        version_group_id="doc-nd",
        license="CC BY-ND 4.0",
        license_url="https://creativecommons.org/licenses/by-nd/4.0/",
    )

    reporte = montaje.ingerir_documentos(sin_derivadas)

    assert reporte.resultado_de("doc-nd").estado.value == "rechazado_licencia"
    assert montaje.llm.invocaciones == 0


def test_ingesta_no_registra_en_los_logs_prompt_salida_fragmentos_ni_valores(
    montar: Callable[..., MontajeDePoblacion], caplog: pytest.LogCaptureFixture
) -> None:
    """[RN-14] Los logs llevan criterio, ``chunkId``, ``finish_reason`` y longitudes; nunca el prompt, la salida del LLM, el
    texto de los fragmentos ni los valores."""
    montaje = montar(
        FakePopulationLlm(("EXT-OK", "EXT-PROHIBIDO"), cortes={CRITERIO_QUE_SE_CORTA: 2})
    )

    with caplog.at_level(logging.DEBUG):
        montaje.ingerir("doc-e1")

    registro = "\n".join(r.getMessage() for r in caplog.records)
    assert "finish_reason=length" in registro and "estado_menopausico" in registro
    assert "ch-e1-1" in registro
    secretos = [
        *montaje.llm.prompts,
        *montaje.llm.salidas,
        *(f.texto for f in FRAGMENTOS_POR_DOCUMENTO["doc-e1"]),
        "premenopausal women",
        "postmenopausal women",
        "HER2-positive",
        "triple-negative",
        VALOR_PROHIBIDO,
        "Eres un extractor",
    ]
    assert not [s for s in secretos if s in registro]


def test_ingesta_criterio_sin_fragmentos_relevantes_queda_vacio_sin_llamar_al_llm(
    montar: Callable[..., MontajeDePoblacion],
) -> None:
    """[US-242 D3] Si ningún fragmento es relevante para un criterio no hay llamada al LLM y el criterio queda vacío."""
    montaje = montar(recuperador=RecuperadorFalsoPorDocumento(frozenset({"ecog"})))

    montaje.ingerir("doc-e1")

    assert montaje.llm.llamadas_de("ecog") == []
    assert montaje.llm.invocaciones == 5
    assert montaje.poblacion_de("doc-e1").population_criteria["ecog"] == []
