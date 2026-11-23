"""Aceptación de la cobertura de genéricas por caso de próstata de la familia `contextual` (US-273 AC-2, L1D-331).

Adaptadores falsos, reloj congelado y el servicio de consulta real con el segundo loop contextual. La genérica puntúa alto solo
cuando corre el loop contextual y con el chunk del tipo de cáncer del caso, así que cada cifra tiene un resultado conocido. La
meta y el reporte base salen de la configuración. Sin mocks de módulos propios.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.evaluation.evaluate import main
from tests.evaluation.conftest import RAIZ_APP
from tests.evaluation.mundo_contextual import (
    Mundo,
    construir_mundo,
    puertos_de_prostata,
)
from tests.support.contract import CATALOGOS
from tests.support.fakes import RelojFijo

PROSTATA = ("prostata-con-grado", "prostata-con-psa-y-hrr")
TEXTOS_DE_PROSTATA = ("próstata", "ISUP", "Gleason", "HRR", "PSA")
"""Términos del caso de próstata que el reporte jamás debe contener (los campos usados se nombran por su clave)."""


def _de_prostata(tmp_path: Path, **cambios: Any) -> Mundo:
    mundo = construir_mundo(tmp_path, casos=PROSTATA, **cambios)
    return Mundo(mundo.config, mundo.corpus, puertos_de_prostata(), mundo.textos)


def correr(
    mundo: Mundo, salida: Path, nombre: str = "informe"
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        [
            "--config",
            str(mundo.config),
            "--suite",
            "contextual",
            "--salida",
            str(salida),
            "--nombre-archivo",
            nombre,
        ],
        reloj=RelojFijo(),
        puertos_contextual=mundo.puertos,
    )
    escrito = salida / f"{nombre}.json"
    return codigo, json.loads(escrito.read_text("utf-8")) if escrito.exists() else None


def correr_ok(mundo: Mundo, salida: Path, nombre: str = "informe") -> dict[str, Any]:
    codigo, reporte = correr(mundo, salida, nombre)
    assert codigo == 0
    assert reporte is not None
    return reporte


def fila(reporte: dict[str, Any], identificador: str, caso: str) -> dict[str, Any]:
    return next(
        f for f in reporte["preguntas"] if (f["pregunta_id"], f["caso"]) == (identificador, caso)
    )


@pytest.mark.ac("US-273", 2)
def test_contextual_da_por_caso_de_prostata_las_genericas_con_evidencia_el_top3_y_los_campos_usados_cuando_corre_con_adaptadores_falsos(
    tmp_path: Path,
) -> None:
    mundo = _de_prostata(tmp_path)
    salida = tmp_path / "salida"

    reporte = correr_ok(mundo, salida)

    assert reporte.get("cobertura") == [
        {
            "caso": "prostata-con-grado",
            "genericas_con_evidencia": 1,
            "genericas_total": 1,
            "minimo": 1,
            "cumple": True,
            "campos_usados": ["tipo", "estadio"],
        },
        {
            "caso": "prostata-con-psa-y-hrr",
            "genericas_con_evidencia": 1,
            "genericas_total": 1,
            "minimo": 1,
            "cumple": True,
            "campos_usados": ["tipo", "estadio", "biomarcador_principal"],
        },
    ]
    for caso in PROSTATA:
        assert fila(reporte, "CTX-G01", caso).get("top3") == [
            {"chunk_id": "c5", "relevance_score": 0.9}
        ]
    for archivo in (salida / "informe.json", salida / "informe.md"):
        contenido = archivo.read_text("utf-8")
        assert not [t for t in (*mundo.textos, *TEXTOS_DE_PROSTATA) if t in contenido], archivo.name


@pytest.mark.ac("US-273", 2)
@pytest.mark.parametrize(("minimo", "cumple"), [(1, True), (2, False)])
def test_contextual_marca_el_caso_como_no_cumplido_con_la_meta_de_la_configuracion_cuando_la_cobertura_queda_por_debajo(
    tmp_path: Path, minimo: int, cumple: bool
) -> None:
    reporte = correr_ok(_de_prostata(tmp_path, minimo=minimo), tmp_path / "salida")

    cobertura = reporte.get("cobertura") or []
    assert [(c["minimo"], c["cumple"]) for c in cobertura] == [(minimo, cumple)] * 2
    assert reporte["configuracion"]["umbrales"]["relevanceThreshold"] == 0.3  # lo demás no cambia


@pytest.mark.ac("US-273", 2)
def test_contextual_deja_el_puntaje_en_null_y_el_caso_sin_cumplir_cuando_ninguna_generica_supera_el_umbral(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(_de_prostata(tmp_path, expansion=False), tmp_path / "salida")

    generica = fila(reporte, "CTX-G01", "prostata-con-grado")
    assert generica["estado"] == "sin_evidencia"
    assert generica["top_relevance_score"] is None  # null, nunca 0.0
    assert generica.get("llamadas_al_generador") == 0
    assert generica.get("top3") == [{"chunk_id": "c5", "relevance_score": 0.05}]
    assert (reporte.get("cobertura") or [{}])[0].get("cumple") is False


@pytest.mark.ac("US-273", 2)
def test_contextual_da_las_adversarias_sin_evidencia_con_puntaje_null_y_cero_llamadas_al_generador_cuando_ninguna_supera_el_umbral(
    tmp_path: Path,
) -> None:
    reporte = correr_ok(construir_mundo(tmp_path), tmp_path / "salida")

    assert reporte.get("adversarias") == [
        {
            "caso": "mama-completo",
            "total": 1,
            "sin_evidencia": 1,
            "falsos_positivos": 0,
            "con_puntaje_nulo": 1,
            "llamadas_al_generador": 0,
        }
    ]
    assert fila(reporte, "CTX-G01", "mama-completo").get("llamadas_al_generador") == 1


@pytest.mark.ac("US-273", 2)
def test_contextual_senala_cada_metrica_que_empeora_frente_al_reporte_base_cuando_la_cobertura_baja(
    tmp_path: Path,
) -> None:
    base = tmp_path / "base" / "base.json"
    correr_ok(construir_mundo(tmp_path), tmp_path / "base", "base")
    mundo = construir_mundo(tmp_path / "actual", expansion=False, reporte_base=base)

    reporte = correr_ok(mundo, tmp_path / "salida")

    comparacion = reporte.get("comparacion") or {}
    cambios = {(c["ambito"], c["metrica"]): c for c in comparacion.get("cambios", [])}
    assert cambios.get(("total", "genericas_con_evidencia")) == {
        "ambito": "total",
        "metrica": "genericas_con_evidencia",
        "base": 1,
        "actual": 0,
        "empeora": True,
    }
    assert cambios[("mama-completo", "genericas_con_evidencia")]["empeora"] is True
    assert cambios[("total", "falsos_positivos")]["empeora"] is False
    assert cambios[("total", "controles_con_evidencia")]["empeora"] is False
    assert comparacion.get("empeoran") == 2


@pytest.mark.ac("US-273", 2)
def test_contextual_no_compara_ni_escribe_cifras_cuando_el_corpus_del_reporte_base_es_otro(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    base = tmp_path / "base" / "base.json"
    correr_ok(construir_mundo(tmp_path), tmp_path / "base", "base")
    crudo = json.loads(base.read_text("utf-8"))
    crudo["configuracion"]["corpus"]["release"] = "otra-release"
    base.write_text(json.dumps(crudo), encoding="utf-8")
    mundo = construir_mundo(tmp_path / "actual", reporte_base=base)

    codigo, reporte = correr(mundo, tmp_path / "salida")

    assert codigo != 0
    assert reporte is None
    assert not (tmp_path / "salida").exists() or not list((tmp_path / "salida").iterdir())
    assert "corpus" in capsys.readouterr().err


@pytest.mark.ac("US-273", 2)
def test_contextual_no_hace_segundo_loop_y_deja_null_cuando_el_caso_de_prostata_no_trae_terminos_del_catalogo(
    tmp_path: Path,
) -> None:
    catalogos = tmp_path / "catalogos"
    shutil.copytree(CATALOGOS, catalogos)
    codigos = catalogos / "prostata" / "codigos.json"
    contenido = json.loads(codigos.read_text("utf-8"))
    for entrada in contenido["entradas"]:
        if entrada["estandar"] == "cie10":  # el tipo deja de tener etiqueta en el catálogo
            entrada["terminoCanonico"] = "otro-termino"
    codigos.write_text(json.dumps(contenido), encoding="utf-8")
    casos = tmp_path / "casos.json"
    casos.write_text(
        json.dumps(
            {
                "casos": [
                    {
                        "id": "prostata-sin-terminos",
                        "clinicalContext": {
                            "diagnosis": {
                                "cancerType": "prostata",
                                "stagingSystem": "TNM_8",
                                "stageValue": "Sin estadificar",
                                "grade": None,
                            },
                            "biomarkers": [{"biomarkerName": "ZZZ", "value": "positivo"}],
                        },
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    mundo = construir_mundo(
        tmp_path,
        casos=("prostata-sin-terminos",),
        casos_ruta=str(casos),
        ruta_terminos=str(catalogos),
    )

    reporte = correr_ok(
        Mundo(mundo.config, mundo.corpus, puertos_de_prostata(), mundo.textos), tmp_path / "salida"
    )

    generica = fila(reporte, "CTX-G01", "prostata-sin-terminos")
    assert (generica["estado"], generica["segundo_loop"]) == ("sin_evidencia", "ninguno")
    assert generica["top_relevance_score"] is None
    assert generica.get("campos_usados") == []
    assert generica.get("llamadas_al_generador") == 0
    assert (reporte.get("cobertura") or [{}])[0].get("genericas_con_evidencia") == 0


@pytest.mark.parametrize("nombre", ["contextual-fake.yaml", "contextual-local.yaml"])
def test_la_configuracion_de_la_familia_declara_la_meta_de_us_273_ac_2_y_los_tres_casos_de_la_medicion(
    nombre: str,
) -> None:
    contextual = yaml.safe_load((RAIZ_APP / "eval" / "configs" / nombre).read_text("utf-8"))[
        "contextual"
    ]

    assert contextual.get("genericas_con_evidencia_minimo") == 18
    assert contextual["casos"] == ["mama-completo", *PROSTATA]


@pytest.mark.ac("US-273", 2)
def test_contextual_fake_da_la_cobertura_de_los_tres_casos_sobre_las_180_consultas_del_dataset_del_repositorio(
    tmp_path: Path,
) -> None:
    codigo = main(
        [
            "--config",
            str(RAIZ_APP / "eval" / "configs" / "contextual-fake.yaml"),
            "--suite",
            "contextual",
            "--salida",
            str(tmp_path),
            "--nombre-archivo",
            "informe",
        ],
        reloj=RelojFijo(),
    )

    reporte = json.loads((tmp_path / "informe.json").read_text("utf-8"))
    assert codigo == 0
    assert len(reporte["preguntas"]) == 180
    assert [c["caso"] for c in reporte["cobertura"]] == ["mama-completo", *PROSTATA]
    assert {c["genericas_total"] for c in reporte["cobertura"]} == {22}
    assert {c["minimo"] for c in reporte["cobertura"]} == {18}
    assert reporte["comparacion"] is None
