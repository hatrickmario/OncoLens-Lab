import jwt

from tests.support.service_jwt import (
    AHORA,
    AUDIENCIA,
    EMISOR,
    VARIANTES_INVALIDAS,
    cabecera_bearer,
    generar_par_es256,
    token_alg_none,
    token_es256,
    token_hs256_con_publica,
)


def test_token_es256_se_verifica_con_la_publica_y_lleva_solo_los_claims_del_contrato():
    par = generar_par_es256()

    claims = jwt.decode(
        token_es256(par),
        par.publica_pem,
        algorithms=["ES256"],
        audience=AUDIENCIA,
        issuer=EMISOR,
        options={"verify_exp": False, "verify_iat": False},
    )

    assert set(claims) == {"iss", "aud", "iat", "exp"}
    assert claims["iat"] == int(AHORA.timestamp())
    assert claims["exp"] == claims["iat"] + 60


def test_token_alg_none_y_hs256_declaran_su_algoritmo_en_la_cabecera():
    par = generar_par_es256()

    assert jwt.get_unverified_header(token_alg_none())["alg"] == "none"
    assert jwt.get_unverified_header(token_hs256_con_publica(par))["alg"] == "HS256"


def test_variantes_invalidas_incluyen_la_ausencia_de_cabecera_y_el_resto_lleva_bearer():
    par = generar_par_es256()

    cabeceras = {nombre: construir(par) for nombre, construir in VARIANTES_INVALIDAS.items()}

    assert cabeceras["sin_cabecera"] == {}
    assert all(
        c["Authorization"].startswith("Bearer ")
        for n, c in cabeceras.items()
        if n != "sin_cabecera"
    )
    assert cabecera_bearer("x") == {"Authorization": "Bearer x"}
