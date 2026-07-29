FROM node:20-alpine AS build-stage

WORKDIR /app
RUN npm install --global npm@11.12.0

COPY .npmrc package.json package-lock.json ./
COPY front-end/package.json ./front-end/package.json
COPY back-end/package.json ./back-end/package.json

RUN npm ci

COPY . .
RUN npm run build

FROM nginx:stable-alpine AS production-stage

COPY --from=build-stage /app/front-end/.output/public /usr/share/nginx/html
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
