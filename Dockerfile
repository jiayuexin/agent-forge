# Multi-stage build for AgentForge
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@8.6.12 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY templates/ templates/
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Production image
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@8.6.12 --activate
WORKDIR /app
COPY --from=builder /app/packages/types/dist /app/packages/types/dist
COPY --from=builder /app/packages/core/dist /app/packages/core/dist
COPY --from=builder /app/packages/sdk/dist /app/packages/sdk/dist
COPY --from=builder /app/packages/cli/dist /app/packages/cli/dist
COPY --from=builder /app/packages/http-server/dist /app/packages/http-server/dist
COPY --from=builder /app/packages/dashboard/dist /app/packages/dashboard/dist
COPY --from=builder /app/packages/*/package.json /app/packages/*/
COPY --from=builder /app/templates /app/templates
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/*/node_modules /app/packages/*/node_modules/

ENV NODE_ENV=production
ENTRYPOINT ["node", "packages/cli/dist/index.js"]
CMD ["--help"]
