# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json .npmrc ./
COPY packages ./packages
COPY templates ./templates

RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS runner

ARG ENTRYPOINT=dashboard
ENV ENTRYPOINT=$ENTRYPOINT
ENV AGENTFORGE_DATA_DIR=/data
WORKDIR /app

RUN addgroup --system agentforge && adduser --system --ingroup agentforge agentforge
RUN mkdir -p /data && chown agentforge:agentforge /data

COPY --from=builder /app/packages ./packages
COPY --from=builder /app/templates ./templates
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

RUN chown -R agentforge:agentforge /app
USER agentforge

VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/v1/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node packages/cli/dist/index.js dashboard --port 8080 --host 0.0.0.0"]
