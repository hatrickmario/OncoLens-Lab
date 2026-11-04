"""La salida inválida del LLM es un caso fallido contabilizado, no el fin de la suite (D5-06, D5-28; US-245 AC-1).

Antes, una ``LlmSalidaInvalidaError`` en una pregunta abortaba TODA la corrida de ``evaluate`` con código 1 y sin
reporte: con el LLM local real (``principal_duplicada``) las nocturnas D5-06 y D5-28 no producían ninguna cifra. Ahora la
pregunta cuenta como fallida, con su id y el id de la regla (nunca el texto, RN-14), y el código de salida lo refleja.
El generador es el adapter REAL de Ollama ``/v1`` contra un servidor fingido con ``respx``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import respx
import yaml

from app.application.errores import LlmSalidaInvalidaError
from app.evaluation.corrida_opciones import MedicionDeOpciones, PuertosDeOpciones
from app.evaluation.evaluate import main
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.retrieval_metrics import ResultadoPregunta
from tests.evaluation.conftest import RAIZ_REPO
from tests.evaluation.test_fidelidad_juez import veredicto
from tests.evaluation.test_opciones_aceptacion import analisis, consulta, correr, opcion
from tests.evaluation.test_proveedor_local_aceptacion import (
    COMPLETIONS,
    config_local,
    modelos_fingidos,
)
from tests.support.fakes import RelojFijo
from tests.support.modelos import crear_entorno_de_modelos

SIN_PRINCIPAL = {
    "options": [
        {
            "option": "Opción de prueba",
            "claims": [{"text": "Texto de prueba.", "role": "secundaria", "citations": ["C1"]}],
        }
    ]
}


def _preguntas_de_fx_t5a_a() -> list[str]:
    ruta = RAIZ_REPO / "data" / "eval" / "fx-t5a-a" / "preguntas.yaml"
    return [p["pregunta"] for p in yaml.safe_load(ruta.read_text("utf-8"))["preguntas"]]


@pytest.mark.ac("D5-06", 1)
def test_evaluate_all_termina_con_5_y_cuenta_cada_pregunta_con_su_regla_sin_texto_cuando_el_llm_devuelve_salida_invalida(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    entorno = crear_entorno_de_modelos(tmp_path / "pesos").variables
    salida = tmp_path / "salida"

    with respx.mock(assert_all_called=False) as http:
        http.post(COMPLETIONS).mock(return_value=veredicto(json.dumps(SIN_PRINCIPAL)))
        codigo = main(
            ["--config", str(config_local(tmp_path)), "--suite", "all", "--salida", str(salida)],
            reloj=RelojFijo(),
            entorno=entorno,
            cargador_de_modelos=modelos_fingidos,
            lector_rss=lambda: 100.0,
        )
        generaciones = len(http.calls)

    archivos = list(salida.glob("*.json"))
    assert codigo == 5 and len(archivos) == 1  # la suite terminó y escribió su reporte
    reporte = json.loads(archivos[0].read_text(encoding="utf-8"))
    invalidas = reporte["salidas_invalidas"]
    assert invalidas["casos"] == generaciones >= 2  # ninguna pregunta se perdió tras la primera
    assert all(p["reglas"] == ["principal_ausente"] for p in invalidas["preguntas"])
    assert len(invalidas["preguntas"]) == invalidas["casos"]
    error = capsys.readouterr().err
    assert invalidas["preguntas"][0]["pregunta"] in error and "principal_ausente" in error
    for texto in _preguntas_de_fx_t5a_a():  # solo ids de pregunta y de regla (RN-14)
        assert texto not in error and texto not in json.dumps(reporte, ensure_ascii=False)


def _resultado_invalido(caso: str) -> ResultadoConsulta:
    base = ResultadoPregunta(caso, "cualquiera", "es", True, False, "mama", "", (), 0.0, 0.0, None)
    return ResultadoConsulta(
        recuperacion=base,
        revisada=False,
        esperaba_sin_evidencia=False,
        sin_evidencia=False,
        generador_invocado=True,
        top_relevance_score=None,
        citas_propuestas=0,
        citas_validas=0,
        opciones_mostradas=0,
        opciones_descartadas=0,
        salida_invalida=("principal_duplicada",),
    )


@pytest.mark.ac("D5-28", 1)
def test_opciones_termina_con_5_y_reporta_el_caso_y_la_regla_cuando_un_analisis_tiene_salida_invalida(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    medida = MedicionDeOpciones(
        (analisis("OP-03"), analisis("OP-04", opcion("o1"))),
        (consulta(), _resultado_invalido("OP-03")),
        "test-lista",
    )

    codigo, reporte = correr(
        tmp_path, puertos=PuertosDeOpciones(medidor=lambda config, dataset: medida)
    )

    assert codigo == 5 and reporte is not None
    assert reporte["salidas_invalidas"] == {
        "casos": 1,
        "preguntas": [{"pregunta": "OP-03", "reglas": ["principal_duplicada"]}],
    }
    assert "OP-03" in capsys.readouterr().err


def test_la_salida_invalida_del_llm_lleva_el_id_de_cada_regla_que_incumple() -> None:
    error = LlmSalidaInvalidaError(("principal_duplicada",))

    assert error.reglas == ("principal_duplicada",)
    assert LlmSalidaInvalidaError().reglas == ()
