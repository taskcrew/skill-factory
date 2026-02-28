FROM oven/bun:1-alpine AS install
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production

FROM oven/bun:1-alpine
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY . .
EXPOSE 3002
CMD ["bun", "src/index.ts"]
