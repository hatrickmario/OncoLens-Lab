"""Prompt `chat-caso@0.1.0` (US-260, US-057, RN-23, RN-24): separación instrucciones/datos, memoria solo por ``memoria()``."""

from pathlib import Path

from app.domain.chat.estado import EstadoDelHilo, TurnoPrevio
from app.domain.chat.turno import HechoDelCaso
from app.domain.lenguaje import ListaTerminos, check_prohibited_terms
from app.prompts.chat import texto_de_la_memoria, texto_de_los_hechos
from app.prompts.chat_caso import (
    PLANTILLA_DEL_CASO,
    VERSION_DEL_PROMPT_DE_CASO,
    armar_prompt_del_caso,
)
from tests.support.prompt_separado import DatosDelPrompt, afirmar_separacion

LISTA = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "clinical-catalogs"
    / "lenguaje"
    / "terminos-prohibidos.json"
)
HECHOS = (
    HechoDelCaso("f1", "Carcinoma ductal infiltrante de mama", 0, "verificado"),
    HechoDelCaso("f2", "HER2: 3+ (IHQ), relevante", 0, "auto_aceptado", serie="her2"),
)
TURNO = TurnoPrevio("¿Qué falta?", "faltantes", ("Falta el Ki-67.",), ("f1",))


def test_plantilla_del_caso_no_contiene_terminos_de_nivel_a_ni_b_cuando_se_verifica_sin_datos():
    lista = ListaTerminos.model_validate_json(LISTA.read_text(encoding="utf-8"))

    coincidencias = check_prohibited_terms(
        PLANTILLA_DEL_CASO, lista, niveles=("A", "B"), permitir_frases=False
    )

    assert coincidencias == []


def test_prompt_del_caso_separa_instrucciones_y_datos_cuando_se_arma_con_memoria_y_hechos():
    estado = EstadoDelHilo(turnos=(TURNO,))

    prompt = armar_prompt_del_caso(estado, "¿Cuál es el cuadro?", HECHOS, (TURNO,))

    assert prompt.version == VERSION_DEL_PROMPT_DE_CASO == "chat-caso@0.2.0"
    afirmar_separacion(
        prompt,
        DatosDelPrompt(
            pregunta="¿Cuál es el cuadro?",
            datos_del_paciente=texto_de_los_hechos(HECHOS),
            memoria=texto_de_la_memoria(estado, (TURNO,)),
        ),
    )


def test_prompt_del_caso_mantiene_el_sistema_cuando_cambian_la_pregunta_y_los_hechos():
    estado = EstadoDelHilo()

    uno = armar_prompt_del_caso(estado, "¿p1?", HECHOS, ())
    otro = armar_prompt_del_caso(estado, "¿p2?", HECHOS[:1], ())

    assert uno.sistema == otro.sistema


def test_prompt_del_caso_es_identico_cuando_se_arma_dos_veces_con_el_mismo_estado():
    estado = EstadoDelHilo(turnos=(TURNO,))

    uno = armar_prompt_del_caso(estado, "¿p?", HECHOS, (TURNO,))
    otro = armar_prompt_del_caso(estado, "¿p?", HECHOS, (TURNO,))

    assert uno == otro


def test_prompt_del_caso_no_pide_citas_ni_deja_la_memoria_como_soporte_cuando_se_lee_su_sistema():
    sistema = armar_prompt_del_caso(EstadoDelHilo(), "¿p?", HECHOS, ()).sistema

    assert 'Deja "citations" vacío' in sistema
    assert "no sustenta ninguna afirmación" in sistema
