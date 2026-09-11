FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspace @essalud/web --include-workspace-root --ignore-scripts --no-audit --no-fund
COPY apps/web ./apps/web
RUN npm run web:build
RUN npm prune --workspace @essalud/web --include-workspace-root --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/.next ./apps/web/.next
COPY --from=build --chown=node:node /app/apps/web/next.config.ts ./apps/web/next.config.ts
WORKDIR /app/apps/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 CMD node -e "fetch('http://127.0.0.1:3000/api/backend-health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","../../node_modules/next/dist/bin/next","start","--hostname","0.0.0.0","--port","3000"]
