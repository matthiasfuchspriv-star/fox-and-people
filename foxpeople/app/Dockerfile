# Fox & People Verwaltungssoftware – Produktions-Image
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils unzip openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN mkdir -p storage && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && npx next start -p 3000"]
