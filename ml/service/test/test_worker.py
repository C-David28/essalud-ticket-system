"""Actual child processes: approved loading, timeout disposal and safe recovery."""
import json
import multiprocessing as mp
from pathlib import Path
import tempfile
import time
import unittest

from ml.service.config import ROOT, Settings
from ml.service.worker import InferenceTimeout, MODEL_VERSION, ModelUnavailable, ModelWorker
from ml.service.bootstrap import pins

MODEL = ROOT / "ml/models/category-v1.0.0"


def stalled_worker(connection, directory):
    connection.send_bytes(json.dumps({"ready": True, "model_version": MODEL_VERSION}).encode())
    connection.recv_bytes(32768)
    time.sleep(30)


def quick_worker(connection, directory):
    connection.send_bytes(json.dumps({"ready": True, "model_version": MODEL_VERSION}).encode())
    while True:
        try:
            connection.recv_bytes(32768)
            connection.send_bytes(json.dumps({"result": {"fresh_worker": True}}).encode())
        except EOFError:
            return


def oversized_worker(connection, directory):
    connection.send_bytes(json.dumps({"ready": True, "model_version": MODEL_VERSION}).encode())
    connection.recv_bytes(32768)
    connection.send_bytes(b"x" * 5000)


def no_start_worker(connection, directory):
    time.sleep(30)


def ready_without_reading_worker(connection, directory):
    connection.send_bytes(json.dumps({"ready": True, "model_version": MODEL_VERSION}).encode())
    time.sleep(30)


class WorkerTests(unittest.TestCase):
    def test_approved_model_predicts_in_an_actual_spawn_process(self):
        worker = ModelWorker(MODEL)
        try:
            self.assertTrue(worker.start())
            pid = worker.process.pid
            prediction = worker.predict("Monitor de signos sin lectura", "El monitor multiparámetro no registra la saturación con el sensor conectado y muestra una alarma técnica del equipo.")
            self.assertEqual(prediction["categoria_sugerida"], "BIOMEDICO")
            self.assertEqual(prediction["model_version"], MODEL_VERSION)
            self.assertIsNone(prediction["probability"])
            self.assertEqual(worker.process.pid, pid)
            worker.predict("Cable de red desconectado", "Las computadoras no acceden a internet, el switch no enciende ningún puerto de red.")
            self.assertEqual(worker.process.pid, pid, "model loaded once, not per request")
        finally:
            worker.stop()
        self.assertFalse(worker.available)

    def test_timeout_kills_child_and_restart_uses_fresh_pipe(self):
        worker = ModelWorker(MODEL, inference_timeout=0.1, target=stalled_worker)
        try:
            self.assertTrue(worker.start())
            pid = worker.process.pid
            started = time.monotonic()
            with self.assertRaises(InferenceTimeout):
                worker.predict("Prueba válida", "Descripción suficientemente larga")
            self.assertLess(time.monotonic() - started, 3)
            self.assertFalse(worker.available)
            self.assertNotIn(pid, [child.pid for child in mp.active_children()])
            with self.assertRaises(ModelUnavailable):
                worker.predict("Prueba válida", "Descripción suficientemente larga")
            worker.target = quick_worker
            self.assertTrue(worker.start())
            self.assertNotEqual(worker.process.pid, pid)
            self.assertEqual(worker.predict("Prueba válida", "Descripción suficientemente larga"), {"fresh_worker": True})
        finally:
            worker.stop()

    def test_unapproved_or_missing_model_does_not_start(self):
        with tempfile.TemporaryDirectory(dir=ROOT / "ml/outputs") as directory:
            worker = ModelWorker(directory)
            self.assertFalse(worker.start())
            self.assertFalse(worker.available)
            worker.stop()

    def test_timeout_covers_blocked_request_send(self):
        worker = ModelWorker(MODEL, inference_timeout=0.1, target=ready_without_reading_worker)
        try:
            self.assertTrue(worker.start())
            pid = worker.process.pid
            import sys
            if sys.platform != "win32":
                import socket
                handle = socket.socket(fileno=worker.connection.fileno())
                try:
                    handle.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 4096)
                finally:
                    handle.detach()
            started = time.monotonic()
            with self.assertRaises(InferenceTimeout):
                worker.predict("Solicitud válida", "\U0001f600" * 5000)
            self.assertLess(time.monotonic() - started, 3)
            self.assertFalse(worker.available)
            self.assertNotIn(pid, [child.pid for child in mp.active_children()])
        finally:
            worker.stop()

    def test_startup_timeout_stops_child(self):
        worker = ModelWorker(MODEL, startup_timeout=1, target=no_start_worker)
        self.assertFalse(worker.start())
        self.assertIsNone(worker.process)
        worker.stop()

    def test_oversized_worker_reply_is_discarded(self):
        worker = ModelWorker(MODEL, target=oversized_worker)
        try:
            self.assertTrue(worker.start())
            with self.assertRaises(ModelUnavailable):
                worker.predict("Prueba válida", "Descripción suficientemente larga")
            self.assertFalse(worker.available)
        finally:
            worker.stop()

    def test_process_death_is_unavailable(self):
        worker = ModelWorker(MODEL, target=quick_worker)
        try:
            self.assertTrue(worker.start())
            worker.process.terminate()
            worker.process.join(3)
            self.assertFalse(worker.available)
            with self.assertRaises(ModelUnavailable):
                worker.predict("Prueba válida", "Descripción suficientemente larga")
        finally:
            worker.stop()

    def test_settings_fail_closed_and_dependency_pins_keep_model_compatibility(self):
        for token in ["", "short", "g" * 64, "a" * 63]:
            with self.assertRaises(ValueError):
                Settings(token=token)
        requirements = pins(ROOT / "ml/service/requirements.txt")
        import sys
        sys.path.insert(0, str(ROOT / "ml/modeling"))
        from runtime import RUNTIME_PINS
        for name, version in RUNTIME_PINS.items():
            self.assertEqual(requirements[name], version)


if __name__ == "__main__":
    mp.freeze_support()
    unittest.main()
