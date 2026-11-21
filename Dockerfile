# Family Care web app for a Docker host (Dokploy). Only public build values are passed in:
# VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable key). Never pass server keys here.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" || { echo 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY build arguments are required'; exit 1; }
RUN npm run build
# Same response headers as the Cloudflare build, with the Content-Security-Policy pointing at this build's Supabase project.
RUN API_ORIGIN=$(node -e "console.log(new URL(process.env.VITE_SUPABASE_URL).origin)") \
 && sed "s#__API_ORIGIN__#${API_ORIGIN}#" deploy/nginx.conf > /app/nginx.conf

FROM nginx:1.27-alpine
COPY --from=build /app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
