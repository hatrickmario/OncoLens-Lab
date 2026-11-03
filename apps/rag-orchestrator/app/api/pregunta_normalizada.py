"""Pregunta normalizada de un router interno (US-250): una sola regla y un solo 422 para `/rag/query` y `/rag/follow-up`."""

from fastapi.exceptions import RequestValidationError

from app.domain.pregunta import normalizar_pregunta


def pregunta_normalizada_o_422(texto: str, campo: str) -> str:
    """La pregunta en NFC con los espacios colapsados; vacía tras normalizar es el 422 del contrato, sin eco del valor."""
    pregunta = normalizar_pregunta(texto)
    if not pregunta:
        raise RequestValidationError(
            [{"loc": ("body", campo), "msg": "La pregunta está vacía.", "type": "value_error"}]
        )
    return pregunta
