import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { setupAuth, safeUser } from "./auth";
import type { User } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  // POST /api/login
  app.post(
    "/api/login",
    passport.authenticate("local"),
    (req: Request, res: Response) => {
      res.json(safeUser(req.user as User));
    }
  );

  // POST /api/logout
  app.post("/api/logout", (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  // GET /api/me — returns current session user or 401
  app.get("/api/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.json(safeUser(req.user as User));
  });

  return httpServer;
}
