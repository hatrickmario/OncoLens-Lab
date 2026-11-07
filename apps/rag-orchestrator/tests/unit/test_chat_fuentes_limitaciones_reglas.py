"""Reglas puras del turno de fuentes y limitaciones (US-266, RN-04, RN-25, FR-10): sin adapters."""

from dataclasses import replace
from datetime import date

from app.domain.chat.bloques_de_evidencia import CriterioParaMostrar
from app.domain.chat.estado import (
    EstadoDelHilo,
    LimitacionesDelAnalisis,
    TurnoPrevio,
    UltimaEvidencia,
    estado_tras_el_turno,
)
from app.domain.chat.fuentes_limitaciones import (
    FRASE_DE_APLICABILIDAD,
    chunks_citados,
    limitaciones_del_analisis,
    texto_de_la_fuente,
    texto_de_limitaciones_de_la_evidencia,
    texto_de_limitaciones_de_la_recuperacion,
)
from tests.support.recuperacion import FICHAS_FX06A

FICHA = FICHAS_FX06A["doc-m1"]


def test_texto_de_la_fuente_copia_los_metadatos_de_la_ficha_cuando_estan_todos():
    assert texto_de_la_fuente(FICHA) == (
        "Fuente: Breast Cancer Treatment (test). Nombre de la fuente: NCI PDQ. Año de publicación: 2025. "
        "Idioma: en. Licencia: dominio_publico."
    )


def test_texto_de_la_fuente_dice_no_disponible_en_el_anio_cuando_la_ficha_no_tiene_fecha():
    texto = texto_de_la_fuente(replace(FICHA, published_at=None))

    assert "Año de publicación: No disponible." in texto
    assert "Idioma: en." in texto


def test_texto_de_la_fuente_dice_no_disponible_en_todo_cuando_el_documento_no_tiene_ficha():
    assert texto_de_la_fuente(None) == (
        "Fuente: No disponible. Nombre de la fuente: No disponible. Año de publicación: No disponible. "
        "Idioma: No disponible. Licencia: No disponible."
    )


def test_texto_de_la_fuente_dice_no_disponible_cuando_un_metadato_llega_vacio():
    assert "Nombre de la fuente: No disponible." in texto_de_la_fuente(
        replace(FICHA, source_name="")
    )


def test_limitaciones_de_la_recuperacion_lista_las_fuentes_no_incluidas_por_su_nombre():
    texto = texto_de_limitaciones_de_la_recuperacion(date(2026, 9, 30), ("NCCN", "ESMO"), 41)

    assert texto == (
        "Alcance de la recuperación: el corpus tiene fecha de corte 2026-09-30; fuentes no incluidas: NCCN, ESMO; "
        "fragmentos de evidencia evaluados en la última consulta: 41."
    )


def test_limitaciones_de_la_recuperacion_dice_ninguna_registrada_cuando_no_hay_fuentes_no_incluidas():
    texto = texto_de_limitaciones_de_la_recuperacion(date(2026, 9, 30), (), 0)

    assert "fuentes no incluidas: ninguna declarada en la release vigente;" in texto
    assert texto.endswith("evaluados en la última consulta: 0.")


def test_limitaciones_del_analisis_cuenta_solo_los_criterios_desconocidos_sin_repetirlos():
    criterios = [
        CriterioParaMostrar("estado_menopausico", "desconocido", "falta_en_paciente"),
        CriterioParaMostrar("her2", "coincide"),
        CriterioParaMostrar("estado_menopausico", "desconocido"),
        CriterioParaMostrar("ki_67", "desconocido"),
    ]

    resultado = limitaciones_del_analisis(criterios, 1)

    assert resultado == LimitacionesDelAnalisis(("estado menopausico", "ki 67"), 1)


def test_limitaciones_de_la_evidencia_nombra_criterios_y_descartadas_cuando_el_analisis_esta_en_el_estado():
    texto = texto_de_limitaciones_de_la_evidencia(
        LimitacionesDelAnalisis(("estado menopausico", "ki 67"), 1)
    )

    assert texto == (
        "Limitaciones de la evidencia: criterios de aplicabilidad en estado Desconocido: estado menopausico, ki 67; "
        f"opciones descartadas por falta de soporte: 1. {FRASE_DE_APLICABILIDAD}."
    )


def test_limitaciones_de_la_evidencia_dice_que_ningun_criterio_quedo_desconocido_cuando_la_lista_esta_vacia():
    texto = texto_de_limitaciones_de_la_evidencia(LimitacionesDelAnalisis((), 0))

    assert (
        "ningún criterio de aplicabilidad quedó en estado Desconocido; opciones descartadas"
        in texto
    )


def test_limitaciones_de_la_evidencia_remite_al_analisis_registrado_cuando_no_hay_analisis_en_el_estado():
    texto = texto_de_limitaciones_de_la_evidencia(None)

    assert "análisis registrado de esta conversación" in texto
    assert texto.endswith(f"{FRASE_DE_APLICABILIDAD}.")
    assert "descartadas por falta de soporte" not in texto


def test_chunks_citados_conserva_el_orden_del_reranker_y_solo_los_mostrados_como_cita():
    ultima = UltimaEvidencia("p", ("c3", "c1", "c2", "c1"), 0.5)

    assert chunks_citados(ultima, ["c2", "c3", "c9"]) == ("c3", "c2")


def test_estado_tras_el_turno_conserva_las_limitaciones_del_analisis_cuando_el_turno_no_las_trae():
    turno = TurnoPrevio("p", "evidencia")
    limitaciones = LimitacionesDelAnalisis(("a",), 2)
    con_analisis = estado_tras_el_turno(
        EstadoDelHilo(), turno, limitaciones_del_analisis=limitaciones
    )

    despues = estado_tras_el_turno(con_analisis, TurnoPrevio("q", "fuentes_limitaciones"))

    assert despues.limitaciones_del_analisis == limitaciones


def test_texto_de_la_fuente_repite_no_disponible_cinco_veces_cuando_no_hay_ficha():
    assert texto_de_la_fuente(None).count("No disponible") == 5


def test_limitaciones_del_analisis_recuerda_que_no_hubo_opciones_cuando_el_analisis_no_las_produjo():
    resultado = limitaciones_del_analisis([], 0, hubo_opciones=False)

    assert resultado == LimitacionesDelAnalisis((), 0, False)


def test_limitaciones_de_la_evidencia_dice_que_no_produjo_opciones_sin_afirmar_criterios_cuando_no_hubo_opciones():
    texto = texto_de_limitaciones_de_la_evidencia(LimitacionesDelAnalisis((), 0, False))

    assert "el último análisis no produjo opciones" in texto
    assert "ningún criterio" not in texto
    assert texto.endswith(f"{FRASE_DE_APLICABILIDAD}.")


def test_estado_tras_el_turno_reemplaza_las_limitaciones_cuando_un_analisis_nuevo_no_produjo_opciones():
    viejo = LimitacionesDelAnalisis(("a",), 2)
    nuevo = LimitacionesDelAnalisis((), 0, False)
    con_viejo = estado_tras_el_turno(
        EstadoDelHilo(), TurnoPrevio("p", "evidencia"), limitaciones_del_analisis=viejo
    )

    despues = estado_tras_el_turno(
        con_viejo, TurnoPrevio("q", "evidencia"), limitaciones_del_analisis=nuevo
    )

    assert despues.limitaciones_del_analisis == nuevo
