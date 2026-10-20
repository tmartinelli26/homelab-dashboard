# Étape 1 : compiler le front
FROM node:22-slim AS front
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : installer les dépendances du backend (avec les outils de compilation)
FROM node:22-slim AS back
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Étape 3 : l'image finale, sans les outils
FROM node:22-slim
WORKDIR /app/backend
COPY --from=back /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=front /app/frontend/dist /app/frontend/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]