"""HTTP contract and failure isolation; all credentials and request texts are fixtures."""
import asyncio
from copy import deepcopy
import json
from pathlib import Path
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from ml.service.app import PredictRequest, RequestPolicy, create_app
from ml.service.config import Settings
from ml.service.worker import InferenceTimeout, ModelUnavailable, MODEL_VERSION

TOKEN = "0123456789abcdef" * 4  # Public fixture, never a deployment credential.
PRIVATE_TEXT = "TEXT_MUST_NOT_APPEAR_IN_ERRORS_OR_LOGS_4_6"
VALID_INPUT = {"titulo": "Impresora local detenida", "descripcion": "El equipo de prueba deja los documentos en la cola de impresión."}
VALID_OUTPUT = {"categoria_sugerida": "SOPORTE", "score": 0.375,
                "score_type": "raw_decision_margin_not_probability", "probability": None,
                "operational_threshold": None, "model_version": MODEL_VERSION}


class FakeWorker:
    """Controlled collaborator: no model loading, processes, database or networking."""
    def __init__(self, available=True, result=None, failure=None, blocking=False):
        self.loaded, self.ready = available, False
        self.result = deepcopy(VALID_OUTPUT if result is None else result)
        self.failure, self.blocking = failure, blocking
        self.entered, self.release = threading.Event(), threading.Event()
        self.calls = []
        self.starts = self.stops = 0

    def start(self):
        self.starts += 1
        self.ready = self.loaded
        return self.ready

    @property
    def available(self):
        return self.ready

    def stop(self):
        self.stops += 1
        self.ready = False
        self.release.set()

    def predict(self, titulo, descripcion):
        self.calls.append((titulo, descripcion))
        self.entered.set()
        if self.blocking and not self.release.wait(timeout=5):
            raise RuntimeError("TEST_SYNCHRONIZATION_FAILED")
        if self.failure is not None:
            if isinstance(self.failure, (InferenceTimeout, ModelUnavailable)):
                self.ready = False
            raise self.failure
        return deepcopy(self.result)


def client_for(worker=None, **settings):
    return TestClient(create_app(Settings(token=TOKEN, **settings), worker or FakeWorker()), raise_server_exceptions=True)


