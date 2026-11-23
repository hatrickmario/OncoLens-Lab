"""Una sola base por fila (el último loop), los fakes del mundo de prueba cumplen el contrato de sus puertos (LSP) y el servicio
busca tantas veces por loop como supone el observador (``BUSQUEDAS_POR_LOOP``)."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from app.application.ports import ChunkEncontrado
from app.evaluation.config_diagnostico import cargar_config_diagnostico
from app.evaluation.config_suite import cargar_config_suite
from app.evaluation.corrida_diagnostico import fila_de_redaccion
from app.evaluation.dataset_diagnostico import cargar_dataset_diagnostico
from app.evaluation.evaluate import main
from app.evaluation.observadores_diagnostico import (
    BUSQUEDAS_POR_LOOP,
    BuscadorDeDiagnostico,
    RegistroDeDiagnostico,
    RerankerDeDiagnostico,
)
from tests.evaluation.conftest import RAIZ_APP, RAIZ_REPO
from tests.evaluation.mundo_diagnostico import (
    BuscadorGuionado,
    Redaccion,
    RerankerGuionado,
    construir_mundo,
    par_de_cada_etapa,
)
from tests.support.fakes import RelojFijo

CONFIG_FAKE = RAIZ_APP / "eval" / "configs" / "diagnostico-fake.yaml"
DATASET = RAIZ_REPO / "data" / "eval" / "parafrasis-v1"


class _Candidato:
    def __init__(self, chunk_id: str) -> None:
        self.chunk_id, self.chunk_text = chunk_id, ""


class _Buscador:
    def __init__(self, ids: Sequence[str]) -> None:
        self._ids = ids

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        return [ChunkEncontrado(i, "d", "t", 1.0 - 0.1 * n) for n, i in enumerate(self._ids)]


class _Reranker:
    version = "r@1"

    def __init__(self, puntaje: float) -> None:
        self._puntaje = puntaje

    def puntuar(self, pregunta: str, candidatos: Sequence[_Candidato]) -> list[float]:
        return [self._puntaje for _ in candidatos]


def test_la_fila_se_lee_del_ultimo_loop_y_de_la_ultima_generacion_cuando_solo_el_segundo_loop_genera() -> (
    None
):
    config = cargar_config_diagnostico(CONFIG_FAKE, cargar_config_suite(CONFIG_FAKE))
    dataset = cargar_dataset_diagnostico(DATASET, pares_minimos=10)
    par = dataset.pares[0]
    esperado = par.chunks_esperados[0]
    registro = RegistroDeDiagnostico()
    # Primer loop: el esperado no está entre los candidatos y nada supera el umbral. Segundo: es el primero y sí lo supera.
    for ids, puntaje in ((("x1", "x2"), 0.05), (((esperado, "x1")), 0.9)):
        buscador = BuscadorDeDiagnostico(_Buscador(ids), registro)
        for _ in range(BUSQUEDAS_POR_LOOP):
            buscador.search_dense([0.1], 5)
        RerankerDeDiagnostico(_Reranker(puntaje), registro).puntuar(
            "p", [_Candidato(i) for i in ids]
        )
    registro.opciones_propuestas.append(2)  # el generador solo corre tras el segundo loop

    fila = fila_de_redaccion(config, par, par.redacciones[0], None, registro)

    assert fila.loops == 2
    assert (fila.puesto_denso, fila.entro_en_pares, fila.relevance_score) == (1, True, 0.9)
    assert fila.opciones_generadas == 2  # la de la última generación, no una suma


def test_el_buscador_guionado_respeta_limit_como_el_puerto_real() -> None:
    redaccion = Redaccion(("a", "b", "c"))
    buscador = BuscadorGuionado([redaccion], {c: ("d", c) for c in "abc"})

    assert [c.chunk_id for c in buscador.search_dense([0.1], 2)] == ["a", "b"]


def test_el_reranker_guionado_da_el_puntaje_por_defecto_a_una_pregunta_sin_guion() -> None:
    puntajes = RerankerGuionado({}).puntuar("sin guion", [_Candidato("x")])

    assert puntajes == [0.05]


def test_el_servicio_busca_exactamente_busquedas_por_loop_veces_por_consulta(
    tmp_path: Path,
) -> None:
    mundo = construir_mundo(tmp_path, par_de_cada_etapa())

    codigo = main(
        ["--config", str(mundo.config), "--suite", "diagnostico", "--salida", str(tmp_path / "s")],
        reloj=RelojFijo(),
        puertos_diagnostico=mundo.puertos,
    )

    assert codigo == 0
    consultas = 2 * len(par_de_cada_etapa())  # un solo loop por consulta en el fixture
    assert mundo.puertos.buscador.llamadas == BUSQUEDAS_POR_LOOP * consultas  # type: ignore[union-attr]
