# syntax=docker/dockerfile:1
# Coolify — tek konteyner: frontend (static) + backend API + WhatsApp QR (Baileys)

FROM node:20-bookworm-slim AS backend-builder

WORKDIR /app/backend

# Coolify build-time NODE_ENV=production uyarısını geçersiz kıl
ENV NODE_ENV=development
ENV NODE_OPTIONS=--max-old-space-size=1536

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend ./
RUN npm run build \
  && npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf src tsconfig.json

FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/frontend

ENV NODE_ENV=development
ENV NODE_OPTIONS=--max-old-space-size=1536

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_DEMO_MODE=false
ARG VITE_LIVE_DEMO_WHATSAPP_PHONE
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_DEMO_MODE=$VITE_DEMO_MODE
ENV VITE_LIVE_DEMO_WHATSAPP_PHONE=$VITE_LIVE_DEMO_WHATSAPP_PHONE

RUN npm run build \
  && rm -rf node_modules src public \
  && npm cache clean --force

FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SESSIONS_DIR=/data/sessions
ENV NODE_OPTIONS=--max-old-space-size=768

# Baileys: HTTPS (versiyon kontrolü) ve WhatsApp WebSocket için gerekli
# gosu: volume mount sonrası /data/sessions izinlerini node kullanıcısına vermek için
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/sessions \
  && chown -R node:node /data/sessions /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

COPY --from=backend-builder /app/backend/package.json /app/backend/package-lock.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
