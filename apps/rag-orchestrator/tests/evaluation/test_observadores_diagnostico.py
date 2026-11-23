"""Observadores de la familia `diagnostico` (US-276 D2): anotan lo que ven los puertos sin cambiar su comportamiento y
cumplen el mismo contrato que el puerto que decoran (LSP): mismos resultados, mismos errores, la lista vacía no se anota."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Sequence

import pytest

from app.application.ports import (
    CandidatoParaReranker,
    ChunkEncontrado,
    ChunkSearch,
    EvidenceGenerator,
    EvidenciaGenerada,
    FalloDeInferencia,
    NliClassifier,
    Reranker,
    ResultadoDeRecuperacion,
)
from app.domain.nli import ParNli, ResultadoNli
from app.evaluation.observadores_diagnostico import (
    BuscadorDeDiagnostico,
    GeneradorDeDiagnostico,
    NliDeDiagnostico,
    RegistroDeDiagnostico,
    RerankerDeDiagnostico,
)


class _Candidato:
    def __init__(self, chunk_id: str) -> None:
        self.chunk_id, self.chunk_text = chunk_id, f"texto de {chunk_id}"


class _Buscador:
    def __init__(self, resultados: list[ChunkEncontrado]) -> None:
        self._resultados = resultados

    def search_dense(
        self, vector: Sequence[float], limit: int, filtro: str | None = None
    ) -> list[ChunkEncontrado]:
        return self._resultados


class _Reranker:
    version = "reranker-de-prueba@1"

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        return [0.9 if c.chunk_id == "e" else 0.1 for c in candidatos]


class _RerankerRoto:
    version = "roto@1"

    def puntuar(self, pregunta: str, candidatos: Sequence[CandidatoParaReranker]) -> list[float]:
        raise FalloDeInferencia("reranker")


class _Nli:
    version = "nli-de-prueba@1"

    def clasificar(self, pares: list[ParNli]) -> list[ResultadoNli]:
        return [
            ResultadoNli("entailment", 0.9)
            if p.hipotesis == "bien"
            else ResultadoNli("neutral", 0.2)
            for p in pares
        ]


def _chunk(identificador: str, similitud: float) -> ChunkEncontrado:
    return ChunkEncontrado(identificador, "d", f"texto de {identificador}", similitud)


def test_el_buscador_observado_devuelve_lo_mismo_y_anota_solo_ids_y_similitudes() -> None:
    registro = RegistroDeDiagnostico()
    interno = _Buscador([_chunk("a", 0.9), _chunk("b", 0.4)])

    devuelto = BuscadorDeDiagnostico(interno, registro).search_dense([0.1], 5, "filtro")

    assert devuelto == interno.search_dense([0.1], 5)
    assert [(c.chunk_id, c.puntaje_de_recuperacion) for c in registro.eventos[0].resultados] == [  # type: ignore[union-attr]
        ("a", 0.9),
        ("b", 0.4),
    ]


def test_el_reranker_observado_devuelve_los_mismos_puntajes_y_expone_la_version_del_interno() -> (
    None
):
    registro = RegistroDeDiagnostico()
    observado = RerankerDeDiagnostico(_Reranker(), registro)

    puntajes = observado.puntuar("pregunta", [_Candidato("x"), _Candidato("e")])

    assert puntajes == [0.1, 0.9]
    assert observado.version == "reranker-de-prueba@1"
    assert registro.eventos[0].pares == ("x", "e")  # type: ignore[union-attr]
    assert registro.eventos[0].puntajes == (0.1, 0.9)  # type: ignore[union-attr]


def test_el_reranker_observado_propaga_el_error_del_interno_y_no_anota_nada() -> None:
    registro = RegistroDeDiagnostico()

    with pytest.raises(FalloDeInferencia):
        RerankerDeDiagnostico(_RerankerRoto(), registro).puntuar("p", [_Candidato("x")])

    assert registro.eventos == []


def test_el_nli_observado_anota_cada_afirmacion_con_su_p_entailment_y_su_veredicto() -> None:
    registro = RegistroDeDiagnostico()
    observado = NliDeDiagnostico(_Nli(), registro, umbral=0.7)

    resultados = observado.clasificar([ParNli("p", "bien"), ParNli("p", "mal")])

    assert [r.label for r in resultados] == ["entailment", "neutral"]
    assert [(a.p_entailment, a.soportada) for a in registro.afirmaciones] == [
        (0.9, True),
        (0.2, False),
    ]
    assert observado.version == "nli-de-prueba@1"


def test_el_nli_observado_con_la_lista_vacia_devuelve_vacio_y_no_anota_nada() -> None:
    registro = RegistroDeDiagnostico()

    assert NliDeDiagnostico(_Nli(), registro, 0.7).clasificar([]) == []
    assert registro.afirmaciones == []


def test_el_generador_observado_anota_cuantas_opciones_propuso() -> None:
    class _Generador:
        async def generar(
            self, solicitud: object, recuperacion: ResultadoDeRecuperacion
        ) -> EvidenciaGenerada:
            return EvidenciaGenerada(opciones=())

    registro = RegistroDeDiagnostico()

    evidencia = asyncio.run(GeneradorDeDiagnostico(_Generador(), registro).generar(None, None))  # type: ignore[arg-type]

    assert evidencia.opciones == ()
    assert registro.opciones_propuestas == [0]


def test_los_loops_unen_las_dos_busquedas_sin_repetir_chunks_y_asocian_el_reranking() -> None:
    registro = RegistroDeDiagnostico()
    buscador = BuscadorDeDiagnostico(_Buscador([_chunk("a", 0.9), _chunk("b", 0.4)]), registro)
    reranker = RerankerDeDiagnostico(_Reranker(), registro)
    for _ in range(2):  # la pregunta y el resumen del contexto
        buscador.search_dense([0.1], 5)
    reranker.puntuar("p", [_Candidato("a")])

    (loop,) = registro.loops()

    assert [c.chunk_id for c in loop.candidatos] == ["a", "b"]
    assert (loop.pares, loop.puntajes) == (("a",), (0.1,))


def test_un_loop_sin_candidatos_no_tiene_reranking_y_el_siguiente_loop_empieza_limpio() -> None:
    registro = RegistroDeDiagnostico()
    vacio = BuscadorDeDiagnostico(_Buscador([]), registro)
    lleno = BuscadorDeDiagnostico(_Buscador([_chunk("a", 0.9)]), registro)
    for _ in range(2):
        vacio.search_dense([0.1], 5)
    for _ in range(2):
        lleno.search_dense([0.1], 5)
    RerankerDeDiagnostico(_Reranker(), registro).puntuar("p", [_Candidato("a")])

    primero, segundo = registro.loops()

    assert (primero.candidatos, primero.pares) == ((), None)
    assert segundo.pares == ("a",)


def test_reiniciar_deja_el_registro_vacio() -> None:
    registro = RegistroDeDiagnostico()
    BuscadorDeDiagnostico(_Buscador([_chunk("a", 0.9)]), registro).search_dense([0.1], 5)
    NliDeDiagnostico(_Nli(), registro, 0.7).clasificar([ParNli("p", "bien")])

    registro.reiniciar()

    assert (registro.eventos, registro.afirmaciones, registro.opciones_propuestas) == ([], [], [])


@pytest.mark.parametrize(
    ("observador", "puerto", "metodo"),
    [
        (BuscadorDeDiagnostico, ChunkSearch, "search_dense"),
        (RerankerDeDiagnostico, Reranker, "puntuar"),
        (GeneradorDeDiagnostico, EvidenceGenerator, "generar"),
        (NliDeDiagnostico, NliClassifier, "clasificar"),
    ],
)
def test_cada_observador_comparte_la_firma_del_puerto_que_decora(
    observador: type, puerto: type, metodo: str
) -> None:
    del_observador = inspect.signature(getattr(observador, metodo)).parameters
    del_puerto = inspect.signature(getattr(puerto, metodo)).parameters

    assert list(del_observador) == list(del_puerto)
    assert inspect.iscoroutinefunction(getattr(observador, metodo)) == inspect.iscoroutinefunction(
        getattr(puerto, metodo)
    )
