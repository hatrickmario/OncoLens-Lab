"""Prompts del chat (US-259, US-057): RN-23 en las plantillas, separación instrucciones/datos y sin seudónimo (RN-11)."""

from pathlib import Path

from app.domain.chat.estado import EstadoDelHilo, Intencion, TurnoPrevio
from app.domain.chat.turno import HechoDelCaso
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.prompts.chat import (
    PLANTILLA_DE_CLASIFICACION,
    PLANTILLA_DEL_TURNO,
    VERSION_DEL_PROMPT_DE_CHAT,
    armar_prompt_de_clasificacion,
    armar_prompt_del_turno,
)
from tests.support.prompt_separado import DatosDelPrompt, afirmar_separacion

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)
HECHOS = (HechoDelCaso("f1", "Carcinoma ductal infiltrante de mama", 0, "verificado"),)
TURNO = TurnoPrevio("¿Qué falta?", "faltantes", ("Falta el Ki-67.",), ("f1",))


def test_plantillas_del_chat_no_contienen_terminos_de_nivel_a_ni_b_cuando_se_verifican_sin_datos():
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    for plantilla in (PLANTILLA_DEL_TURNO, PLANTILLA_DE_CLASIFICACION):
        coincidencias = check_prohibited_terms(
            plantilla, lista, niveles=("A", "B"), permitir_frases=False
        )
        assert coincidencias == []


def test_prompt_del_turno_separa_instrucciones_y_datos_cuando_se_arma_con_memoria_y_hechos():
    estado = EstadoDelHilo(turnos=(TURNO,))
    prompt = armar_prompt_del_turno(estado, "¿Cuál es el cuadro?", HECHOS, Intencion.caso, (TURNO,))

    assert prompt.version == VERSION_DEL_PROMPT_DE_CHAT
    afirmar_separacion(
        prompt,
        DatosDelPrompt(
            pregunta="¿Cuál es el cuadro?",
            datos_del_paciente="[f1] Carcinoma ductal infiltrante de mama (día relativo 0; revisión: verificado)",
            memoria=_memoria_esperada(),
        ),
    )


def _memoria_esperada() -> str:
    return "\n".join(
        [
            "Estado de la conversación:",
            "- Intenciones vistas: No disponible",
            "- Opciones mostradas: No disponible",
            "- Citas mostradas: No disponible",
            "- Faltantes señalados: No disponible",
            "- Última evidencia: No disponible",
            "Turnos previos:",
            "Pregunta: ¿Qué falta?\nIntención: faltantes\nRespuesta: Falta el Ki-67.",
        ]
    )


def test_prompt_del_turno_es_identico_cuando_se_arma_dos_veces_con_el_mismo_estado():
    estado = EstadoDelHilo(turnos=(TURNO,))

    uno = armar_prompt_del_turno(estado, "¿p?", HECHOS, Intencion.caso, (TURNO,))
    otro = armar_prompt_del_turno(estado, "¿p?", HECHOS, Intencion.caso, (TURNO,))

    assert uno == otro


def test_prompt_de_clasificacion_lleva_solo_la_pregunta_en_su_bloque():
    prompt = armar_prompt_de_clasificacion("Necesito ayuda con este caso")

    afirmar_separacion(prompt, DatosDelPrompt(pregunta="Necesito ayuda con este caso"))
