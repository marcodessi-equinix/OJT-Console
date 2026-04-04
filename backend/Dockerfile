FROM node:22-alpine AS build

WORKDIR /app

COPY backend/package.json ./backend/package.json
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY tsconfig.base.json ./tsconfig.base.json

WORKDIR /app/backend
RUN npm install

WORKDIR /app
COPY backend ./backend

WORKDIR /app/backend
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY backend/package.json ./backend/package.json
COPY ["frontend/public/Equninx Gloabal Acadaemy.svg", "./frontend/public/Equninx Gloabal Acadaemy.svg"]

WORKDIR /app/backend
RUN npm install --omit=dev

WORKDIR /app
COPY --from=build /app/backend/dist ./backend/dist
RUN mkdir -p /app/backend/data/documents /app/backend/data/submissions

WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/index.js"]
