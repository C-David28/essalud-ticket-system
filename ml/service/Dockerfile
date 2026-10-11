FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_DISABLE_PIP_VERSION_CHECK=1 \
    ML_HOST=0.0.0.0 PORT=8001 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
WORKDIR /app
COPY ml/service/requirements.txt ./ml/service/requirements.txt
RUN python -m pip install --no-cache-dir --only-binary=:all: pip==25.1.1 -r ml/service/requirements.txt \
    && python -m pip check \
    && useradd --uid 10001 --create-home mlservice
COPY ml/service/__init__.py ml/service/config.py ml/service/worker.py ml/service/app.py ml/service/serve.py ./ml/service/
COPY ml/modeling/runtime.py ml/modeling/approved-release.json ./ml/modeling/
COPY ml/models/category-v1.0.0/model.skops ml/models/category-v1.0.0/metadata.json ml/models/category-v1.0.0/verification.json ./ml/models/category-v1.0.0/
USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health/ready', timeout=2)"
CMD ["python", "-B", "-m", "ml.service.serve"]
