"""Privacidad en la suite `evaluate`: sensibilidad del detector de B1 y llamadas a la nube (US-072b, AC-6, RN-12, ADR-40).

El informe de los tests tiene la forma que escribe `npm run eval:pii` de clinical-api (``InformeDePii`` en
``medir-detector.ts``); sus cifras son de ejemplo del formato, no una medición.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from app.evaluation.evaluate import main
from app.evaluation.informe_pii import (
    InformePiiInvalido,
    ProveedorPiiDeArchivo,
    interpretar_informe_pii,
)
from app.evaluation.juez_fidelidad import JuezLlmLocal
from app.evaluation.llamadas import (
    LlamadaSaliente,
    RegistroDeLlamadas,
    llamadas_a_nube_con_datos_reales,
)
from tests.evaluation.conftest import RAIZ_APP
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"
NUBE = "https://api.nube-de-prueba.invalid/v1"
TIPOS = ("correo", "direccion", "documento", "fecha_nacimiento", "nombre", "telefono")


def sensibilidad(aciertos: int, total: int) -> dict[str, Any]:
    return {"aciertos": aciertos, "total": total, "valor": aciertos / total}


def modo(por_debajo: list[str]) -> dict[str, Any]:
    por_tipo = {tipo: sensibilidad(60, 60) for tipo in TIPOS} | {"nombre": sensibilidad(30, 120)}
    return {
        "sensibilidadDocumentos": {**por_tipo, "total": sensibilidad(390, 480)},
        "sensibilidadTodosLosContextos": {**por_tipo, "total": sensibilidad(390, 480)},
        "falsosPositivosClinicos": {"controles": 770, "marcados": 0, "tasa": 0.0},
        "latenciaP95Ms": 0.02,
        "latenciaP95MsPorCorrida": [0.02, 0.02, 0.02],
        "cumpleSensibilidadMinimaPorTipoDirecto": not por_debajo,
        "tiposDirectosPorDebajo": por_debajo,
    }


def escribir_informe(carpeta: Path, **cambios: Any) -> Path:
    informe: dict[str, Any] = {
        "detector": "opcion-a",
        "textos": 300,
        "parametros": {"coberturaMinima": 0.5, "sensibilidadMinima": 0.95, "corridas": 3},
        "notas": ["una nota con texto libre que el reporte no debe copiar"],
        "modos": {
            "solo_formatos": modo(["nombre", "total"]),
            "identidad_de_referencia": modo([]),
        },
    }
    informe.update(cambios)
    ruta = carpeta / "clinical-api-pii.json"
    ruta.write_text(json.dumps(informe), encoding="utf-8")
    return ruta


def correr(salida: Path, *extra: str, suite: str = "pii") -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(CONFIG), "--suite", suite, "--salida", str(salida), *extra],
        reloj=RelojFijo(),
        entorno={},
    )
    archivos = list(salida.glob("*.json")) if salida.exists() else []
    return codigo, json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None


@pytest.mark.ac("US-072", 6)
def test_evaluate_incluye_la_sensibilidad_de_pii_de_b1_y_cero_llamadas_a_la_nube_con_datos_reales(
    tmp_path: Path,
) -> None:
    informe = escribir_informe(tmp_path)

    codigo, reporte = correr(tmp_path / "salida", "--informe-pii", str(informe))

    assert codigo == 0 and reporte is not None
    privacidad = reporte["privacidad"]
    assert privacidad["llamadas_nube_datos_reales"] == 0
    assert privacidad["sensibilidad_b1_medida"] is True
    solo_formatos = privacidad["sensibilidad_b1"]["solo_formatos"]
    assert solo_formatos["por_tipo"]["nombre"] == {"aciertos": 30, "total": 120, "valor": 0.25}
    assert solo_formatos["por_tipo"]["correo"]["valor"] == 1.0
    assert solo_formatos["total"]["total"] == 480
    assert (solo_formatos["tipos_por_debajo"], solo_formatos["cumple_minimo"]) == (1, False)
    assert privacidad["sensibilidad_b1"]["identidad_de_referencia"]["cumple_minimo"] is True


def test_la_familia_pii_no_corre_las_consultas_y_no_trae_metricas_por_pregunta(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path / "salida")

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"] == {"completa": {}, "revisada": {}}
    assert reporte["suite"] == "pii"


def test_sin_informe_de_b1_la_sensibilidad_queda_sin_medir_y_no_en_cero(tmp_path: Path) -> None:
    codigo, reporte = correr(tmp_path / "salida", suite="all")

    assert codigo == 0 and reporte is not None
    privacidad = reporte["privacidad"]
    assert privacidad["sensibilidad_b1_medida"] is False
    assert "sensibilidad_b1" not in privacidad
    assert privacidad["textos_sembrados"] == 4


def test_el_reporte_de_privacidad_no_copia_las_notas_ni_los_textos_del_informe(
    tmp_path: Path,
) -> None:
    informe = escribir_informe(tmp_path)

    correr(tmp_path / "salida", "--informe-pii", str(informe))

    contenido = next((tmp_path / "salida").glob("*.json")).read_text(encoding="utf-8")
    assert "texto libre" not in contenido and "Ana Ejemplo" not in contenido


@pytest.mark.parametrize(
    "cambios",
    [
        {"modos": {"solo_formatos": modo([])}},
        {"modos": {"solo_formatos": modo([]), "identidad_de_referencia": {"otra": 1}}},
        {"textos": "trescientos"},
    ],
)
def test_un_informe_que_no_tiene_la_forma_de_eval_pii_termina_con_codigo_1_sin_resultados(
    tmp_path: Path, cambios: dict[str, Any], capsys: pytest.CaptureFixture[str]
) -> None:
    informe = escribir_informe(tmp_path, **cambios)

    codigo, reporte = correr(tmp_path / "salida", "--informe-pii", str(informe))

    assert (codigo, reporte) == (1, None)
    assert "trescientos" not in capsys.readouterr().err


def test_un_tipo_de_pii_fuera_del_vocabulario_se_rechaza_en_lugar_de_ignorarse(
    tmp_path: Path,
) -> None:
    tipos_nuevos = modo([])
    tipos_nuevos["sensibilidadDocumentos"]["pasaporte"] = sensibilidad(1, 2)
    informe = escribir_informe(
        tmp_path, modos={"solo_formatos": tipos_nuevos, "identidad_de_referencia": modo([])}
    )

    with pytest.raises(InformePiiInvalido):
        ProveedorPiiDeArchivo(informe).leer()


def test_un_informe_inexistente_se_rechaza_sin_nombrar_la_ruta(tmp_path: Path) -> None:
    with pytest.raises(InformePiiInvalido) as error:
        ProveedorPiiDeArchivo(tmp_path / "secreto.json").leer()

    assert "secreto" not in str(error.value)


def test_una_sensibilidad_sin_muestras_conserva_el_valor_none() -> None:
    medicion = {"aciertos": 0, "total": 0, "valor": None}
    informe = {
        "textos": 0,
        "modos": {
            m: {
                "sensibilidadDocumentos": {"nombre": medicion, "total": medicion},
                "tiposDirectosPorDebajo": [],
                "cumpleSensibilidadMinimaPorTipoDirecto": False,
            }
            for m in ("solo_formatos", "identidad_de_referencia")
        },
    }

    leido = interpretar_informe_pii(informe)

    assert leido.modos["solo_formatos"].por_tipo["nombre"].valor is None


def test_cuenta_las_llamadas_a_destinos_fuera_de_la_lista_local_con_datos_reales() -> None:
    llamadas = [
        LlamadaSaliente(NUBE, "real_anonimizado", ""),
        LlamadaSaliente(NUBE, "sintetico", ""),
        LlamadaSaliente("http://127.0.0.1:11434/v1", "real_anonimizado", ""),
        LlamadaSaliente("http://host.docker.internal:11434/v1", "real_identificado", ""),
        LlamadaSaliente("", "real_anonimizado", ""),
    ]

    assert llamadas_a_nube_con_datos_reales(llamadas) == 2


def test_el_juez_llm_registra_cada_llamada_con_su_destino_y_la_clase_de_datos() -> None:
    registro = RegistroDeLlamadas()
    with respx.mock() as http:
        http.post(f"{NUBE}/chat/completions").mock(
            return_value=httpx.Response(
                200, json={"choices": [{"message": {"content": "SOPORTADA"}}]}
            )
        )
        juez = JuezLlmLocal(
            httpx.AsyncClient(base_url=NUBE),
            modelo="juez@1",
            temperatura=0.0,
            semilla=1,
            registro=registro,
            clase_datos="real_anonimizado",
        )

        asyncio.run(juez.juzgar_soporte("a", ["p"]))

    assert llamadas_a_nube_con_datos_reales(registro.llamadas) == 1


def test_un_tipo_fuera_del_vocabulario_en_tipos_por_debajo_se_rechaza(tmp_path: Path) -> None:
    modo_roto = modo([])
    modo_roto["tiposDirectosPorDebajo"] = ["pasaporte"]
    informe = escribir_informe(
        tmp_path, modos={"solo_formatos": modo_roto, "identidad_de_referencia": modo([])}
    )

    with pytest.raises(InformePiiInvalido):
        ProveedorPiiDeArchivo(informe).leer()


def test_un_destino_local_con_un_modelo_de_nube_cuenta_como_llamada_a_la_nube() -> None:
    llamadas = [
        LlamadaSaliente("http://127.0.0.1:11434/v1", "real_anonimizado", "x:cloud"),
        LlamadaSaliente("http://127.0.0.1:11434/v1", "real_anonimizado", "gemma4:26b"),
    ]

    assert llamadas_a_nube_con_datos_reales(llamadas) == 1


def test_el_bloque_de_privacidad_distingue_cero_llamadas_de_ninguna_registrada(
    tmp_path: Path,
) -> None:
    _, reporte = correr(tmp_path / "salida", suite="all")

    assert reporte is not None
    assert reporte["privacidad"]["llamadas_salientes_registradas"] == 0


@pytest.mark.parametrize(
    "sensibilidad",
    [
        {"aciertos": 5, "total": 3, "valor": 1.0},
        {"aciertos": -1, "total": 3, "valor": 0.0},
        {"aciertos": 1, "total": 3, "valor": 1.5},
        {"aciertos": 1, "total": 3, "valor": float("nan")},
    ],
)
def test_una_sensibilidad_fuera_de_rango_se_rechaza(tmp_path: Path, sensibilidad: dict) -> None:
    roto = modo([])
    roto["sensibilidadDocumentos"]["correo"] = sensibilidad
    informe = escribir_informe(
        tmp_path, modos={"solo_formatos": roto, "identidad_de_referencia": modo([])}
    )

    with pytest.raises(InformePiiInvalido):
        ProveedorPiiDeArchivo(informe).leer()


def test_tipos_por_debajo_que_no_son_cadenas_se_rechazan(tmp_path: Path) -> None:
    roto = modo([])
    roto["tiposDirectosPorDebajo"] = [["nombre"], 3]
    informe = escribir_informe(
        tmp_path, modos={"solo_formatos": roto, "identidad_de_referencia": modo([])}
    )

    with pytest.raises(InformePiiInvalido):
        ProveedorPiiDeArchivo(informe).leer()


def test_la_llamada_con_un_modelo_de_nube_con_espacio_cuenta_como_llamada_a_la_nube() -> None:
    llamada = LlamadaSaliente("http://127.0.0.1:11434/v1", "real_anonimizado", "x:cloud ")

    assert llamadas_a_nube_con_datos_reales([llamada]) == 1


def test_el_modelo_es_obligatorio_en_la_llamada_y_en_el_registro() -> None:
    with pytest.raises(TypeError):
        LlamadaSaliente("http://127.0.0.1:1", "sintetico")  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        RegistroDeLlamadas().registrar("http://127.0.0.1:1", "sintetico")  # type: ignore[call-arg]
