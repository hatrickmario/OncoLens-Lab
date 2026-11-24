"""Adapter de bge-reranker-v2-m3 (US-231a AC-2, AC-5): sigmoide, orden, límite de pares, truncado y errores."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.application.ports import ChunkEncontrado, FalloDeInferencia
from app.infrastructure.reranker.bge_reranker import BgeReranker
from tests.support.inferencia_falsa import (
    ID_SEP,
    SesionDeLogitsFalsa,
    TokenizadorFalso,
    id_de_palabra,
)

TEXTO_SECRETO = "texto-clinico-que-no-debe-salir-en-el-error"


def _chunk(texto: str, id_: str = "c") -> ChunkEncontrado:
    return ChunkEncontrado(chunk_id=id_, document_id="d", chunk_text=texto, similitud_dense=0.1)


def _reranker(
    sesion: object | None = None, codificador: object | None = None, **cambios: object
) -> BgeReranker:
    valores: dict[str, object] = {
        "version": "BAAI/bge-reranker-v2-m3@rev#sha256:abc",
        "max_length": 64,
        "max_pairs": 12,
        "max_tokens_por_lote": 4096,
        **cambios,
    }
    return BgeReranker(
        sesion or SesionDeLogitsFalsa(),  # type: ignore[arg-type]
        codificador or TokenizadorFalso(),  # type: ignore[arg-type]
        **valores,  # type: ignore[arg-type]
    )


def _sigmoide(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def test_expone_la_version_recibida_de_la_configuracion() -> None:
    assert _reranker().version == "BAAI/bge-reranker-v2-m3@rev#sha256:abc"


def test_normaliza_cada_logit_con_sigmoide_en_el_orden_de_los_candidatos() -> None:
    reranker = _reranker(sesion=SesionDeLogitsFalsa(logits=[2.0, -1.0, 0.0]))

    puntajes = reranker.puntuar("pregunta", [_chunk("a"), _chunk("b"), _chunk("c")])

    assert puntajes == pytest.approx([_sigmoide(2.0), _sigmoide(-1.0), 0.5])


def test_un_logit_muy_negativo_da_un_puntaje_en_cero_y_uno_muy_positivo_en_uno_sin_desbordar() -> (
    None
):
    reranker = _reranker(sesion=SesionDeLogitsFalsa(logits=[-1000.0, 1000.0]))

    assert reranker.puntuar("p", [_chunk("a"), _chunk("b")]) == [0.0, 1.0]


def test_envia_al_modelo_la_pareja_pregunta_pasaje() -> None:
    codificador = TokenizadorFalso()

    _reranker(codificador=codificador).puntuar("her2 mama", [_chunk("anti her2")])

    assert codificador.llamadas == [("her2 mama", "anti her2")]


def test_el_puntaje_de_cada_candidato_no_depende_de_la_posicion_ni_del_lote() -> None:
    candidatos = [
        _chunk("her2 mama cancer"),
        _chunk("x"),
        _chunk("her2 her2 mama uno dos tres cuatro"),
    ]
    solos = [_reranker().puntuar("her2 mama", [c])[0] for c in candidatos]

    en_lotes = _reranker(max_tokens_por_lote=12).puntuar("her2 mama", candidatos)

    assert en_lotes == pytest.approx(solos)


def test_mas_pares_que_el_maximo_falla_con_el_error_del_puerto_sin_truncar_en_silencio() -> None:
    sesion = SesionDeLogitsFalsa()
    reranker = _reranker(sesion=sesion, max_pairs=2)

    with pytest.raises(FalloDeInferencia):
        reranker.puntuar("p", [_chunk("a"), _chunk("b"), _chunk("c")])

    assert sesion.lotes == []


def test_sin_candidatos_devuelve_lista_vacia_sin_invocar_al_modelo() -> None:
    sesion = SesionDeLogitsFalsa()

    assert _reranker(sesion=sesion).puntuar("p", []) == []
    assert sesion.lotes == []


def test_trunca_cada_par_al_maximo_conservando_el_separador_final() -> None:
    sesion = SesionDeLogitsFalsa()

    _reranker(sesion=sesion, max_length=8).puntuar("uno dos", [_chunk("a b c d e f g h i j k l")])

    secuencia = sesion.lotes[0][0]
    assert len(secuencia) == 8 and secuencia[-1] == ID_SEP


@pytest.mark.parametrize(
    "salida",
    [
        np.array([[np.nan]], dtype=np.float32),
        np.array([[np.inf]], dtype=np.float32),
        np.array([[1.0], [2.0]], dtype=np.float32),
        np.array([[1.0, 2.0]], dtype=np.float32),
    ],
    ids=["nan", "infinito", "lote-de-mas", "dos-columnas"],
)
def test_una_salida_no_finita_o_con_forma_inesperada_falla_en_vez_de_inventar_un_puntaje(
    salida: np.ndarray,
) -> None:
    class SesionFija:
        def ejecutar(self, secuencias):
            return salida

    with pytest.raises(FalloDeInferencia):
        _reranker(sesion=SesionFija()).puntuar("p", [_chunk("a")])


@pytest.mark.parametrize("origen", ["sesion", "codificador"])
def test_un_fallo_del_modelo_se_traduce_al_error_del_puerto_sin_texto_ni_causa(origen: str) -> None:
    causa = RuntimeError(TEXTO_SECRETO)
    reranker = _reranker(
        sesion=SesionDeLogitsFalsa(error=causa if origen == "sesion" else None),
        codificador=TokenizadorFalso(error=causa if origen == "codificador" else None),
    )

    with pytest.raises(FalloDeInferencia) as error:
        reranker.puntuar(TEXTO_SECRETO, [_chunk(TEXTO_SECRETO)])

    assert TEXTO_SECRETO not in f"{error.value} {error.value!r}"
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True


# --- US-278: RERANKER_CHUNK_WINDOWS = maximo (los tests de ``primera`` de arriba quedan sin tocar) ----------------------

PREGUNTA_CORTA = (
    "uno dos"  # con los 4 especiales del par: capacidad = max_length - 4 - 2 por ventana
)
PASAJE_LARGO = " ".join(f"p{i}" for i in range(20))


def _maximo(sesion: object | None = None, **cambios: object) -> BgeReranker:
    return _reranker(
        sesion=sesion,
        modo_de_ventanas="maximo",
        solape=cambios.pop("solape", 2),
        max_length=cambios.pop("max_length", 12),
        **cambios,
    )


def _secuencias_de(sesion: SesionDeLogitsFalsa) -> list[list[int]]:
    return [secuencia for lote in sesion.lotes for secuencia in lote]


def test_maximo_envia_una_sola_secuencia_identica_a_la_de_primera_cuando_el_par_cabe() -> None:
    sesion_primera, sesion_maximo = SesionDeLogitsFalsa(), SesionDeLogitsFalsa()

    con_primera = _reranker(sesion=sesion_primera, max_length=12).puntuar(
        PREGUNTA_CORTA, [_chunk("p0 p1 p2")]
    )
    con_maximo = _maximo(sesion_maximo).puntuar(PREGUNTA_CORTA, [_chunk("p0 p1 p2")])

    assert sesion_maximo.lotes == sesion_primera.lotes
    assert len(sesion_maximo.lotes[0]) == 1
    assert con_maximo == con_primera


def test_maximo_envia_ventanas_que_cubren_el_pasaje_y_no_pasan_de_max_length() -> None:
    sesion = SesionDeLogitsFalsa()

    _maximo(sesion).puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])

    secuencias = _secuencias_de(sesion)
    assert len(secuencias) > 1 and all(len(s) <= 12 for s in secuencias)
    assert all(
        s[0] == 0 and s[-1] == ID_SEP for s in secuencias
    )  # cada ventana lleva pregunta y especiales
    cubiertos = {i for s in secuencias for i in s[s.index(ID_SEP) + 2 : -1]}
    assert cubiertos == {id_de_palabra(f"p{i}") for i in range(20)}


def test_maximo_puntua_el_chunk_con_el_mayor_logit_de_sus_ventanas_normalizado_una_sola_vez() -> (
    None
):
    sesion = SesionDeLogitsFalsa(logits=[-1.0, 0.5, 2.0, -3.0, 0.0, 0.0])  # sobran: no se usan

    puntajes = _maximo(sesion, solape=2).puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])

    ventanas = len(_secuencias_de(sesion))
    esperado = max([-1.0, 0.5, 2.0, -3.0, 0.0, 0.0][:ventanas])
    assert puntajes == pytest.approx([_sigmoide(esperado)])


def test_maximo_devuelve_un_puntaje_por_candidato_en_el_orden_recibido_con_chunks_cortos_y_largos() -> (
    None
):
    candidatos = [
        _chunk(PASAJE_LARGO, "largo"),
        _chunk("p0", "corto"),
        _chunk(PASAJE_LARGO[::-1], "otro"),
    ]

    en_lotes = _maximo(max_tokens_por_lote=24).puntuar(PREGUNTA_CORTA, candidatos)
    solos = [_maximo().puntuar(PREGUNTA_CORTA, [c])[0] for c in candidatos]

    assert en_lotes == pytest.approx(solos)


def test_maximo_cuenta_candidatos_y_no_ventanas_contra_el_maximo_de_pares() -> None:
    reranker = _maximo(SesionDeLogitsFalsa(), max_pairs=2)

    dos = reranker.puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO, "a"), _chunk(PASAJE_LARGO, "b")])

    assert len(dos) == 2
    with pytest.raises(FalloDeInferencia):
        reranker.puntuar(PREGUNTA_CORTA, [_chunk("p0", "a"), _chunk("p1", "b"), _chunk("p2", "c")])


@pytest.mark.parametrize("mala", [np.nan, np.inf, -np.inf])
def test_maximo_falla_con_el_error_del_puerto_cuando_una_sola_ventana_no_tiene_logit_finito(
    mala: float,
) -> None:
    class SesionConUnaVentanaMala:
        def ejecutar(self, secuencias):
            salida = np.zeros((len(secuencias), 1), dtype=np.float32)
            salida[-1, 0] = mala
            return salida

    with pytest.raises(FalloDeInferencia):
        _maximo(SesionConUnaVentanaMala()).puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])


@pytest.mark.parametrize(
    "cambios",
    [{"solape": 6}, {"solape": 9}, {"max_length": 6}],
    ids=["solape-igual-que-la-capacidad", "solape-mayor", "la-pregunta-llena-la-ventana"],
)
def test_maximo_falla_cerrado_cuando_las_ventanas_no_pueden_avanzar(
    cambios: dict[str, int],
) -> None:
    with pytest.raises(FalloDeInferencia) as error:
        _maximo(**cambios).puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])  # type: ignore[arg-type]

    assert PASAJE_LARGO not in f"{error.value} {error.value!r}"


def test_maximo_con_un_pasaje_vacio_envia_la_secuencia_sin_pasaje_en_vez_de_fallar() -> None:
    sesion = SesionDeLogitsFalsa()

    puntajes = _maximo(sesion).puntuar(PREGUNTA_CORTA, [_chunk("")])

    assert len(puntajes) == 1 and len(sesion.lotes[0]) == 1


def test_maximo_da_el_mismo_resultado_en_dos_ejecuciones_y_con_otro_presupuesto_de_lote() -> None:
    candidatos = [_chunk(PASAJE_LARGO, "a"), _chunk(PASAJE_LARGO[::-1], "b")]

    uno = _maximo(max_tokens_por_lote=12).puntuar(PREGUNTA_CORTA, candidatos)
    otro = _maximo(max_tokens_por_lote=4096).puntuar(PREGUNTA_CORTA, candidatos)

    assert uno == otro


def test_una_variante_comparte_la_sesion_y_el_tokenizador_y_cambia_solo_la_etapa_pedida() -> None:
    sesion = SesionDeLogitsFalsa()
    base = _reranker(sesion=sesion, max_length=12)

    variante = base.variante(modo_de_ventanas="maximo", solape=2)
    variante.puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])
    base.puntuar(PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)])

    assert variante.version == base.version
    assert len(sesion.lotes[0]) > 1  # la variante usó ventanas sobre la sesión de la base
    assert len(sesion.lotes[1]) == 1  # la base sigue en primera


def test_una_variante_con_otro_max_length_trunca_a_ese_largo() -> None:
    sesion = SesionDeLogitsFalsa()

    _reranker(sesion=sesion, max_length=8).variante(max_length=16).puntuar(
        PREGUNTA_CORTA, [_chunk(PASAJE_LARGO)]
    )

    assert len(sesion.lotes[0][0]) == 16
