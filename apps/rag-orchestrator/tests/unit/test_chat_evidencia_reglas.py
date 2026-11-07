"""Reglas puras del turno de evidencia del chat (US-265 / L1D-322): sin adapters."""

from app.domain.chat.bloques_de_evidencia import (
    CriterioParaMostrar,
    texto_de_la_opcion,
    texto_de_los_faltantes,
)
from app.domain.chat.estado import (
    EstadoDelHilo,
    TurnoPrevio,
    UltimaEvidencia,
    estado_tras_el_turno,
)
from app.domain.chat.ultima_evidencia import resumir_ultima_evidencia

TURNO = TurnoPrevio("p1", "evidencia", ("texto",), ())


def test_resumen_conserva_el_orden_del_reranker_y_el_puntaje_cuando_hubo_evidencia():
    ultima = resumir_ultima_evidencia("¿Qué evidencia hay?", ["c2", "c1"], 0.87)

    assert ultima == UltimaEvidencia("¿Qué evidencia hay?", ("c2", "c1"), 0.87)


def test_resumen_deja_el_puntaje_en_none_y_no_en_cero_cuando_ningun_chunk_supero_el_umbral():
    ultima = resumir_ultima_evidencia("¿Qué evidencia hay?", ["c1"], None)

    assert ultima.top_relevance_score is None
    assert ultima.top_relevance_score != 0.0


def test_resumen_no_tiene_ningun_campo_de_identificador_de_analisis():
    campos = set(UltimaEvidencia.__dataclass_fields__)

    assert campos == {"query", "chunk_ids", "top_relevance_score"}


def test_texto_de_la_opcion_encabeza_y_dice_el_estado_por_criterio_con_la_causa_del_dato_ausente():
    criterios = [
        CriterioParaMostrar("estado_her2", "coincide"),
        CriterioParaMostrar("estado_menopausico", "desconocido", "falta_en_paciente"),
        CriterioParaMostrar("estadio", "desconocido", "sin_regla_de_comparacion"),
        CriterioParaMostrar("ecog", "no_coincide"),
    ]

    texto = texto_de_la_opcion(2, 3, "Opción B", "Razón B.", criterios)

    assert texto.splitlines() == [
        "Opciones descritas en la evidencia: opción 2 de 3.",
        "Opción B. Razón B.",
        "Aplicabilidad al paciente por criterio: estado her2: Coincide; "
        "estado menopausico: Desconocido (falta en el paciente); estadio: Desconocido; ecog: No coincide.",
    ]


def test_texto_de_la_opcion_omite_la_aplicabilidad_cuando_no_hay_criterios():
    assert texto_de_la_opcion(1, 1, "A", "R.", []).splitlines() == [
        "Opciones descritas en la evidencia: opción 1 de 1.",
        "A. R.",
    ]


def test_texto_de_los_faltantes_lista_sin_repetir_los_criterios_por_dato_ausente():
    criterios = [
        CriterioParaMostrar("estado_menopausico", "desconocido", "falta_en_paciente"),
        CriterioParaMostrar("estado_menopausico", "desconocido", "falta_en_paciente"),
        CriterioParaMostrar("estadio", "desconocido", "sin_regla_de_comparacion"),
    ]

    assert texto_de_los_faltantes(criterios) == (
        "Datos que faltan del paciente para comparar: estado menopausico."
    )
    assert texto_de_los_faltantes([CriterioParaMostrar("ecog", "coincide")]) is None


def test_estado_sobrescribe_la_ultima_evidencia_y_suma_opciones_y_citas_sin_repetir_cuando_el_turno_recupera():
    previo = estado_tras_el_turno(
        EstadoDelHilo(),
        TURNO,
        ultima_evidencia=UltimaEvidencia("p0", ("c9",), 0.5),
        opciones_mostradas=("O1",),
        citas_mostradas=("c1",),
    )

    estado = estado_tras_el_turno(
        previo,
        TURNO,
        ultima_evidencia=UltimaEvidencia("p1", ("c1", "c2"), None),
        opciones_mostradas=("O1", "O2"),
        citas_mostradas=("c1", "c2", "c2"),
    )

    assert estado.estructurado.ultima_evidencia == UltimaEvidencia("p1", ("c1", "c2"), None)
    assert estado.estructurado.opciones_mostradas == ("O1", "O2")
    assert estado.estructurado.citas_mostradas == ("c1", "c2")


def test_estado_conserva_la_ultima_evidencia_cuando_el_turno_no_recupera():
    previo = estado_tras_el_turno(
        EstadoDelHilo(), TURNO, ultima_evidencia=UltimaEvidencia("p0", ("c9",), 0.5)
    )

    estado = estado_tras_el_turno(previo, TurnoPrevio("p2", "caso", ("x",), ("f1",)))

    assert estado.estructurado.ultima_evidencia == UltimaEvidencia("p0", ("c9",), 0.5)
