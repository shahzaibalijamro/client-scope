FROM node:24.20.0-bookworm-slim AS dependencies

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci

FROM dependencies AS build

ARG BACKEND_API_ORIGIN=http://backend:4000
ARG FRONTEND_ORIGIN
ARG PUBLIC_ORIGIN_MODE=production
ENV BACKEND_API_ORIGIN=${BACKEND_API_ORIGIN}
ENV FRONTEND_ORIGIN=${FRONTEND_ORIGIN} PUBLIC_ORIGIN_MODE=${PUBLIC_ORIGIN_MODE}

COPY frontend/app ./app
COPY frontend/test ./test
COPY frontend/next.config.ts frontend/next-env.d.ts frontend/postcss.config.mjs frontend/tsconfig.json ./
COPY portfolio/media-manifest.json /app/portfolio/media-manifest.json
RUN npm run build

FROM node:24.20.0-bookworm-slim AS runtime
ARG FRONTEND_ORIGIN
ARG PUBLIC_ORIGIN_MODE=production
ENV FRONTEND_ORIGIN=${FRONTEND_ORIGIN} PUBLIC_ORIGIN_MODE=${PUBLIC_ORIGIN_MODE}

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static

USER node
EXPOSE 3000

CMD ["node", "frontend/server.js"]
