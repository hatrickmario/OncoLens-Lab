from app.application import errores
from app.application.errores import ErrorDeAplicacion
from app.bootstrap import crear_app
from tests.support.fakes import GeneradorTraceFijo, RelojFijo, settings_de_prueba


def test_cada_subclase_de_error_de_aplicacion_tiene_un_manejador_con_respuesta_contractual():
    app = crear_app(settings_de_prueba(), trace_ids=GeneradorTraceFijo(), clock=RelojFijo())

    subclases = [
        c
        for c in vars(errores).values()
        if isinstance(c, type) and issubclass(c, ErrorDeAplicacion) and c is not ErrorDeAplicacion
    ]

    assert len(subclases) >= 3
    sin_manejador = [c.__name__ for c in subclases if c not in app.exception_handlers]
    assert sin_manejador == []
