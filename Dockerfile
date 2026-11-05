# The production image: the API, which also serves the built web app.
FROM node:24-bookworm-slim

# Prisma's migration engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
WORKDIR /app/apps/api
USER node
CMD ["node", "dist/server.js"]
