import type { Express } from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Proxy all /api/* requests to FastAPI, stripping the /api prefix.
  // Cookies (refresh_token HttpOnly) are forwarded transparently.
  app.use(
    "/api",
    createProxyMiddleware({
      target: BACKEND_URL,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
      on: {
        error: (_err, _req, res) => {
          const httpRes = res as import("http").ServerResponse;
          if (!httpRes.headersSent) {
            httpRes.writeHead(502, { "Content-Type": "application/json" });
            httpRes.end(JSON.stringify({ message: "Backend unavailable. Is FastAPI running?" }));
          }
        },
      },
    })
  );

  return httpServer;
}
