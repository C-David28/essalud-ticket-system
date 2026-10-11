"""HTTP adapter for the approved model; all requests are independent of ticket storage."""
import asyncio
from contextlib import asynccontextmanager
import json
import logging
from secrets import compare_digest
import time
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, Request, Security
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from .config import Settings
from .worker import InferenceTimeout, ModelUnavailable, ModelWorker, MODEL_VERSION

LOGGER = logging.getLogger("essalud.ml")
LABELS = ("SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO")


def error_response(code, status):
    return JSONResponse({"error": {"code": code}}, status_code=status)


class PredictRequest(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    titulo: str = Field(min_length=5, max_length=200)
    descripcion: str = Field(min_length=10, max_length=5000)

    @field_validator("titulo", "descripcion")
    @classmethod
    def trimmed(cls, value, info):
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("INVALID_TEXT_ENCODING") from None
        value = value.strip()
        minimum = 5 if info.field_name == "titulo" else 10
        if len(value) < minimum:
            raise ValueError("TEXT_TOO_SHORT")
        return value


class PredictResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", allow_inf_nan=False)
    categoria_sugerida: Literal["SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO"]
    score: float
    score_type: Literal["raw_decision_margin_not_probability"]
    probability: None
    operational_threshold: None
    model_version: Literal["ticket-category-model-v1.0.0"]


class RequestPolicy:
    """Bound incoming bytes before parsing JSON; log only controlled metadata."""
    def __init__(self, app, settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started = time.monotonic()
        request_id = str(uuid4())
        status = 500
        route = scope.get("path", "").rstrip("/")
        route_label = route if route in {"/v1/predict", "/v1/model", "/health/live", "/health/ready", "/docs", "/openapi.json"} else "unknown"

        async def response_send(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = list(message.get("headers", [])) + [(b"x-request-id", request_id.encode())]
            await send(message)

        async def reject(code, status_code):
            response = error_response(code, status_code)
            response.headers["connection"] = "close"
            await response(scope, receive, response_send)

        try:
            headers = scope.get("headers", [])
            if route in {"/v1/predict", "/v1/model"}:
                tokens = [v for k, v in headers if k.lower() == b"x-ml-token"]
                if len(tokens) != 1 or len(tokens[0]) > 256 or not compare_digest(tokens[0], self.settings.token.encode()):
                    return await reject("ML_UNAUTHORIZED", 401)
            lengths = [v for k, v in headers if k.lower() == b"content-length"]
            if lengths and (len(lengths) != 1 or len(lengths[0]) > 10 or not lengths[0].isdigit()):
                return await reject("ML_INVALID_BODY", 400)
            if lengths and int(lengths[0]) > self.settings.max_body_bytes:
                return await reject("ML_BODY_TOO_LARGE", 413)
            if route == "/v1/predict" and scope["method"] == "POST":
                types = [v for k, v in headers if k.lower() == b"content-type"]
                if len(types) != 1 or types[0].split(b";", 1)[0].strip().lower() != b"application/json":
                    return await reject("ML_JSON_REQUIRED", 415)
            body = bytearray()

            async def collect():
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return False
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > self.settings.max_body_bytes:
                        raise OverflowError()
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        return True

            try:
                connected = await asyncio.wait_for(collect(), timeout=self.settings.body_timeout)
            except OverflowError:
                return await reject("ML_BODY_TOO_LARGE", 413)
            except TimeoutError:
                return await reject("ML_BODY_TIMEOUT", 408)
            if not connected:
                return
            delivered = False

            async def buffered_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, buffered_receive, response_send)
        finally:
            LOGGER.info(json.dumps({"event": "ml_http_request", "route": route_label, "status": status,
                                    "request_id": request_id, "duration_ms": round((time.monotonic() - started) * 1000, 2)}))


def create_app(settings=None, worker=None):
    settings = settings or Settings.from_environment()
    worker = worker or ModelWorker(settings.model_directory, settings.startup_timeout, settings.inference_timeout)
    gate = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(app):
        loaded = await asyncio.to_thread(worker.start)
        LOGGER.info(json.dumps({"event": "ml_model_start", "status": "ready" if loaded else "unavailable", "model_version": MODEL_VERSION}))
        try:
            yield
        finally:
            await asyncio.to_thread(worker.stop)

    api = FastAPI(title="EsSalud — clasificación experimental", version="1.0.0", lifespan=lifespan,
                  docs_url="/docs" if settings.docs_enabled else None,
                  openapi_url="/openapi.json" if settings.docs_enabled else None, redoc_url=None)
    api.add_middleware(RequestPolicy, settings=settings)
    token_header = APIKeyHeader(name="X-ML-Token", auto_error=False)

    @api.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error):
        # FastAPI's default error response includes the input. Return no submitted values.
        return error_response("ML_INVALID_INPUT", 422)

    @api.get("/health/live")
    async def live():
        return {"status": "ok"}

    @api.get("/health/ready")
    async def ready():
        available = worker.available
        return JSONResponse({"status": "ready" if available else "unavailable", "checks": {"model": "up" if available else "down"},
                             "model_version": MODEL_VERSION}, status_code=200 if available else 503)

    @api.get("/v1/model", dependencies=[Security(token_header)])
    async def model_info():
        if not worker.available:
            return error_response("ML_MODEL_UNAVAILABLE", 503)
        return {"model_version": MODEL_VERSION, "categories": LABELS, "input_fields": ["titulo", "descripcion"],
                "score_type": "raw_decision_margin_not_probability", "probability": None,
                "synthetic_academic_only": True, "institutionally_validated": False}

    @api.post("/v1/predict", response_model=PredictResponse, dependencies=[Security(token_header)])
    async def predict(payload: PredictRequest):
        if not worker.available:
            return error_response("ML_MODEL_UNAVAILABLE", 503)
        if gate.locked():
            return error_response("ML_BUSY", 503)
        async with gate:
            try:
                result = await asyncio.to_thread(worker.predict, payload.titulo, payload.descripcion)
                return PredictResponse.model_validate(result)
            except asyncio.CancelledError:
                # Cancelling the HTTP task does not cancel a running Python thread.
                # Dispose the child/channel before releasing the concurrency gate.
                cleanup = asyncio.create_task(asyncio.to_thread(worker.stop))
                await asyncio.shield(cleanup)
                raise
            except InferenceTimeout:
                return error_response("ML_INFERENCE_TIMEOUT", 504)
            except ModelUnavailable:
                return error_response("ML_MODEL_UNAVAILABLE", 503)
            except (ValidationError, ValueError, TypeError):
                await asyncio.to_thread(worker.stop)
                return error_response("ML_RESPONSE_INVALID", 503)
            except Exception:
                await asyncio.to_thread(worker.stop)
                return error_response("ML_INFERENCE_FAILED", 503)

    return api
