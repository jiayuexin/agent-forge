# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY templates ./templates

RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Stage 2: Production ----
FROM node:20-alpine AS runner

ARG ENTRYPOINT=dashboard
ENV ENTRYPOINT=$ENTRYPOINT
WORKDIR /app

RUN addgroup --system agentforge && adduser --system --ingroup agentforge agentforge

COPY --from=builder /app/packages/cli/dist ./packages/cli/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY --from=builder /app/packages/runtime-client/dist ./packages/runtime-client/dist
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/http-server/dist ./packages/http-server/dist
COPY --from=builder /app/packages/dashboard/dist ./packages/dashboard/dist
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

RUN chown -R agentforge:agentforge /app
USER agentforge

EXPOSE 8080

CMD ["sh", "-c", "node packages/cli/dist/index.js dashboard --port 8080 --host 0.0.0.0"]
