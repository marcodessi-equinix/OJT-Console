import { Router } from "express";
import { z } from "zod";
import { authenticateTrainer, authenticateTrainerByPin, updateTrainerProfile } from "../repositories/employeeRepository";

const pinSchema = z.string().trim().regex(/^\d{4}(?:\d{2})?$/, "PIN must be 4 or 6 digits.");

const loginSchema = z.object({
  identifier: z.string().trim().min(2).optional(),
  pin: pinSchema
});

const updateProfileSchema = z.object({
  pin: pinSchema.optional(),
  signatureDataUrl: z.union([
    z.string().startsWith("data:image/png;base64,"),
    z.literal("")
  ]).optional()
}).refine((value) => value.pin !== undefined || value.signatureDataUrl !== undefined, {
  message: "At least one profile field is required."
});

export function createTrainerRouter(): Router {
  const router = Router();

  router.post("/login", async (request, response, next) => {
    try {
      const parsed = loginSchema.parse(request.body);
      const trainer = parsed.identifier
        ? await authenticateTrainer({ identifier: parsed.identifier, pin: parsed.pin })
        : await authenticateTrainerByPin(parsed.pin);
      response.json(trainer);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:id/profile", async (request, response, next) => {
    try {
      const parsed = updateProfileSchema.parse(request.body);
      const trainer = await updateTrainerProfile(request.params.id, parsed);
      response.json(trainer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}