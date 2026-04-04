FROM node:22-alpine AS build

WORKDIR /app/frontend

COPY frontend/package.json ./package.json
COPY frontend/tsconfig.json ./tsconfig.json
COPY tsconfig.base.json ../tsconfig.base.json
COPY frontend/vite.config.ts ./vite.config.ts
COPY frontend/index.html ./index.html
COPY frontend/public ./public

RUN npm install

COPY frontend/src ./src

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
