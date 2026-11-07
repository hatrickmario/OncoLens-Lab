"""Hechos con intervalo (US-272): filtro de periodo, descripción y borde ``CaseFact`` → ``HechoDelCaso``. Reglas puras."""

from app.application.chat.traduccion import hechos_del_caso
from app.domain.chat.descripcion_de_hechos import describir_hecho, sentidos_del_momento
from app.domain.chat.periodo_de_la_pregunta import (
    MARCA_EN_CURSO,
    MARCA_INICIADO_ANTES_DEL_PERIODO,
    filtrar_hechos_por_periodo,
    tiene_intervalo,
)
from app.domain.chat.turno import HechoDelCaso
from app.schemas.generated.models import CaseFact


def _hecho(dia: int, fin: int | None = None, *, en_curso: bool = False) -> HechoDelCaso:
    return HechoDelCaso(
        "f1", "Quimioterapia", dia, "verificado", dia_relativo_fin=fin, en_curso=en_curso
    )


def test_filtrar_hechos_por_periodo_incluye_el_en_curso_sin_importar_su_inicio_y_lo_marca():
    (hecho,) = filtrar_hechos_por_periodo((_hecho(-172, en_curso=True),), 100)

    assert hecho.verbalizacion == (
        f"Quimioterapia {MARCA_INICIADO_ANTES_DEL_PERIODO} {MARCA_EN_CURSO}"
    )


def test_filtrar_hechos_por_periodo_marca_solo_en_curso_cuando_empezo_dentro_del_periodo():
    (hecho,) = filtrar_hechos_por_periodo((_hecho(-20, en_curso=True),), 100)

    assert hecho.verbalizacion == f"Quimioterapia {MARCA_EN_CURSO}"


def test_filtrar_hechos_por_periodo_excluye_sin_marca_el_que_termino_antes_del_periodo():
    assert filtrar_hechos_por_periodo((_hecho(-300, -200),), 100) == ()


def test_tiene_intervalo_es_verdadero_con_fin_entero_o_en_curso_y_falso_si_es_puntual():
    assert tiene_intervalo(_hecho(-5, -1))
    assert tiene_intervalo(_hecho(-5, en_curso=True))
    assert not tiene_intervalo(_hecho(-5))


def test_describir_hecho_añade_el_fin_del_intervalo_cuando_dia_relativo_fin_es_entero():
    assert describir_hecho(_hecho(-160, -60)) == (
        "Quimioterapia, 160 días antes del diagnóstico, hasta 60 días antes del diagnóstico."
    )


def test_describir_hecho_no_añade_fin_cuando_el_hecho_esta_en_curso():
    assert describir_hecho(_hecho(-160, en_curso=True)) == (
        "Quimioterapia, 160 días antes del diagnóstico."
    )


def test_sentidos_del_momento_lee_el_inicio_y_el_fin_que_escribe_describir_hecho():
    descripcion = describir_hecho(_hecho(-160, -60))

    assert sentidos_del_momento(descripcion) == {(160, "antes"), (60, "antes")}


def test_sentidos_del_momento_no_distingue_el_inicio_del_fin_de_un_intervalo():
    # Decisión documentada (US-272): «empezó 60 días antes» queda sostenido por el FIN (-60); el chequeo numérico
    # compara cifras y sentido, no su papel. Una afirmación que confunde inicio y fin la frena el NLI, no esta regla.
    descripcion = describir_hecho(_hecho(-160, -60))

    assert (60, "antes") in sentidos_del_momento("Empezó 60 días antes del diagnóstico")
    assert (60, "antes") in sentidos_del_momento(descripcion)


def _cf(**extra) -> CaseFact:
    base = {
        "factRef": "f1",
        "kind": "tratamiento",
        "verbalization": "quimioterapia",
        "relativeDay": -10,
        "reviewStatus": "verificado",
    }
    return CaseFact.model_validate({**base, **extra})


def test_hechos_del_caso_distingue_null_explicito_ausente_y_entero():
    en_curso, ausente, con_fin = hechos_del_caso(
        [_cf(relativeEndDay=None), _cf(), _cf(relativeEndDay=-3)]
    )

    assert (en_curso.en_curso, en_curso.dia_relativo_fin) == (True, None)
    assert (ausente.en_curso, ausente.dia_relativo_fin) == (False, None)
    assert (con_fin.en_curso, con_fin.dia_relativo_fin) == (False, -3)
