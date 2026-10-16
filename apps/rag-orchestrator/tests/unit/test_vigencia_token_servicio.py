import pytest

from app.domain.token_servicio import TokenServicioInvalido, vigencia_dentro_del_maximo
from tests.support.service_jwt import AHORA

IAT = int(AHORA.timestamp())
TTL = 60
SKEW = 5


def _verificar(iat: int, exp: int) -> None:
    vigencia_dentro_del_maximo(iat, exp, AHORA, ttl_seconds=TTL, skew_seconds=SKEW)


def test_vigencia_acepta_el_token_emitido_ahora_con_la_vida_maxima():
    _verificar(IAT, IAT + TTL)


def test_vigencia_rechaza_con_vida_maxima_cuando_exp_menos_iat_supera_el_ttl():
    with pytest.raises(TokenServicioInvalido) as error:
        _verificar(IAT, IAT + 3600)

    assert error.value.motivo == "vida_maxima"


def test_vigencia_rechaza_con_expirado_cuando_exp_ya_paso_mas_alla_de_la_tolerancia():
    with pytest.raises(TokenServicioInvalido) as error:
        _verificar(IAT - 120, IAT - 120 + TTL)

    assert error.value.motivo == "expirado"


def test_vigencia_acepta_un_exp_vencido_dentro_de_la_tolerancia_de_reloj():
    _verificar(IAT - TTL - SKEW + 1, IAT - SKEW + 1)


def test_vigencia_rechaza_con_expirado_cuando_exp_es_igual_al_limite_de_la_tolerancia():
    with pytest.raises(TokenServicioInvalido) as error:
        _verificar(IAT - TTL - SKEW, IAT - SKEW)

    assert error.value.motivo == "expirado"


def test_vigencia_rechaza_con_malformado_cuando_iat_esta_en_el_futuro_mas_alla_de_la_tolerancia():
    with pytest.raises(TokenServicioInvalido) as error:
        _verificar(IAT + SKEW + 1, IAT + SKEW + 1 + TTL)

    assert error.value.motivo == "malformado"


def test_vigencia_acepta_un_iat_en_el_futuro_dentro_de_la_tolerancia_de_reloj():
    _verificar(IAT + SKEW, IAT + SKEW + TTL)

