"""Aceptación de la familia `opciones` de `evaluate` (US-140 AC-1…AC-6, M-10.1, M-10.2, M-07.2, RN-28).

Adapters falsos y reloj congelado. Las mediciones con una violación se construyen con tipos de dominio y entran por el
puerto ``PuertosDeOpciones`` (sin mocks de módulos propios); el retroceso y las metas usan la corrida real con una
configuración de test propia. Cada invariante tiene una variante que falla, para que la medición no sea decorativa.
"""

from __future__ import annotations

import json
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.corrida_opciones import MedicionDeOpciones, PuertosDeOpciones
from app.evaluation.evaluate import main
from app.evaluation.metricas.opciones_mostradas import AnalisisDeOpciones, OpcionMostrada
from app.evaluation.metricas.orden_opciones import OpcionOrdenable
from app.evaluation.metricas.resultado import ResultadoConsulta
from app.evaluation.retrieval_metrics import ResultadoPregunta
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "opciones-fake.yaml"
DATASET = RAIZ_REPO / "data" / "evaluation" / "opciones"
METRICAS = (
    "m_10_1",
    "m_10_2",
    "citas",
    "fidelidad",
    "opciones_por_analisis",
    "orden_rn28",
    "no_comparable",
    "esperadas_presentes",
)


def correr(
    salida: Path,
    *,
    config: Path = CONFIG,
    puertos: PuertosDeOpciones | None = None,
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(config), "--suite", "opciones", "--salida", str(salida)],
        reloj=RelojFijo(),
        puertos_opciones=puertos,
    )
    archivos = sorted(salida.glob("*.json"))
    reporte = json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None
    return codigo, reporte


def variante(tmp_path: Path, cambiar: Callable[[dict[str, Any], Path], None]) -> Path:
    """Copia editable del dataset y de la configuración que la apunta; devuelve la configuración."""
    dataset = tmp_path / "dataset"
    shutil.copytree(DATASET, dataset)
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    cambiar(crudo, dataset)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return ruta


