# Trình biên dịch ExamDSL: Nginx của web chuyển /dsl/ sang service này (deploy/nginx.conf)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY grammar ./grammar
COPY dsl ./dsl
COPY server ./server
COPY web ./web
COPY examples ./examples
USER nobody
EXPOSE 8010
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8010"]
