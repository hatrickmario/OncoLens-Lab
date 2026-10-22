"""Un fallo de configuración al arrancar como eventos `configuracion_invalida` (US-037 AC-2, design D2).

Cada evento nombra la variable y la regla incumplida y NUNCA el valor recibido: ni en `regla` ni en ningún otro campo.
"""

from pydantic import ValidationError

MOTIVO_VALOR_INVALIDO = "valor_invalido"
MOTIVO_VARIABLE_AUSENTE = "variable_ausente"
MOTIVO_CATALOGO_NO_DISPONIBLE = "catalogo_no_disponible"
MOTIVO_TIPO_NO_EN_CATALOGO = "tipo_no_en_catalogo"
_PREFIJO_DE_VALIDADOR = "Value error, "


def describir_errores(error: ValidationError) -> list[dict[str, str]]:
    return [_describir(e) for e in error.errors(include_url=False, include_context=False)]


def _describir(detalle: dict) -> dict[str, str]:
    evento = {
        "motivo": MOTIVO_VARIABLE_AUSENTE
        if detalle["type"] == "missing"
        else MOTIVO_VALOR_INVALIDO,
        "regla": _regla_sin_el_valor(detalle),
    }
    if detalle["loc"]:
        # Una regla que cruza varias claves (model_validator) no tiene variable propia: su mensaje las nombra.
        evento["variable"] = str(detalle["loc"][0]).upper()
    return evento


def _regla_sin_el_valor(detalle: dict) -> str:
    regla = detalle["msg"].removeprefix(_PREFIJO_DE_VALIDADOR)
    recibido = detalle.get("input")
    if isinstance(recibido, str | int | float) and str(recibido) and str(recibido) in regla:
        return detalle["type"]  # el mensaje repite el valor: se cambia por el tipo de regla
    return regla
