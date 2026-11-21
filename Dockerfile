# Family Care web app for a Docker host (Dokploy). The image holds no connection details: set
# VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key) in the service environment; they are
# written into /config.js when the container starts. Never put server keys there.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/family-care/nginx.conf
COPY --chmod=755 deploy/family-care-start.sh /docker-entrypoint.d/40-family-care-start.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
