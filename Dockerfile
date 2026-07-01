# syntax=docker/dockerfile:1
# Coolify — tek konteyner: frontend (static) + backend API + WhatsApp QR (Baileys)

FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Küçük VPS / Coolify build sunucularında OOM önleme
ENV NODE_OPTIONS=--max-old-space-size=2048

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci

COPY backend ./backend
COPY frontend ./frontend

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DEMO_MODE=false
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE

# Sıralı build — bellek zirvesini düşürür (tsc + vite aynı anda değil)
RUN npm run build --prefix backend
RUN npm run build --prefix frontend

# Runner aşamasında paralel npm ci yapma (build ile RAM yarışmasını önler)
RUN cd backend && npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SESSIONS_DIR=/data/sessions

RUN mkdir -p /data/sessions \
  && chown -R node:node /data/sessions /app

COPY --from=builder /app/backend/package.json /app/backend/package-lock.json ./backend/
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/frontend/dist ./frontend/dist

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/dist/index.js"]
