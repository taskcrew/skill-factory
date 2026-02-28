FROM oven/bun:1-slim

RUN apt-get update && apt-get install -y \
  git bash curl python3 python3-venv wget jq gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY . .

RUN useradd -m -u 1001 appuser
USER appuser

EXPOSE 8080
CMD ["bun", "src/index.ts"]
