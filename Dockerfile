# Stage 1: Build client and server
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# LibreOffice for ODT→PDF conversion
RUN apk add --no-cache libreoffice ttf-dejavu ttf-liberation

COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --omit=dev -w server

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

COPY resources ./resources

RUN mkdir -p /app/data /app/output

ENV NODE_ENV=production
ENV PORT=3090
ENV DATA_DIR=/app/data
ENV OUTPUT_DIR=/app/output

EXPOSE 3090

HEALTHCHECK --interval=5m --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3090/api/health || exit 1

CMD ["sh", "-c", "cd /app/server && node dist/index.js"]
