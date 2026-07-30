FROM node:24.18.0-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build-stage

ARG AVASAN_RELEASE_REVISION
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    AVASAN_RELEASE_REVISION=${AVASAN_RELEASE_REVISION}
RUN npm install --global npm@11.16.0

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

CMD ["nginx", "-g", "daemon off;"]
