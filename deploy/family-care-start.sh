#!/bin/sh
# Runs before nginx starts (nginx image /docker-entrypoint.d). Writes the public Supabase connection details from the
# container environment into /config.js and points the Content-Security-Policy at the same project.
set -eu
url="${VITE_SUPABASE_URL:-}"
key="${VITE_SUPABASE_ANON_KEY:-}"
url="${url%/}"
if [ -z "$url" ] || [ -z "$key" ]; then
  echo "family-care: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the service environment" >&2
  exit 1
fi
# Only plain https origins and key characters are accepted, so nothing can be injected into the page or the config.
if ! printf '%s' "$url" | grep -Eq '^https://[A-Za-z0-9.-]+$'; then
  echo "family-care: VITE_SUPABASE_URL must look like https://<ref>.supabase.co" >&2
  exit 1
fi
if ! printf '%s' "$key" | grep -Eq '^[A-Za-z0-9._-]+$'; then
  echo "family-care: VITE_SUPABASE_ANON_KEY has unexpected characters (use the publishable key)" >&2
  exit 1
fi
case "$key" in sb_secret_*) echo "family-care: that is a secret key; use the publishable key" >&2; exit 1;; esac
printf 'window.__FC_CONFIG__ = {"supabaseUrl":"%s","supabaseKey":"%s"};\n' "$url" "$key" > /usr/share/nginx/html/config.js
sed "s#__API_ORIGIN__#${url}#g" /etc/family-care/nginx.conf > /etc/nginx/conf.d/default.conf
echo "family-care: connected to ${url}"
