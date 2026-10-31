"""Aceptación de la familia `aplicabilidad` de `evaluate` (US-132 AC-1…AC-5, M-08.2, M-08.3, M-08.4, M-08.6).

Adapters falsos y reloj congelado; los resultados con una violación se construyen con tipos de dominio (no hay mocks de
módulos propios). Cada invariante tiene una variante que falla, para que la medición no sea decorativa.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import Any

import pytest
import yaml

from app.application.errores import RecuperacionNoDisponibleError
from app.application.ports import CoberturaDePoblacion
from app.domain.aplicabilidad_tipos import (
    BiomarcadorDelPaciente,
    ContextoDelPaciente,
    CriterioEvaluado,
)
from app.evaluation.corrida_aplicabilidad import PuertosDeAplicabilidad
from app.evaluation.evaluate import main
from app.evaluation.metricas.aplicabilidad import Esperado, ParEvaluado
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.support.aplicabilidad import criterios_de_test_apl_1_0_0
from tests.support.fakes import RelojFijo

CONFIG = RAIZ_APP / "eval" / "configs" / "test-aplicabilidad.yaml"
DATASET = RAIZ_REPO / "data" / "evaluation" / "aplicabilidad"
HER2 = "estado_her2"


def correr(
    salida: Path,
    *extra: str,
    config: Path = CONFIG,
    puertos: PuertosDeAplicabilidad | None = None,
) -> tuple[int, dict[str, Any] | None]:
    codigo = main(
        ["--config", str(config), "--suite", "aplicabilidad", "--salida", str(salida), *extra],
        reloj=RelojFijo(),
        puertos_aplicabilidad=puertos,
    )
    archivos = sorted(salida.glob("*.json"))
    reporte = json.loads(archivos[0].read_text(encoding="utf-8")) if archivos else None
    return codigo, reporte


def configuracion_variante(
    tmp_path: Path, cambiar: Callable[[dict[str, Any]], None] | None = None
) -> tuple[Path, Path]:
    """Copia editable del dataset y de la configuración que la apunta; devuelve (configuración, dataset)."""
    dataset = tmp_path / "dataset"
    shutil.copytree(DATASET, dataset)
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["dataset"]["ruta"] = str(dataset)
    crudo["corpus"]["catalogo_en_memoria"] = str(dataset / "corpus-catalogo.yaml")
    crudo["corpus_metadatos"]["revision"] = str(dataset / "revision-muestra.yaml")
    if cambiar:
        cambiar(crudo)
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo, allow_unicode=True), encoding="utf-8")
    return ruta, dataset


def par_construido(
    criterio: CriterioEvaluado, *, chunks: Sequence[str] = ("ch-a1-1",)
) -> ParEvaluado:
    contexto = ContextoDelPaciente(biomarcadores=(BiomarcadorDelPaciente("HER2", "3+ (IHQ)", 1),))
    catalogo = {c.clave: c for c in criterios_de_test_apl_1_0_0().criterios("mama")}
    return ParEvaluado(
        id="par-construido",
        esperados={HER2: Esperado("coincide")},
        criterios=(criterio,),
        contexto=contexto,
        chunk_ids_de_la_fuente=frozenset(chunks),
        catalogo=catalogo,
    )


def her2_evaluado(**cambios: Any) -> CriterioEvaluado:
    base: dict[str, Any] = {
        "clave": HER2,
        "valor_paciente": "3+ (IHQ)",
        "valor_estudio": "positivo",
        "estado": "coincide",
        "causa": None,
        "es_excluyente": True,
    }
    return CriterioEvaluado(**{**base, **cambios})


def con_evaluador(*pares: ParEvaluado) -> PuertosDeAplicabilidad:
    return PuertosDeAplicabilidad(evaluador=lambda config, dataset: list(pares))


# --- AC-1 ----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-132", 1)
def test_aplicabilidad_reporta_concordancia_cero_coincidencias_sin_cita_y_cero_valores_no_copiados_cuando_se_corre_con_la_configuracion_falsa(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    medidas = reporte["metricas"]["aplicabilidad"]
    assert medidas["concordancia_de_estados"] == {"aciertos": 51, "total": 51, "valor": 1.0}
    assert medidas["criterios_coincide_sin_cita"] == 0
    assert medidas["valores_paciente_no_copiados"] == 0
    assert reporte["configuracion"]["catalogVersion"] == "test-apl-1.0.0"
    par = {p["id"]: p for p in medidas["pares"]}["am1-a1"]
    assert (
        par["coincide"],
        par["parcial"],
        par["no_coincide"],
        par["desconocido"],
        par["acierto"],
    ) == (
        2,
        0,
        0,
        3,
        True,
    )


def test_aplicabilidad_no_altera_el_valor_del_paciente_cuando_el_llm_propone_2_mas_para_her2(
    tmp_path: Path,
) -> None:
    _, reporte = correr(tmp_path)

    assert reporte is not None
    pares = {p["id"]: p for p in reporte["metricas"]["aplicabilidad"]["pares"]}
    assert pares["am1-a2-valor-paciente"]["acierto"] is True
    assert reporte["metricas"]["aplicabilidad"]["valores_paciente_no_copiados"] == 0


def test_aplicabilidad_deja_desconocidos_y_suma_omitidas_cuando_el_nli_es_neutral_o_la_cita_es_ajena(
    tmp_path: Path,
) -> None:
    _, reporte = correr(tmp_path)

    assert reporte is not None
    medidas = reporte["metricas"]["aplicabilidad"]
    pares = {p["id"]: p for p in medidas["pares"]}
    assert pares["am1-a2-sin-soporte"]["acierto"] and pares["am1-a2-cita-ajena"]["acierto"]
    assert pares["am1-a2-sin-soporte"]["coincide"] == pares["am1-a2-cita-ajena"]["coincide"] == 0
    assert pares["am2-a2-analisis-previo-no-es-cita"][
        "acierto"
    ]  # RN-24: un análisis previo no es cita ni soporte
    assert medidas["omitidas"] == 3
    assert medidas["criterios_coincide_sin_cita"] == 0


def test_aplicabilidad_mide_la_escala_no_comparable_y_el_dato_sin_verificar_sin_bloquear_el_estado(
    tmp_path: Path,
) -> None:
    """D4-04 (L1D-299): Karnofsky no compara con el ECOG del criterio (desconocido) y un HER2 ``requiere_revision``
    avisa ``sin_verificar`` pero el estado se calcula igual (RN-26)."""
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    pares = {p["id"]: p for p in reporte["metricas"]["aplicabilidad"]["pares"]}
    par = pares["am2-a1-escala-no-comparable-y-sin-verificar"]
    assert par["acierto"] and par["coincide"] == 1 and par["desconocido"] == 4


def test_aplicabilidad_baja_la_concordancia_cuando_el_dataset_espera_otro_estado(
    tmp_path: Path,
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    pares = yaml.safe_load((dataset / "pares.yaml").read_text(encoding="utf-8"))
    pares["pares"][0]["esperado"][HER2] = {"estado": "no_coincide"}
    (dataset / "pares.yaml").write_text(yaml.safe_dump(pares, allow_unicode=True), encoding="utf-8")

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert codigo == 0 and reporte is not None
    assert reporte["metricas"]["aplicabilidad"]["concordancia_de_estados"]["aciertos"] == 50


def test_aplicabilidad_se_niega_con_codigo_1_y_nombra_el_manifiesto_cuando_el_dataset_no_es_sintetico(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    manifiesto = json.loads((dataset / "manifest.json").read_text(encoding="utf-8"))
    manifiesto["clase"] = "real_anonimizado"
    (dataset / "manifest.json").write_text(json.dumps(manifiesto), encoding="utf-8")

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert (codigo, reporte) == (1, None)
    error = capsys.readouterr().err
    assert "manifest" in error and "HER2" not in error and "This guidance" not in error


def test_aplicabilidad_termina_con_codigo_2_y_nombra_la_clave_cuando_una_fuente_declara_una_clave_que_el_catalogo_no_resuelve(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    ruta = dataset / "fuentes" / "doc-a1.json"
    fuente = json.loads(ruta.read_text(encoding="utf-8"))
    fuente["population_criteria"]["biomarcadores"] = {"her3": "positivo"}
    ruta.write_text(json.dumps(fuente), encoding="utf-8")

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert (codigo, reporte) == (2, None)
    error = capsys.readouterr().err
    assert "biomarcadores.her3" in error and "positivo" not in error


# --- AC-2 ----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-132", 2)
def test_aplicabilidad_sale_con_codigo_3_y_nombra_la_metrica_cuando_hay_un_criterio_en_coincide_sin_cita(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    criterio = her2_evaluado(chunk_citado_id="ch-ajeno-9")

    codigo, reporte = correr(tmp_path, puertos=con_evaluador(par_construido(criterio)))

    assert codigo == 3 and reporte is not None
    assert "criterios_coincide_sin_cita" in capsys.readouterr().err
    assert reporte["metricas"]["aplicabilidad"]["criterios_coincide_sin_cita"] == 1


def test_aplicabilidad_sale_con_codigo_3_y_nombra_la_metrica_cuando_el_valor_del_paciente_no_es_el_del_contexto(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    criterio = her2_evaluado(valor_paciente="2+")

    codigo, reporte = correr(tmp_path, puertos=con_evaluador(par_construido(criterio)))

    assert codigo == 3 and reporte is not None
    assert "valores_paciente_no_copiados" in capsys.readouterr().err
    assert reporte["metricas"]["aplicabilidad"]["valores_paciente_no_copiados"] == 1


def test_aplicabilidad_sale_con_codigo_0_cuando_ambas_metricas_valen_cero(tmp_path: Path) -> None:
    codigo, reporte = correr(tmp_path, puertos=con_evaluador(par_construido(her2_evaluado())))

    assert codigo == 0 and reporte is not None


# --- AC-3 ----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-132", 3)
def test_aplicabilidad_reporta_la_version_y_la_cobertura_0_70_fuera_de_meta_cuando_hay_10_documentos_vigentes_y_7_con_criterios(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    cobertura = reporte["metricas"]["cobertura_poblacion"]
    assert cobertura == {
        "version": "2026-10-16",
        "vigentes": 10,
        "con_criterios": 7,
        "valor": 0.7,
        "meta": 0.9,
        "marca": "fuera_de_meta",
    }


def test_aplicabilidad_reporta_la_version_de_la_bandera_cuando_se_pasa_corpus_cutoff_date(
    tmp_path: Path,
) -> None:
    _, reporte = correr(tmp_path, "--corpus-cutoff-date", "2026-11-02")

    assert reporte is not None
    assert reporte["metricas"]["cobertura_poblacion"]["version"] == "2026-11-02"


def test_aplicabilidad_reporta_cobertura_nula_y_no_medida_cuando_no_hay_documentos_vigentes(
    tmp_path: Path,
) -> None:
    puertos = PuertosDeAplicabilidad(lector_cobertura=_CoberturaFija(CoberturaDePoblacion(0, 0)))

    codigo, reporte = correr(tmp_path, puertos=puertos)

    assert codigo == 0 and reporte is not None
    cobertura = reporte["metricas"]["cobertura_poblacion"]
    assert (cobertura["valor"], cobertura["vigentes"], cobertura["marca"]) == (None, 0, "no_medida")


def test_aplicabilidad_sale_con_codigo_1_sin_cadenas_de_conexion_cuando_el_catalogo_del_corpus_no_esta_disponible(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    puertos = PuertosDeAplicabilidad(lector_cobertura=_CoberturaCaida())

    codigo, reporte = correr(tmp_path, puertos=puertos)

    assert (codigo, reporte) == (1, None)
    assert "postgres" not in capsys.readouterr().err.lower()


class _CoberturaFija:
    def __init__(self, cobertura: CoberturaDePoblacion) -> None:
        self._cobertura = cobertura

    def cobertura(self) -> CoberturaDePoblacion:
        return self._cobertura


class _CoberturaCaida:
    def cobertura(self) -> CoberturaDePoblacion:
        raise RecuperacionNoDisponibleError("cobertura")


# --- AC-4 ----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-132", 4)
def test_aplicabilidad_reporta_exactitud_0_95_en_meta_con_2_documentos_y_20_campos_cuando_se_lee_la_muestra_revisada(
    tmp_path: Path,
) -> None:
    codigo, reporte = correr(tmp_path)

    assert codigo == 0 and reporte is not None
    exactitud = reporte["metricas"]["exactitud_extraido_verificado"]
    assert exactitud == {
        "documentos": 2,
        "revisados": 20,
        "correctos": 19,
        "pendientes": 0,
        "valor": 0.95,
        "meta": 0.95,
        "marca": "en_meta",
    }
    assert "valor-sintetico" not in json.dumps(reporte)


def test_aplicabilidad_excluye_los_pendientes_de_la_exactitud_cuando_la_muestra_tiene_campos_sin_revisar(
    tmp_path: Path,
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    muestra = yaml.safe_load((dataset / "revision-muestra.yaml").read_text(encoding="utf-8"))
    campos = muestra["documentos"][0]["campos"]
    muestra["documentos"] = [muestra["documentos"][0]]
    for n, campo in enumerate(campos):
        campo["revision"] = "pendiente" if n >= 5 else "correcto"
    (dataset / "revision-muestra.yaml").write_text(yaml.safe_dump(muestra), encoding="utf-8")

    _, reporte = correr(tmp_path / "salida", config=config)

    assert reporte is not None
    exactitud = reporte["metricas"]["exactitud_extraido_verificado"]
    assert (exactitud["valor"], exactitud["revisados"], exactitud["pendientes"]) == (1.0, 5, 5)


def test_aplicabilidad_reporta_exactitud_nula_con_causa_y_sin_fallar_cuando_no_hay_archivo_de_revision(
    tmp_path: Path,
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    (dataset / "revision-muestra.yaml").unlink()

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert codigo == 0 and reporte is not None
    exactitud = reporte["metricas"]["exactitud_extraido_verificado"]
    assert (exactitud["valor"], exactitud["marca"], exactitud["causa"]) == (
        None,
        "no_medida",
        "sin_archivo",
    )
    assert reporte["metricas"]["aplicabilidad"]["concordancia_de_estados"]["valor"] == 1.0


def test_aplicabilidad_termina_con_codigo_2_y_nombra_el_documento_cuando_la_revision_tiene_un_valor_desconocido(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    config, dataset = configuracion_variante(tmp_path)
    muestra = yaml.safe_load((dataset / "revision-muestra.yaml").read_text(encoding="utf-8"))
    muestra["documentos"][1]["campos"][0]["revision"] = "quizas"
    (dataset / "revision-muestra.yaml").write_text(yaml.safe_dump(muestra), encoding="utf-8")

    codigo, reporte = correr(tmp_path / "salida", config=config)

    assert (codigo, reporte) == (2, None)
    error = capsys.readouterr().err
    assert "muestra-2" in error and "study_design" in error and "valor-sintetico" not in error


# --- AC-5 ----------------------------------------------------------------------------------------------------------


@pytest.mark.ac("US-132", 5)
def test_aplicabilidad_da_reportes_identicos_cuando_se_ejecuta_dos_veces_con_la_configuracion_falsa(
    tmp_path: Path,
) -> None:
    correr(tmp_path / "uno")
    correr(tmp_path / "dos")

    primero = next((tmp_path / "uno").glob("*.json"))
    segundo = next((tmp_path / "dos").glob("*.json"))
    assert primero.name == segundo.name
    assert primero.read_bytes() == segundo.read_bytes()


def test_el_envoltorio_usa_la_configuracion_de_aplicabilidad_y_la_fecha_del_entorno_cuando_no_se_pasa_config(
    tmp_path: Path,
) -> None:
    proceso = subprocess.run(
        [
            "node",
            str(RAIZ_REPO / "scripts" / "eval" / "evaluate.mjs"),
            "--suite",
            "aplicabilidad",
            "--salida",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        timeout=120,
        env={
            "PATH": os.environ["PATH"],
            "EVAL_PYTHON": sys.executable,
            "CORPUS_CUTOFF_DATE": "2026-12-01",
        },
        check=False,
    )

    assert proceso.returncode == 0, proceso.stderr
    reporte = json.loads(next(tmp_path.glob("*-aplicabilidad.json")).read_text(encoding="utf-8"))
    assert reporte["configuracion"]["nombre"] == "test-aplicabilidad"
    assert reporte["metricas"]["cobertura_poblacion"]["version"] == "2026-12-01"


# --- no-fuga (RN-14, RN-25) ----------------------------------------------------------------------------------------


def test_aplicabilidad_no_copia_valores_del_paciente_ni_textos_de_fuentes_al_reporte_ni_a_la_consola(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    violada = con_evaluador(par_construido(her2_evaluado(valor_paciente="2+")))
    _, reporte = correr(tmp_path / "violada", puertos=violada)
    _, completo = correr(tmp_path / "completo")

    consola = capsys.readouterr()
    todo = json.dumps(reporte) + json.dumps(completo) + consola.out + consola.err
    secretos = (
        "3+ (IHQ)",
        "HER2 negativo",
        "This guidance",
        "Mutación patogénica",
        "ISUP grupo 3",
        "valor-sintetico",
    )
    assert [s for s in secretos if s in todo] == []