def reporte_de_referencia(tmp_path: Path, fidelidad: float, precision: float) -> Path:
    ruta = tmp_path / "referencia.json"
    ruta.write_text(
        json.dumps(
            {
                "configuracion": {"dataset": {"nombre": "fx-t5a-a", "version": "1"}},
                "metricas": {
                    "completa": {
                        "fidelidad": {"nli": {"fidelidad": fidelidad}},
                        "citas": {"precision": precision},
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    return ruta


def opcion(
    identificador: str,
    *,
    excluyentes: int = 0,
    coincide: int = 2,
    no_comparable: bool = False,
    con_soporte: bool = True,
) -> OpcionMostrada:
    return OpcionMostrada(
        id=identificador,
        documentos=("doc-a1",),
        cita_a_chunk_entregado=True,
        soporte_nli=con_soporte,
        ordenable=OpcionOrdenable(identificador, excluyentes, coincide, 1.0, no_comparable),
    )


def analisis(
    caso: str,
    *opciones: OpcionMostrada,
    revisada: bool = False,
    espera_no_comparable: bool = False,
    nivel_a: tuple[tuple[str, str], ...] = (),
) -> AnalisisDeOpciones:
    return AnalisisDeOpciones(
        caso=caso,
        revisada=revisada,
        opciones=opciones,
        esperadas=("doc-a1",),
        espera_no_comparable=espera_no_comparable,
        campos_nivel_a=len(nivel_a),
        campos_nivel_b=0,
        campos_con_termino=nivel_a,
    )


def consulta(*, soportadas: int = 20, afirmaciones: int = 20) -> ResultadoConsulta:
    base = ResultadoPregunta("q", "cualquiera", "es", True, False, "mama", "", (), 1.0, 1.0, None)
    return ResultadoConsulta(
        recuperacion=base,
        revisada=False,
        esperaba_sin_evidencia=False,
        sin_evidencia=False,
        generador_invocado=True,
        top_relevance_score=0.9,
        citas_propuestas=20,
        citas_validas=20,
        opciones_mostradas=1,
        opciones_descartadas=0,
        afirmaciones_nli=(True,) * soportadas + (False,) * (afirmaciones - soportadas),
    )


def medicion_de(*casos: AnalisisDeOpciones, resultados: int = 1) -> PuertosDeOpciones:
    medida = MedicionDeOpciones(casos, (consulta(),) * resultados, "test-lista")
    return PuertosDeOpciones(medidor=lambda config, dataset: medida)


# --- AC-1 -----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 1)
def test_opciones_reporte_trae_las_metricas_de_opciones_cuando_corre_la_configuracion_falsa(
    tmp_path: Path,
) -> None:
    """El reporte trae M-10.1, M-10.2, fidelidad, precisión de citas, media de opciones, orden RN-28 y esperadas
    presentes cuando se ejecuta la familia con la configuración falsa [US-140 AC-1]."""
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    assert set(reporte["metricas"]) == set(METRICAS)
    assert reporte["metricas"]["m_10_1"]["porcentaje"] == 1.0
    assert reporte["metricas"]["m_10_2"]["campos_con_termino"] == 0
    assert reporte["metricas"]["orden_rn28"]["porcentaje"] == 1.0
    assert reporte["metricas"]["opciones_por_analisis"]["analisis"] == 12
    assert 1.0 <= reporte["metricas"]["opciones_por_analisis"]["media"] <= 3.0
    assert reporte["metricas"]["esperadas_presentes"]["esperadas"] > 0
    configuracion = reporte["configuracion"]
    assert configuracion["maxOptions"] == 3
    assert configuracion["catalogVersion"] == "test-apl-1.0.0"
    assert configuracion["dataset"] == {"nombre": "opciones", "version": "1"}
    assert configuracion["versionListaTerminos"]


@pytest.mark.ac("US-140", 1)
def test_opciones_dataset_no_sintetico_no_corre_y_sale_con_1_cuando_el_manifiesto_no_lo_declara(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config = variante(
        tmp_path,
        lambda _, dataset: (dataset / "manifest.yaml").write_text(
            (dataset / "manifest.yaml")
            .read_text(encoding="utf-8")
            .replace("clase: sintetico", "clase: real_anonimizado"),
            encoding="utf-8",
        ),
    )

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert codigo == 1 and reporte is None
    assert "la suite no corre" in capsys.readouterr().err


@pytest.mark.ac("US-140", 1)
def test_opciones_orden_se_verifica_contra_los_resumenes_propios_cuando_el_dataset_espera_otro_orden(
    tmp_path: Path,
) -> None:
    """El orden esperado del dataset no entra en la comparación: se compara con los resúmenes del propio análisis."""

    def invertir_el_orden_esperado(_: dict[str, Any], dataset: Path) -> None:
        ruta = dataset / "casos.yaml"
        crudo = yaml.safe_load(ruta.read_text(encoding="utf-8"))
        for caso in crudo["casos"].values():
            caso["orden_esperado"] = list(reversed(caso["orden_esperado"]))
        ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")

    codigo, reporte = correr(tmp_path, config=variante(tmp_path, invertir_el_orden_esperado))

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["orden_rn28"]["porcentaje"] == 1.0


# --- AC-2 -----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 2)
def test_opciones_bloquea_con_3_nombrando_caso_e_invariante_cuando_una_opcion_no_tiene_soporte(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    casos = (analisis("OP-03", opcion("o1"), opcion("o2", con_soporte=False)),)

    codigo, reporte = correr(tmp_path, puertos=medicion_de(*casos))

    assert codigo == 3 and reporte is not None
    assert reporte["invariantes"]["violaciones"] == [
        {"invariante": "M-10.1", "caso": "OP-03", "detalle": "o2"}
    ]
    assert "M-10.1 en OP-03" in capsys.readouterr().err


@pytest.mark.ac("US-140", 2)
def test_opciones_bloquea_con_3_sin_el_texto_generado_cuando_un_campo_mostrado_trae_un_termino(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    casos = (analisis("OP-05", opcion("o1"), nivel_a=(("rationale", "A-07"),)),)

    codigo, reporte = correr(tmp_path, puertos=medicion_de(*casos))

    assert codigo == 3 and reporte is not None
    assert reporte["invariantes"]["violaciones"] == [
        {"invariante": "M-10.2", "caso": "OP-05", "detalle": "rationale:A-07"}
    ]
    assert reporte["metricas"]["m_10_2"]["nivel_a"] == 1
    assert "M-10.2 en OP-05" in capsys.readouterr().err


@pytest.mark.ac("US-140", 2)
def test_opciones_bloquea_con_3_cuando_una_opcion_con_mas_excluyentes_se_muestra_antes(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    casos = (
        analisis("OP-02", opcion("o1", excluyentes=1, coincide=2), opcion("o2", excluyentes=0)),
    )

    codigo, reporte = correr(tmp_path, puertos=medicion_de(*casos))

    assert codigo == 3 and reporte is not None
    assert {v["invariante"] for v in reporte["invariantes"]["violaciones"]} == {"RN-28"}
    assert reporte["metricas"]["orden_rn28"]["conformes"] == 0
    assert "RN-28 en OP-02" in capsys.readouterr().err


@pytest.mark.ac("US-140", 2)
def test_opciones_sale_con_0_y_declara_las_invariantes_cumplidas_cuando_no_hay_violaciones(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    assert reporte["invariantes"] == {"cumplidas": True, "violaciones": []}


# --- AC-3 -----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 3)
def test_opciones_cuenta_como_conforme_cuando_la_no_comparable_se_muestra_despues_de_las_comparables(
    tmp_path: Path,
) -> None:
    """Los 2 casos del dataset con una opción de fuente única no comparable [US-140 AC-3]."""
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["no_comparable"]["casos"] == 2
    assert reporte["metricas"]["no_comparable"]["mostrada_al_final"] == 2
    assert reporte["metricas"]["no_comparable"]["no_mostrada"] == 0


@pytest.mark.ac("US-140", 3)
def test_opciones_bloquea_con_3_nombrando_el_caso_cuando_la_no_comparable_precede_a_una_comparable(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    casos = (
        analisis(
            "OP-02",
            opcion("o1", excluyentes=0, coincide=2, no_comparable=True),
            opcion("o2", excluyentes=0, coincide=1),
            espera_no_comparable=True,
        ),
    )

    codigo, reporte = correr(tmp_path, puertos=medicion_de(*casos))

    assert codigo == 3 and reporte is not None
    assert {"invariante": "RN-28-no-comparable", "caso": "OP-02", "detalle": "o1"} in reporte[
        "invariantes"
    ]["violaciones"]
    assert "RN-28-no-comparable en OP-02" in capsys.readouterr().err


@pytest.mark.ac("US-140", 3)
def test_opciones_registra_no_mostrada_y_no_bloquea_cuando_la_no_comparable_queda_fuera_del_tope(
    tmp_path: Path,
) -> None:
    casos = (analisis("OP-02", opcion("o1"), opcion("o2", coincide=1), espera_no_comparable=True),)

    codigo, reporte = correr(tmp_path, puertos=medicion_de(*casos))

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["no_comparable"] == {
        "casos": 1,
        "mostrada_al_final": 0,
        "no_mostrada": 1,
        "validacion": reporte["metricas"]["no_comparable"]["validacion"],
    }


# --- AC-4 -----------------------------------------------------------------------------------------------------------


def con_referencia(tmp_path: Path, fidelidad: float, precision: float) -> Path:
    referencia = reporte_de_referencia(tmp_path, fidelidad, precision)

    def apuntar(crudo: dict[str, Any], _: Path) -> None:
        crudo["regresion"]["reporte_referencia"] = str(referencia)

    return variante(tmp_path, apuntar)


@pytest.mark.ac("US-140", 4)
def test_opciones_bloquea_con_3_nombrando_la_metrica_cuando_la_fidelidad_retrocede_mas_que_la_tolerancia(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    codigo, reporte = correr(tmp_path / "s", config=con_referencia(tmp_path, 0.99, 0.80))

    assert codigo == 3 and reporte is not None
    retroceso = [m for m in reporte["regresion"]["metricas"] if m["retroceso"]]
    assert [m["metrica"] for m in retroceso] == ["fidelidad"]
    assert reporte["regresion"]["tolerancia"] == 0.05
    err = capsys.readouterr().err
    assert "retroceso de fidelidad" in err and "tolerancia 0.05" in err


@pytest.mark.ac("US-140", 4)
def test_opciones_no_bloquea_y_muestra_la_diferencia_cuando_el_retroceso_esta_dentro_de_la_tolerancia(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path / "s", config=con_referencia(tmp_path, 0.97, 0.80))

    assert codigo == 0 and reporte is not None
    fidelidad = next(m for m in reporte["regresion"]["metricas"] if m["metrica"] == "fidelidad")
    assert fidelidad["referencia"] == 0.97 and fidelidad["valor"] < 0.97
    assert not fidelidad["retroceso"]


@pytest.mark.ac("US-140", 4)
def test_opciones_no_corre_y_sale_con_2_nombrando_la_clave_cuando_no_hay_reporte_de_referencia(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    def sin_referencia(crudo: dict[str, Any], _: Path) -> None:
        crudo["regresion"]["reporte_referencia"] = str(tmp_path / "no-existe.json")

    codigo, reporte = correr(tmp_path / "s", config=variante(tmp_path, sin_referencia))

    assert codigo == 2 and reporte is None
    assert "regresion.reporte_referencia" in capsys.readouterr().err


@pytest.mark.ac("US-140", 4)
def test_opciones_marca_fuera_de_meta_sin_cambiar_el_codigo_cuando_la_fidelidad_es_menor_que_la_meta(
    tmp_path: Path,
) -> None:
    """Fidelidad 0,85 con la meta inicial de 0,90 y sin retroceso frente a la referencia [US-140 AC-1]."""
    casos = (analisis("OP-03", opcion("o1")),)
    medida = MedicionDeOpciones(casos, (consulta(soportadas=17, afirmaciones=20),), "test-lista")

    codigo, reporte = correr(
        tmp_path / "s",
        config=con_referencia(tmp_path, 0.80, 0.80),
        puertos=PuertosDeOpciones(medidor=lambda config, dataset: medida),
    )

    assert codigo == 0 and reporte is not None
    fidelidad = next(m for m in reporte["metas"]["metricas"] if m["metrica"] == "fidelidad_proxy")
    assert fidelidad["estado"] == "fuera_de_meta" and fidelidad["meta"] == 0.9
    assert reporte["metas"]["origen"] == "metas_iniciales_dec07_pendiente"


# --- AC-5 -----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 5)
def test_opciones_rotula_validada_solo_la_metrica_de_los_4_casos_revisados_cuando_hay_8_sin_revisar(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    for nombre in METRICAS:
        assert reporte["metricas"][nombre]["validacion"] == {
            "preguntas_validadas": 4,
            "preguntas_no_validadas": 8,
            "rotulo": "no_validada",
        }
        assert reporte["metricas_validadas"][nombre]["validacion"] == {
            "preguntas_validadas": 4,
            "preguntas_no_validadas": 0,
            "rotulo": "validada",
        }
    assert reporte["metricas_validadas"]["opciones_por_analisis"]["analisis"] == 4


# --- AC-6 -----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-140", 6)
def test_opciones_produce_metricas_y_huella_identicas_cuando_se_ejecuta_dos_veces(
    tmp_path: Path,
) -> None:
    primera = correr(tmp_path / "uno")
    segunda = correr(tmp_path / "dos")

    assert primera[0] == 0 and segunda[0] == 0
    assert primera[1] == segunda[1]
    assert primera[1] is not None and len(primera[1]["configuracion"]["hashConfig"]) == 64


def test_opciones_el_reporte_no_lleva_texto_de_preguntas_ni_de_salidas(tmp_path: Path) -> None:
    _, reporte = correr(tmp_path)

    texto = json.dumps(reporte, ensure_ascii=False)
    assert "Opción" not in texto and "Qué opciones" not in texto
    assert "Adjuvant" not in texto and "Androgen" not in texto
