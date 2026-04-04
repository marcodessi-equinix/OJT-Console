import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import type { AdminSession } from "../types/training";

const pinSchema = z.string().trim().regex(/^\d{4}(?:\d{2})?$/, "PIN must be 4 or 6 digits.");

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  pin: pinSchema
});

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function createAdminRouter(): Router {
  const router = Router();

  router.post("/login", (request, response, next) => {
    try {
      const parsed = loginSchema.parse(request.body);

      if (normalizeIdentifier(parsed.identifier) !== normalizeIdentifier(env.ADMIN_IDENTIFIER) || parsed.pin !== env.ADMIN_PIN) {
        throw new Error("Invalid admin credentials.");
      }

      const session: AdminSession = {
        identifier: env.ADMIN_IDENTIFIER,
        name: env.ADMIN_NAME,
        role: "admin"
      };

      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  return router;
}