# Production image for the web app. Targets: runner (default) and tools (migrate/seed).
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install -g npm@11 && npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# One-off container for `drizzle-kit migrate` and the seed scripts (has dev dependencies + source).
FROM builder AS tools
ENV NODE_ENV=production
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs /app/public ./public
COPY --from=builder --chown=nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
