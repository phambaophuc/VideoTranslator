# =========================
# 1. Build stage
# =========================
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


# =========================
# 2. Production stage
# =========================
FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    ttf-dejavu
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
RUN mkdir -p \
    /app/storage/temp/uploads \
    /app/storage/temp/audio \
    /app/storage/temp/transcripts \
    /app/storage/temp/subtitles \
    /app/storage/videos
EXPOSE 3000
CMD ["node", "dist/main.js"]