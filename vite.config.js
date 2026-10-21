import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Cloudflare Pages response headers, generated so the API origin always matches the build's Supabase project.
// The app loads only its own scripts and styles, Google Fonts, and the Supabase API; it is never framed.
function securityHeaders(mode) {
  return {
    name: "family-care-security-headers",
    apply: "build",
    generateBundle() {
      const api = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL;
      if (!api) throw new Error("VITE_SUPABASE_URL is required to build the Content-Security-Policy");
      const origin = new URL(api).origin;
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        `connect-src 'self' ${origin}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ");
      const headers = [
        "/*",
        `  Content-Security-Policy: ${policy}`,
        "  X-Frame-Options: DENY",
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
        "  Strict-Transport-Security: max-age=31536000",
        "",
      ].join("\n");
      this.emitFile({ type: "asset", fileName: "_headers", source: headers });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), securityHeaders(mode)],
  server: { port: 3000 },
}));
