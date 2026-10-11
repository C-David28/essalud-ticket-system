"""One persistent spawn process; bounded JSON IPC and a real inference deadline."""
import json
import multiprocessing
from pathlib import Path
import sys
import threading

MODEL_VERSION = "ticket-category-model-v1.0.0"


class ModelUnavailable(Exception):
    pass


class InferenceTimeout(Exception):
    pass


def _model_process(connection, directory):
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "modeling"))
        from runtime import load_release
        model = load_release(directory)
        connection.send_bytes(json.dumps({"ready": True, "model_version": MODEL_VERSION}).encode())
        while True:
            message = json.loads(connection.recv_bytes(32768))
            try:
                result = model.predict(message["titulo"], message["descripcion"])
                connection.send_bytes(json.dumps({"result": result}, allow_nan=False).encode())
            except Exception:
                # Do not send tracebacks, request texts or exception messages across the boundary.
                connection.send_bytes(b'{"error":"ML_INFERENCE_FAILED"}')
    except (EOFError, BrokenPipeError, OSError):
        pass
    except Exception:
        try:
            connection.send_bytes(b'{"ready":false,"error":"ML_MODEL_LOAD_FAILED"}')
        except (OSError, BrokenPipeError):
            pass
    finally:
        connection.close()


class ModelWorker:
    def __init__(self, directory, startup_timeout=60.0, inference_timeout=2.0, target=_model_process):
        self.directory = Path(directory)
        self.startup_timeout, self.inference_timeout = startup_timeout, inference_timeout
        self.target = target  # Trusted code injection for tests; never an environment/import string.
        self.process = self.connection = None
        self.ready = False

    def start(self):
        self.stop()
        context = multiprocessing.get_context("spawn")
        parent, child = context.Pipe(duplex=True)
        self.connection = parent
        self.process = context.Process(target=self.target, args=(child, str(self.directory)), daemon=True)
        try:
            self.process.start()
            child.close()
            if not parent.poll(self.startup_timeout):
                raise ModelUnavailable()
            message = json.loads(parent.recv_bytes(4096))
            self.ready = message.get("ready") is True and message.get("model_version") == MODEL_VERSION
            if not self.ready:
                self.stop()
        except Exception:
            child.close()
            self.stop()
        return self.ready

    @property
    def available(self):
        return self.ready and self.process is not None and self.process.is_alive()

    def predict(self, titulo, descripcion):
        if not self.available:
            raise ModelUnavailable()
        connection = self.connection
        finished = threading.Event()
        outcome = {}

        def exchange():
            try:
                # Windows pipes can block on send as well as receive. The parent
                # deadline covers both; killing the child releases pending I/O.
                connection.send_bytes(json.dumps({"titulo": titulo, "descripcion": descripcion}, ensure_ascii=False).encode())
                outcome["message"] = json.loads(connection.recv_bytes(4096))
            except Exception:
                outcome["failed"] = True
            finally:
                finished.set()

        exchange_thread = threading.Thread(target=exchange, daemon=True)
        exchange_thread.start()
        try:
            if not finished.wait(self.inference_timeout):
                self.stop()
                exchange_thread.join(timeout=0.5)
                raise InferenceTimeout()
            if outcome.get("failed"):
                raise ModelUnavailable()
            message = outcome["message"]
            if set(message) != {"result"}:
                self.stop()
                raise ModelUnavailable()
            return message["result"]
        except InferenceTimeout:
            raise
        except Exception:
            self.stop()
            raise ModelUnavailable() from None

    def stop(self):
        self.ready = False
        process, connection = self.process, self.connection
        self.process = self.connection = None
        if process is not None:
            if process.pid is not None:
                if process.is_alive():
                    process.terminate()
                process.join(timeout=0.5)
                if process.is_alive():
                    process.kill()
                    process.join(timeout=0.5)
                if not process.is_alive():
                    process.close()
            else:
                process.close()
        if connection is not None:
            connection.close()
