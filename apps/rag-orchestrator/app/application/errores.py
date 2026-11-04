"""Errores de la capa de aplicación que `app/api/errors.py` traduce a respuestas HTTP sin eco de la petición."""


class ErrorDeAplicacion(Exception):
    """Raíz de los errores de la capa de aplicación con respuesta contractual propia: nunca se disfrazan de otro."""


class RecuperacionNoDisponibleError(ErrorDeAplicacion):
    """Milvus, el catálogo del corpus o el adapter de embeddings fallaron o no respondieron (`503 RETRIEVAL_UNAVAILABLE`).

    Sin reintento silencioso ni respuesta parcial. El mensaje nunca lleva el texto de la pregunta, un host ni un
    detalle del motor: solo el nombre de la etapa.
    """

    def __init__(self, etapa: str) -> None:
        self.etapa = etapa
        super().__init__(f"recuperación no disponible en la etapa {etapa}")


class TipoCancerNoRegistradoError(ErrorDeAplicacion):
    """El contexto clínico no trae un tipo de cáncer utilizable (`422 TIPO_CANCER_NO_REGISTRADO`, OL-02)."""


class LlmLocalNoDisponibleError(ErrorDeAplicacion):
    """El LLM local no está disponible o su salida no es válida (`503 LOCAL_LLM_UNAVAILABLE`)."""


class LlmSalidaInvalidaError(ErrorDeAplicacion):
    """El LLM respondió, pero su salida no es JSON o no cumple el esquema interno de afirmaciones (`503 LLM_OUTPUT_INVALID`).

    Distinto de ``LlmLocalNoDisponibleError`` (el LLM caído o sin respuesta): aquí el modelo contestó y la salida no se pudo
    validar. Sin reintento silencioso ni eco del texto generado; solo viaja el tipo del error de validación en el log.
    """

    def __init__(self, reglas: tuple[str, ...] = ()) -> None:
        """``reglas``: el id de cada regla del esquema interno que la salida incumple (``principal_duplicada``…); nunca texto."""
        self.reglas = reglas
        super().__init__("salida del LLM inválida")


class FaltanteNoCatalogadoError(ErrorDeAplicacion):
    """Un elemento de ``missingCriticalData`` no es una clave del catálogo del tipo del caso (`422 CUERPO_INVALIDO`, RN-11).

    Lleva solo las posiciones de los elementos inválidos: nunca el valor recibido, que puede ser texto libre con PHI.
    """

    def __init__(self, posiciones: tuple[int, ...]) -> None:
        self.posiciones = posiciones
        super().__init__(f"{len(posiciones)} datos críticos faltantes no son claves del catálogo")


class NliNoDisponibleError(ErrorDeAplicacion):
    """El verificador de soporte (NLI) falló o no respondió (`503 NLI_UNAVAILABLE`): ninguna opción sale sin validar (RN-01)."""
