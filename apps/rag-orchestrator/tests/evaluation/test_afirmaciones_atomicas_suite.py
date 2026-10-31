"""La suite `evaluate` cablea CLAIM_MAX_WORDS y emite afirmaciones atómicas como el pipeline real (US-245, RN-22)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import yaml

from app.application.ports import ResultadoDeRecuperacion
from app.domain.claims import PapelDeAfirmacion
from app.evaluation.adaptadores_falsos import GeneradorGuionado
from app.evaluation.composicion_suite import parametros_de_recuperacion
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.fuente_dataset import FuenteDatasetEnDirectorio
from tests.evaluation.conftest import RAIZ_APP

CONFIG = RAIZ_APP / "eval" / "configs" / "test-fake.yaml"


def _config_con_claim_max_words(tmp_path: Path, valor: int):
    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["claim_max_words"] = valor
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    return cargar_config_suite(ruta)


def test_la_suite_lee_claim_max_words_de_la_configuracion_y_lo_entrega_a_los_parametros(
    tmp_path: Path,
) -> None:
    config = _config_con_claim_max_words(tmp_path, 15)

    assert config.umbrales.claim_max_words == 15
    assert parametros_de_recuperacion(config, ("mama",)).claim_max_words == 15


def test_la_suite_usa_el_valor_inicial_cuando_la_configuracion_no_declara_claim_max_words() -> None:
    config = cargar_config_suite(CONFIG)

    assert parametros_de_recuperacion(config, ("mama",)).claim_max_words == 20


def test_el_generador_guionado_entrega_cada_propuesta_como_una_afirmacion_principal() -> None:
    config = cargar_config_suite(CONFIG)
    dataset = FuenteDatasetEnDirectorio(config.dataset).cargar()
    generador = GeneradorGuionado(dataset)
    pregunta = next(p for p in dataset.preguntas if dataset.propuestas.get(p.id))

    evidencia = asyncio.run(
        generador.generar(_solicitud(pregunta.texto), ResultadoDeRecuperacion((), 0, None))  # type: ignore[arg-type]
    )

    assert evidencia.opciones
    for opcion in evidencia.opciones:
        assert len(opcion.afirmaciones) == 1
        (principal,) = opcion.afirmaciones
        assert principal.papel is PapelDeAfirmacion.principal
        assert principal.chunk_ids == opcion.chunk_ids_citados


def _solicitud(texto: str):
    class _Solicitud:
        query = texto

    return _Solicitud


def test_evaluate_no_envia_al_nli_las_afirmaciones_mas_largas_que_claim_max_words_de_la_configuracion(
    tmp_path: Path,
) -> None:
    from app.evaluation.evaluate import main
    from tests.support.fakes import RelojFijo

    crudo = yaml.safe_load(CONFIG.read_text(encoding="utf-8"))
    crudo["umbrales"]["claim_max_words"] = 3
    ruta = tmp_path / "config.yaml"
    ruta.write_text(yaml.safe_dump(crudo), encoding="utf-8")
    codigo = main(
        ["--config", str(ruta), "--suite", "all", "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
    )

    reporte = json.loads(next((tmp_path / "s").glob("*.json")).read_text(encoding="utf-8"))
    assert codigo == 0
    assert reporte["metricas"]["completa"]["fidelidad"]["nli"]["afirmaciones"] == 0


def test_el_plan_de_la_propuesta_marca_fuera_de_forma_una_afirmacion_larga_segun_claim_max_words_de_la_suite() -> (
    None
):
    from app.application.ports import EvidenciaGenerada
    from app.domain.atribucion import FormaDeAfirmacion
    from app.domain.citations import OpcionGenerada
    from app.domain.claims import AfirmacionAtomica, PapelDeAfirmacion
    from app.evaluation.afirmaciones import plan_de_la_propuesta

    afirmacion = AfirmacionAtomica("uno dos tres cuatro", PapelDeAfirmacion.principal, ("c1",))
    propuesta = EvidenciaGenerada(
        opciones=(OpcionGenerada("Opción", "x", ("c1",), (), (afirmacion,)),)
    )
    textos = {"c1": "texto"}

    con_20 = plan_de_la_propuesta(propuesta, textos, lambda t, c: (), max_palabras=20)
    con_3 = plan_de_la_propuesta(propuesta, textos, lambda t, c: (), max_palabras=3)

    assert con_20.opciones[0].afirmaciones[0].forma is FormaDeAfirmacion.valida
    assert con_3.opciones[0].afirmaciones[0].forma is FormaDeAfirmacion.demasiado_larga
