"""One ASGI worker; no reload/fork, no request text in server logs."""
import os
import logging
import uvicorn


def main():
    logger = logging.getLogger("essalud.ml")
    logger.setLevel(logging.INFO)
    logger.addHandler(logging.StreamHandler())
    logger.propagate = False
    for name in ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"]:
        os.environ.setdefault(name, "1")
    uvicorn.run("ml.service.app:create_app", factory=True, host=os.environ.get("ML_HOST", "127.0.0.1"),
                port=int(os.environ.get("PORT", "8001")), workers=1, access_log=False,
                proxy_headers=False, timeout_keep_alive=5, timeout_graceful_shutdown=10, limit_concurrency=32)


if __name__ == "__main__":
    main()
