FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies first for layer caching
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# cell_research lives at /cell_research (COPYed here; also volume-mounted in
# docker-compose for local dev).  Adding / to PYTHONPATH is all that's needed
# to make `import cell_research` resolve to /cell_research/__init__.py.
COPY cell_research /cell_research
ENV PYTHONPATH=/

COPY api/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
