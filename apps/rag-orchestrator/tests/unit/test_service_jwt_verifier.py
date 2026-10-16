import base64
import json

import jwt
import pytest

from app.domain.token_servicio import TokenServicioInvalido
from app.infrastructure.security.clave_publica import cargar_clave_publica_es256
from app.infrastructure.security.service_jwt_verifier import ServiceJwtVerifier
from tests.support.fakes import RelojFijo, par_de_sesion
from tests.support.service_jwt import (
    ParClavesServicio,
    generar_par_es256,
    token_alg_none,
    token_es256,
    token_hs256_con_publica,
)


def _verificador(par: ParClavesServicio, tmp_path, *, ttl: int = 60, skew: int = 5) -> ServiceJwtVerifier:
    ruta = tmp_path / "publica.pem"
    ruta.write_bytes(par.publica_pem)
    return ServiceJwtVerifier(cargar_clave_publica_es256(ruta), RelojFijo(), ttl, skew)


def _motivo(verificador: ServiceJwtVerifier, token: str | None) -> str:
    with pytest.raises(TokenServicioInvalido) as error:
        verificador.verificar(token)
    return error.value.motivo


def test_verificar_acepta_el_token_es256_con_emisor_audiencia_y_vigencia_correctos(tmp_path):
    _verificador(par_de_sesion(), tmp_path).verificar(token_es256(par_de_sesion()))


@pytest.mark.parametrize("token", [None, ""])
def test_verificar_rechaza_con_ausente_cuando_no_hay_token(token, tmp_path):
    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "ausente"


@pytest.mark.parametrize("token", ["no-es-un-jwt", "a.b.c", "a.b"])
def test_verificar_rechaza_con_malformado_cuando_el_texto_no_es_un_jwt(token, tmp_path):
    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "malformado"


def test_verificar_rechaza_con_algoritmo_cuando_alg_es_none(tmp_path):
    assert _motivo(_verificador(par_de_sesion(), tmp_path), token_alg_none()) == "algoritmo"


def test_verificar_rechaza_con_algoritmo_cuando_alg_es_hs256_firmado_con_la_clave_publica(tmp_path):
    token = token_hs256_con_publica(par_de_sesion())

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "algoritmo"


def test_verificar_rechaza_con_firma_cuando_la_firmo_otra_clave(tmp_path):
    token = token_es256(generar_par_es256())

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "firma"


def test_verificar_rechaza_con_emisor_cuando_iss_no_es_clinical_api(tmp_path):
    token = token_es256(par_de_sesion(), iss="otro-emisor")

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "emisor"


def test_verificar_rechaza_con_audiencia_cuando_aud_no_es_rag_orchestrator(tmp_path):
    token = token_es256(par_de_sesion(), aud="otro-servicio")

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "audiencia"


@pytest.mark.parametrize("claim", ["iss", "aud", "iat", "exp"])
def test_verificar_rechaza_con_malformado_cuando_falta_un_claim_obligatorio(claim, tmp_path):
    token = token_es256(par_de_sesion(), omitir=(claim,))

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "malformado"


def test_verificar_rechaza_con_expirado_cuando_el_token_vencio(tmp_path):
    token = token_es256(par_de_sesion(), iat_desfase=-7200)

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "expirado"


def test_verificar_rechaza_con_vida_maxima_cuando_exp_menos_iat_supera_el_ttl_configurado(tmp_path):
    token = token_es256(par_de_sesion(), vida=61)

    assert _motivo(_verificador(par_de_sesion(), tmp_path, ttl=60), token) == "vida_maxima"


def test_verificar_rechaza_con_malformado_cuando_exp_no_es_un_entero(tmp_path):
    par = par_de_sesion()
    claims = {"iss": "clinical-api", "aud": "rag-orchestrator", "iat": 1_792_152_000, "exp": "1792152060"}
    token = jwt.encode(claims, par.privada_pem, algorithm="ES256")

    assert _motivo(_verificador(par, tmp_path), token) == "malformado"


def test_verificar_ignora_las_cabeceras_que_apuntan_a_claves_externas(tmp_path):
    par = par_de_sesion()
    token = token_es256(par)
    cabecera, cuerpo, firma = token.split(".")
    datos = json.loads(base64.urlsafe_b64decode(cabecera + "=="))
    datos.update({"jku": "http://atacante.test/jwks.json", "x5u": "http://atacante.test/cert", "kid": "otra"})
    nueva = base64.urlsafe_b64encode(json.dumps(datos).encode()).rstrip(b"=").decode()

    # La firma ya no corresponde a la nueva cabecera: se rechaza por firma, sin resolver ninguna URL.
    assert _motivo(_verificador(par, tmp_path), f"{nueva}.{cuerpo}.{firma}") == "firma"


def test_verificar_rechaza_con_audiencia_cuando_aud_es_una_lista_que_incluye_rag_orchestrator(tmp_path):
    token = token_es256(par_de_sesion(), aud=["rag-orchestrator", "otro-servicio"])  # type: ignore[arg-type]

    assert _motivo(_verificador(par_de_sesion(), tmp_path), token) == "audiencia"


def test_verificar_rechaza_con_malformado_cuando_el_token_trae_nbf(tmp_path):
    par = par_de_sesion()
    claims = {"iss": "clinical-api", "aud": "rag-orchestrator", "iat": 1_792_152_000, "exp": 1_792_152_060, "nbf": 1_792_152_000}
    token = jwt.encode(claims, par.privada_pem, algorithm="ES256")

    assert _motivo(_verificador(par, tmp_path), token) == "malformado"
