FROM node:24.18.1-alpine3.24@sha256:f70403e87646dc51b45295f4b8b70cdad0b63d2297c4c9899119b03f7af7a6b3 AS build-stage

ARG AVASAN_RELEASE_REVISION
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    AVASAN_RELEASE_REVISION=${AVASAN_RELEASE_REVISION}
RUN npm install --global npm@12.0.2 --allow-scripts=npm

COPY .npmrc package.json package-lock.json ./
COPY front-end/package.json ./front-end/package.json
COPY vendor/archiver-nitro-compat ./vendor/archiver-nitro-compat

RUN npm ci --include=optional --strict-allow-scripts

COPY . .
RUN test -n "${AVASAN_RELEASE_REVISION}" && npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49 AS production-stage

COPY --from=build-stage /app/front-end/.output/public /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080

USER 101
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -T 3 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
