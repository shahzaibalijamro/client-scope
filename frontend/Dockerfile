FROM node:24.20.0-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM dependencies AS build

ARG BACKEND_API_ORIGIN=http://backend:4000
ENV BACKEND_API_ORIGIN=${BACKEND_API_ORIGIN}

COPY app ./app
COPY next.config.ts next-env.d.ts postcss.config.mjs tsconfig.json ./
RUN npm run build

FROM node:24.20.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
