import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app.bootstrap import crear_app
from app.infrastructure.security.clave_publica import ClavePublicaServicioInvalida
from tests.support.contract import RAIZ_REPOSITORIO
from tests.support.fakes import par_de_sesion, settings_de_prueba
from tests.support.service_jwt import escribir_clave_publica

EJEMPLOS = RAIZ_REPOSITORIO / "contracts/examples"
CENTINELA = "SENTINELA-CLAVE-PRIVADA"


def _publica_pem(clave) -> bytes:
    return clave.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )


def _archivo(tmp_path, contenido: bytes):
    ruta = tmp_path / "clave.pem"
    ruta.write_bytes(contenido)
    return ruta


def test_arranque_acepta_la_clave_publica_ec_p256_con_llm_provider_fake(tmp_path):
    ruta = escribir_clave_publica(par_de_sesion(), tmp_path)

    crear_app(
        settings_de_prueba(
            llm_provider="fake", fake_responses_path=EJEMPLOS, service_jwt_public_key_file=ruta
        )
    )


@pytest.mark.parametrize("llm_provider", ["fake", "local"])
def test_arranque_falla_nombrando_la_variable_cuando_no_hay_archivo_de_clave_publica(llm_provider):
    settings = settings_de_prueba(
        llm_provider=llm_provider, fake_responses_path=EJEMPLOS, service_jwt_public_key_file=None
    )

    with pytest.raises(
        ClavePublicaServicioInvalida, match="SERVICE_JWT_PUBLIC_KEY_FILE no está configurada"
    ):
        crear_app(settings)


def test_arranque_falla_cuando_el_archivo_de_clave_publica_no_existe(tmp_path):
    with pytest.raises(ClavePublicaServicioInvalida, match="no se puede leer"):
        crear_app(settings_de_prueba(service_jwt_public_key_file=tmp_path / "no-existe.pem"))


def test_arranque_falla_sin_eco_del_contenido_cuando_el_archivo_no_es_pem(tmp_path):
    ruta = _archivo(tmp_path, CENTINELA.encode())

    with pytest.raises(ClavePublicaServicioInvalida) as error:
        crear_app(settings_de_prueba(service_jwt_public_key_file=ruta))

    assert CENTINELA not in str(error.value)
    assert error.value.__cause__ is None


@pytest.mark.parametrize(
    "clave",
    [
        rsa.generate_private_key(public_exponent=65537, key_size=2048),
        ec.generate_private_key(ec.SECP384R1()),
    ],
    ids=["rsa", "ec_p384"],
)
def test_arranque_falla_cuando_la_clave_publica_no_es_ec_p256(clave, tmp_path):
    ruta = _archivo(tmp_path, _publica_pem(clave))

    with pytest.raises(ClavePublicaServicioInvalida, match="EC P-256"):
        crear_app(settings_de_prueba(service_jwt_public_key_file=ruta))


def test_arranque_falla_cuando_el_archivo_contiene_la_clave_privada_en_lugar_de_la_publica(
    tmp_path,
):
    ruta = _archivo(tmp_path, par_de_sesion().privada_pem)

    with pytest.raises(ClavePublicaServicioInvalida):
        crear_app(settings_de_prueba(service_jwt_public_key_file=ruta))