class HttpContractTests(unittest.TestCase):
    def assert_error(self, response, status, code):
        self.assertEqual(response.status_code, status)
        self.assertEqual(response.json(), {"error": {"code": code}})
        self.assertNotIn(PRIVATE_TEXT, response.text)
        self.assertNotIn(TOKEN, response.text)
        self.assertTrue(response.headers.get("x-request-id"))

    def test_prediction_contract_is_assistance_without_invented_probability(self):
        worker = FakeWorker()
        with client_for(worker) as client:
            response = client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), VALID_OUTPUT)
            self.assertIsNone(response.json()["probability"])
            self.assertIsNone(response.json()["operational_threshold"])
            self.assertEqual(worker.calls, [(VALID_INPUT["titulo"], VALID_INPUT["descripcion"])])
        self.assertEqual(worker.starts, 1)
        self.assertEqual(worker.stops, 1)

    def test_protected_routes_reject_missing_wrong_unicode_and_duplicate_tokens(self):
        worker = FakeWorker()
        cases = [[], [(b"x-ml-token", b"wrong-test-token")],
                 [(b"x-ml-token", "contraseña ficticia".encode("utf-8"))],
                 [(b"x-ml-token", TOKEN.encode()), (b"x-ml-token", TOKEN.encode())],
                 [(b"x-ml-token", b"x" * 257)]]
        with client_for(worker) as client:
            for index, supplied in enumerate(cases):
                for route in ("/v1/predict", "/v1/model"):
                    with self.subTest(route=route, header_case=index):
                        response = client.post(route, json=VALID_INPUT, headers=supplied) if route.endswith("predict") else client.get(route, headers=supplied)
                        self.assert_error(response, 401, "ML_UNAUTHORIZED")
            self.assertEqual(worker.calls, [])

    def test_health_is_open_and_model_metadata_is_protected(self):
        with client_for() as client:
            self.assertEqual(client.get("/health/live").status_code, 200)
            ready = client.get("/health/ready")
            self.assertEqual(ready.status_code, 200)
            self.assertEqual(ready.json()["checks"]["model"], "up")
            self.assertEqual(ready.json()["model_version"], MODEL_VERSION)
            response = client.get("/v1/model", headers={"X-ML-Token": TOKEN})
            self.assertEqual(response.status_code, 200)
            info = response.json()
            self.assertEqual(set(info["categories"]), {"SOPORTE", "REDES", "INFRAESTRUCTURA", "BIOMEDICO"})
            self.assertEqual(info["input_fields"], ["titulo", "descripcion"])
            self.assertEqual(info["model_version"], MODEL_VERSION)
            self.assertTrue(info["synthetic_academic_only"])
            self.assertFalse(info["institutionally_validated"])
            self.assertIsNone(info["probability"])

    def test_docs_default_off_and_opt_in_declares_header_security_without_a_token(self):
        with client_for() as client:
            self.assertEqual(client.get("/docs").status_code, 404)
            self.assertEqual(client.get("/openapi.json").status_code, 404)
        with client_for(docs_enabled=True) as client:
            self.assertEqual(client.get("/docs").status_code, 200)
            response = client.get("/openapi.json")
            self.assertEqual(response.status_code, 200)
            schema = response.json()
            schemes = schema["components"]["securitySchemes"]
            matching = [name for name, value in schemes.items()
                        if value.get("type") == "apiKey" and value.get("in") == "header" and value.get("name") == "X-ML-Token"]
            self.assertEqual(len(matching), 1)
            for path, method in (("/v1/predict", "post"), ("/v1/model", "get")):
                self.assertIn({matching[0]: []}, schema["paths"][path][method]["security"])
            self.assertNotIn(TOKEN, response.text)

    def test_validation_is_strict_rejects_extras_and_never_echoes_input(self):
        worker = FakeWorker()
        invalid = [
            {"titulo": value, "descripcion": PRIVATE_TEXT}
            for value in (12345, None, True, [PRIVATE_TEXT], {"private": PRIVATE_TEXT}, "abcd", " " * 5, "a" * 201, " " * 196 + "abcde")
        ] + [
            {"titulo": PRIVATE_TEXT, "descripcion": value}
            for value in (1234567890, None, "123456789", " " * 10, "a" * 5001, " " * 4991 + "0123456789")
        ] + [{"titulo": PRIVATE_TEXT}, {"descripcion": PRIVATE_TEXT}, {**VALID_INPUT, "credentials": PRIVATE_TEXT}]
        with client_for(worker) as client:
            for index, payload in enumerate(invalid):
                with self.subTest(index=index):
                    self.assert_error(client.post("/v1/predict", json=payload, headers={"X-ML-Token": TOKEN}), 422, "ML_INVALID_INPUT")
            self.assertEqual(worker.calls, [])

    def test_both_domain_boundaries_and_trimming_are_accepted(self):
        worker = FakeWorker()
        valid = [{"titulo": "abcde", "descripcion": "0123456789"},
                 {"titulo": "a" * 200, "descripcion": "b" * 5000},
                 {"titulo": " " * 195 + "abcde", "descripcion": " " * 4990 + "0123456789"}]
        with client_for(worker) as client:
            for payload in valid:
                self.assertEqual(client.post("/v1/predict", json=payload, headers={"X-ML-Token": TOKEN}).status_code, 200)
        self.assertEqual(worker.calls, [(r["titulo"].strip(), r["descripcion"].strip()) for r in valid])

    def test_malformed_json_and_non_json_content_are_controlled(self):
        worker = FakeWorker()
        with client_for(worker) as client:
            response = client.post("/v1/predict", content='{"titulo":"' + PRIVATE_TEXT,
                                   headers={"X-ML-Token": TOKEN, "Content-Type": "application/json"})
            self.assert_error(response, 422, "ML_INVALID_INPUT")
            for content_type in ("text/plain", "application/x-www-form-urlencoded"):
                self.assert_error(client.post("/v1/predict", content=PRIVATE_TEXT,
                                              headers={"X-ML-Token": TOKEN, "Content-Type": content_type}), 415, "ML_JSON_REQUIRED")
        self.assertEqual(worker.calls, [])

    def test_unpaired_unicode_surrogate_is_rejected_without_disabling_model(self):
        worker = FakeWorker()
        # Use encoded JSON: a client cannot UTF-8-encode a raw surrogate string.
        content = b'{"titulo":"\\ud800abcde","descripcion":"Descripcion completamente ficticia"}'
        with client_for(worker) as client:
            self.assert_error(client.post("/v1/predict", content=content,
                                          headers={"X-ML-Token": TOKEN, "Content-Type": "application/json"}), 422, "ML_INVALID_INPUT")
            self.assertEqual(client.get("/health/ready").status_code, 200)
            self.assertTrue(worker.available)
            self.assertEqual(worker.calls, [])

    def test_missing_model_keeps_liveness_but_blocks_readiness_and_prediction(self):
        worker = FakeWorker(available=False)
        with client_for(worker) as client:
            self.assertEqual(client.get("/health/live").status_code, 200)
            self.assertEqual(client.get("/health/ready").status_code, 503)
            self.assert_error(client.get("/v1/model", headers={"X-ML-Token": TOKEN}), 503, "ML_MODEL_UNAVAILABLE")
            self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 503, "ML_MODEL_UNAVAILABLE")
        self.assertEqual(worker.calls, [])

    def test_timeout_is_explicit_and_does_not_reload_automatically(self):
        worker = FakeWorker(failure=InferenceTimeout())
        with client_for(worker) as client:
            self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 504, "ML_INFERENCE_TIMEOUT")
            self.assertEqual(client.get("/health/live").status_code, 200)
            self.assertEqual(client.get("/health/ready").status_code, 503)
            self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 503, "ML_MODEL_UNAVAILABLE")
            self.assertEqual(len(worker.calls), 1)
            self.assertEqual(worker.starts, 1)

    def test_worker_unavailable_failure_is_controlled(self):
        with client_for(FakeWorker(failure=ModelUnavailable())) as client:
            self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 503, "ML_MODEL_UNAVAILABLE")
            self.assertEqual(client.get("/health/ready").status_code, 503)

    def test_invalid_worker_responses_stop_inference_without_echoing_values(self):
        bad = [{**VALID_OUTPUT, "categoria_sugerida": PRIVATE_TEXT},
               {**VALID_OUTPUT, "score": float("nan")}, {**VALID_OUTPUT, "score": float("inf")},
               {**VALID_OUTPUT, "score": PRIVATE_TEXT}, {**VALID_OUTPUT, "probability": 0.9},
               {**VALID_OUTPUT, "model_version": "unapproved-version"}, {**VALID_OUTPUT, "debug_payload": PRIVATE_TEXT},
               {key: value for key, value in VALID_OUTPUT.items() if key != "score_type"}]
        for index, result in enumerate(bad):
            with self.subTest(index=index):
                worker = FakeWorker(result=result)
                with client_for(worker) as client:
                    self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 503, "ML_RESPONSE_INVALID")
                    self.assertFalse(worker.available)
                    self.assertEqual(client.get("/health/ready").status_code, 503)

    def test_busy_is_rejected_without_queue_and_health_remains_responsive(self):
        worker = FakeWorker(blocking=True)
        with client_for(worker) as client:
            with ThreadPoolExecutor(max_workers=1) as executor:
                first = executor.submit(client.post, "/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN})
                try:
                    self.assertTrue(worker.entered.wait(timeout=3), "First prediction did not start")
                    self.assert_error(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}), 503, "ML_BUSY")
                    self.assertEqual(client.get("/health/live").status_code, 200)
                    self.assertEqual(client.get("/health/ready").status_code, 200)
                    self.assertEqual(len(worker.calls), 1)
                finally:
                    worker.release.set()
                self.assertEqual(first.result(timeout=3).status_code, 200)
            self.assertEqual(client.post("/v1/predict", json=VALID_INPUT, headers={"X-ML-Token": TOKEN}).status_code, 200)
            self.assertEqual(len(worker.calls), 2)

    def test_logs_and_controlled_runtime_error_never_include_text_token_or_query(self):
        worker = FakeWorker(failure=RuntimeError(PRIVATE_TEXT + TOKEN))
        with self.assertLogs("essalud.ml", level="INFO") as captured:
            with client_for(worker) as client:
                payload = {"titulo": PRIVATE_TEXT, "descripcion": PRIVATE_TEXT + " descripción ficticia"}
                self.assert_error(client.post("/v1/predict", json=payload, headers={"X-ML-Token": TOKEN}), 503, "ML_INFERENCE_FAILED")
                self.assertEqual(client.get("/health/live?private=" + PRIVATE_TEXT).status_code, 200)
                self.assertEqual(client.get("/unknown/" + PRIVATE_TEXT).status_code, 404)
        logs = "\n".join(captured.output)
        self.assertNotIn(TOKEN, logs)
        self.assertNotIn(PRIVATE_TEXT, logs)
        self.assertNotIn("RuntimeError", logs)
        self.assertIn("ml_http_request", logs)


class CancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelling_request_disposes_worker_before_releasing_gate(self):
        worker = FakeWorker(blocking=True)
        app = create_app(Settings(token=TOKEN), worker)
        endpoint = next(route.endpoint for route in app.routes if route.path == "/v1/predict")
        async with app.router.lifespan_context(app):
            task = asyncio.create_task(endpoint(PredictRequest(**VALID_INPUT)))
            try:
                self.assertTrue(await asyncio.to_thread(worker.entered.wait, 3))
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertFalse(worker.available)
                self.assertTrue(worker.release.is_set())
                retry = await endpoint(PredictRequest(**VALID_INPUT))
                self.assertEqual(retry.status_code, 503)
                self.assertEqual(len(worker.calls), 1)
            finally:
                worker.release.set()
                if not task.done():
                    task.cancel()


class BodyPolicyTests(unittest.IsolatedAsyncioTestCase):
    async def invoke(self, messages, extra_headers=None, delay=0, timeout=0.1):
        """Exercise real ASGI streaming instead of TestClient's aggregated request body."""
        sent, seen, remaining = [], [], list(messages)
        received, receive_cancelled = 0, False
        headers = [(b"x-ml-token", TOKEN.encode()), (b"content-type", b"application/json")]
        headers.extend(extra_headers or [])
        scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "POST",
                 "scheme": "http", "path": "/v1/predict", "raw_path": b"/v1/predict", "query_string": b"",
                 "root_path": "", "headers": headers, "server": ("127.0.0.1", 8001), "client": ("127.0.0.1", 12345)}

        async def receive():
            nonlocal received, receive_cancelled
            received += 1
            try:
                if delay:
                    await asyncio.sleep(delay)
                if remaining:
                    return remaining.pop(0)
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                receive_cancelled = True
                raise

        async def send(message):
            sent.append(message)

        async def downstream(scope, receive, send):
            seen.append(await receive())
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": b'{"ok":true}', "more_body": False})

        policy = RequestPolicy(downstream, Settings(token=TOKEN, body_timeout=timeout))
        await asyncio.wait_for(policy(scope, receive, send), timeout=2)
        start = next((m for m in sent if m["type"] == "http.response.start"), None)
        body = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return start, body, seen, received, receive_cancelled

    async def test_small_fragmented_body_is_buffered_once_without_changing_bytes(self):
        body = json.dumps(VALID_INPUT, ensure_ascii=False).encode()
        split = len(body) // 2
        start, _, seen, received, _ = await self.invoke([
            {"type": "http.request", "body": body[:split], "more_body": True},
            {"type": "http.request", "body": body[split:], "more_body": False}])
        self.assertEqual(start["status"], 200)
        self.assertEqual(received, 2)
        self.assertEqual(seen, [{"type": "http.request", "body": body, "more_body": False}])

    async def test_chunked_overflow_is_rejected_even_when_content_length_lies(self):
        for supplied_length in ([], [(b"content-length", b"10")]):
            with self.subTest(headers=bool(supplied_length)):
                start, body, seen, _, _ = await self.invoke([
                    {"type": "http.request", "body": b"x" * 20000, "more_body": True},
                    {"type": "http.request", "body": b"y" * 20000, "more_body": True}], extra_headers=supplied_length)
                self.assertEqual(start["status"], 413)
                self.assertEqual(json.loads(body), {"error": {"code": "ML_BODY_TOO_LARGE"}})
                self.assertEqual(seen, [])

    async def test_slow_body_has_one_total_deadline_and_cancels_pending_receive(self):
        start, body, seen, _, cancelled = await self.invoke([
            {"type": "http.request", "body": b"a", "more_body": True},
            {"type": "http.request", "body": b"b", "more_body": True},
            {"type": "http.request", "body": b"c", "more_body": False}], delay=0.04, timeout=0.06)
        self.assertEqual(start["status"], 408)
        self.assertEqual(json.loads(body), {"error": {"code": "ML_BODY_TIMEOUT"}})
        self.assertEqual(seen, [])
        self.assertTrue(cancelled)

    async def test_invalid_and_absurd_content_lengths_fail_closed_before_body_read(self):
        lengths = [[(b"content-length", b"-1")], [(b"content-length", b"not-a-number")],
                   [(b"content-length", b"1"), (b"content-length", b"1")],
                   [(b"content-length", b"9" * 5000)], [(b"content-length", b"0" * 5000)]]
        for index, headers in enumerate(lengths):
            with self.subTest(index=index):
                start, body, seen, received, _ = await self.invoke([], extra_headers=headers)
                self.assertIn(start["status"], (400, 413))
                self.assertIn(json.loads(body)["error"]["code"], ("ML_INVALID_BODY", "ML_BODY_TOO_LARGE"))
                self.assertEqual(seen, [])
                self.assertEqual(received, 0)

    async def test_declared_body_over_limit_is_rejected_before_receive(self):
        start, body, seen, received, _ = await self.invoke([], extra_headers=[(b"content-length", b"32769")])
        self.assertEqual(start["status"], 413)
        self.assertEqual(json.loads(body), {"error": {"code": "ML_BODY_TOO_LARGE"}})
        self.assertEqual(seen, [])
        self.assertEqual(received, 0)


if __name__ == "__main__":
    unittest.main()
