# ── Stage 1: build the Vite frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python API + compiled frontend ───────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Python deps first for layer caching
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# cell_research lives at /cell_research; PYTHONPATH lets `import cell_research` resolve
COPY cell_research /cell_research
ENV PYTHONPATH=/

COPY api/ .

# Embed the compiled frontend so FastAPI can serve it in production
COPY --from=frontend-builder /frontend/dist ./static

# Railway injects $PORT; fall back to 8000 for local `docker run`
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
