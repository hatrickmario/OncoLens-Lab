"""Lector de la cobertura de población del catálogo (schema `corpus`, rol `rag_corpus`): `LectorDeCoberturaDePoblacion`."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.application.errores import RecuperacionNoDisponibleError
from app.application.ports import CoberturaDePoblacion
from app.domain.cobertura_poblacion import contar_cobertura
from app.infrastructure.catalog.tables import corpus_document


class LectorDeCoberturaPostgres:
    """Solo lectura sobre ``corpus.corpus_document`` de los documentos ``is_current``; el motor ya fija el schema."""

    def __init__(self, motor: Engine) -> None:
        self._motor = motor

    def cobertura(self) -> CoberturaDePoblacion:
        consulta = sa.select(corpus_document.c.population_criteria).where(
            corpus_document.c.is_current.is_(True)
        )
        try:
            with self._motor.connect() as conexion:
                criterios = conexion.execute(consulta).scalars().all()
        except SQLAlchemyError:
            raise RecuperacionNoDisponibleError(
                "cobertura"
            ) from None  # sin cadena de conexión ni detalle del motor
        conteo = contar_cobertura(criterios)
        return CoberturaDePoblacion(conteo.vigentes, conteo.con_criterios)
