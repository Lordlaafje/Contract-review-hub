# Single-container build: Vite frontend built and served by the Node/Express backend.
# Build context = the app/ directory:  docker build -t hf-contract-review app/

# ── Stage 1: build the React frontend ──
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build          # → /web/dist

# ── Stage 2: server (serves the API + the built frontend) ──
FROM node:22-alpine AS server
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=web /web/dist ./public
# Run as the unprivileged node user; pre-create the writable runtime dirs.
RUN mkdir -p data uploads && chown -R node:node /app
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.mjs"]
