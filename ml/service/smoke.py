"""Exercise the real Uvicorn HTTP listener and model, then shut down cleanly."""
import asyncio
import multiprocessing as mp
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def run_server(port, stop):
    import logging
    import uvicorn
    os.environ["OMP_NUM_THREADS"] = "1"
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    logger = logging.getLogger("essalud.ml")
    logger.setLevel(logging.INFO)
    logger.addHandler(logging.StreamHandler())
    logger.propagate = False
    server = uvicorn.Server(uvicorn.Config("ml.service.app:create_app", factory=True, host="127.0.0.1", port=port,
                                         access_log=False, proxy_headers=False, timeout_graceful_shutdown=10))

    async def watch_stop():
        while not stop.is_set():
            await asyncio.sleep(0.1)
        server.should_exit = True

    async def run():
        watcher = asyncio.create_task(watch_stop())
        try:
            await server.serve()
        finally:
            watcher.cancel()
    asyncio.run(run())


def main():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    ctx = mp.get_context("spawn")
    stop = ctx.Event()
    process = ctx.Process(target=run_server, args=(port, stop))
    process.start()
    try:
        deadline = time.monotonic() + 75
        while True:
            if not process.is_alive():
                raise RuntimeError("ML_HTTP_START_FAILED")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health/ready", timeout=2) as response:
                    if response.status == 200:
                        break
            except (OSError, urllib.error.URLError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError("ML_HTTP_START_TIMEOUT")
            time.sleep(0.1)
        env = dict(os.environ, ML_SERVICE_BASE_URL=f"http://127.0.0.1:{port}")
        subprocess.run(["node", "ml/scripts/service-command.mjs", "check"], cwd=ROOT, env=env, check=True, timeout=40)
        print("ML_SERVICE_HTTP_SMOKE_OK: real listener and approved model; no ticket storage accessed.")
    finally:
        stop.set()
        process.join(15)
        if process.is_alive():
            process.terminate()
            process.join(5)
        if process.is_alive():
            process.kill()
            process.join(5)
        process.close()


if __name__ == "__main__":
    mp.freeze_support()
    main()
