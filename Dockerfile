# Container image for Docker-based free hosts (Koyeb, Fly.io, Railway, Google Cloud Run…).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
