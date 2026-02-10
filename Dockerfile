FROM oven/bun:1.3.5 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY packages/shared/package.json ./packages/shared/
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/

RUN bun install --frozen-lockfile

COPY . .

RUN cd apps/server && bun run build

FROM oven/bun:1.3.5

COPY --from=builder /app/apps/server/build/out/sharkord-linux-x64 /sharkord

ENV RUNNING_IN_DOCKER=true

RUN chmod +x /sharkord

CMD ["/sharkord"]
