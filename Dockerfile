# syntax=docker/dockerfile:1
#
# CORE agent platform — single long-lived process.
#
# The agent runner drains its event queue inside the HTTP server, and SQLite
# needs a durable file, so this image serves BOTH the API and the built
# frontend from one Node process. Deploy it on a process host (Railway,
# Render, Fly.io) with a persistent volume mounted at /data.
#
#   docker build -t core-agent-platform .
#   docker run -p 4100:4100 -v core-data:/data core-agent-platform

# ---- Stage 1: build the React frontend into a static bundle -------------
FROM node:22-slim AS frontend
WORKDIR /app/live-agent-system
COPY live-agent-system/package.json live-agent-system/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY live-agent-system/package.json live-agent-system/tsconfig.json live-agent-system/vite.config.ts live-agent-system/index.html ./
COPY live-agent-system/src ./src
RUN npm run build

# ---- Stage 2: compile the backend and assemble the runtime --------------
FROM node:22-slim AS backend
WORKDIR /app/live-agent-system/server
COPY live-agent-system/server/package.json live-agent-system/server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY live-agent-system/server/tsconfig.json ./
COPY live-agent-system/server/src ./src
COPY live-agent-system/server/test ./test
RUN npm run build && npm prune --omit=dev

# ---- Stage 3: minimal runtime -------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=4100 \
    HOST=0.0.0.0 \
    DB_PATH=/data/core.sqlite
WORKDIR /app/live-agent-system/server
COPY --from=backend /app/live-agent-system/server/node_modules ./node_modules
COPY --from=backend /app/live-agent-system/server/dist ./dist
COPY --from=backend /app/live-agent-system/server/package.json ./
COPY --from=frontend /app/live-agent-system/dist ../dist

# SQLite lives on the volume; without it the DB resets on every redeploy.
VOLUME /data
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
