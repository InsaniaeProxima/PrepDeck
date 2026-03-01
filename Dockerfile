# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy only package files for layer caching
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next build will produce .next/standalone/ thanks to output: "standalone"
RUN npm run build

# ── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

# Don't run as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone server (includes required node_modules subset)
COPY --from=builder /app/.next/standalone ./

# Copy static assets that standalone does NOT include
COPY --from=builder /app/.next/static ./.next/static

# Copy public folder (defensive — currently only contains .gitkeep)
COPY --from=builder /app/public ./public

# Create the /data directory structure.
# In production this will be overridden by the docker-compose volume mount,
# but we create it here so the container works even without a mount.
RUN mkdir -p /app/data/exams /app/data/progress /app/data/engine-state \
    && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
