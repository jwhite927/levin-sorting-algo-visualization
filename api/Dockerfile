# ── Stage 1: build the Vite frontend ─────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: fetch cell_research (git submodule not initialized by Railway) ───
FROM alpine/git AS cell-research-fetcher
RUN git clone --depth 1 https://github.com/jwhite927/cell_research.git /cell_research

# ── Stage 3: Python API + compiled frontend ───────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Python deps first for layer caching
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pull cell_research from the dedicated fetch stage — avoids the empty-directory
# problem caused by Railway not initialising git submodules during the build.
# PYTHONPATH=/packages so Python resolves `import cell_research` cleanly.
COPY --from=cell-research-fetcher /cell_research /packages/cell_research
ENV PYTHONPATH=/packages

COPY api/ .

# Embed the compiled frontend so FastAPI can serve it in production
COPY --from=frontend-builder /frontend/dist ./static

# Railway injects $PORT; fall back to 8000 for local `docker run`
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
