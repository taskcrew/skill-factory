FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y \
  git bash curl python3 python3-venv wget jq gnupg unzip \
  && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash \
  && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# Install Claude Code CLI globally (the SDK spawns it as a subprocess)
RUN npm install -g @anthropic-ai/claude-code

# Install agent-browser for browser automation via CDP
RUN npm install -g agent-browser

# Create workspace directory for Claude Code to operate in
RUN mkdir -p /workspace && chmod 777 /workspace

WORKDIR /app

# Install cc-server dependencies
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

# Copy cc-server source
COPY src ./src
COPY tsconfig.json ./

# Create non-root user
RUN useradd -m -u 1001 appuser && \
  chown -R appuser:appuser /app /workspace

USER appuser

ENV PORT=3002
ENV HOST=0.0.0.0

EXPOSE 3002
CMD ["bun", "src/index.ts"]
