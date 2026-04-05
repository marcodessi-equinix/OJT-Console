import { Router } from "express";
import { z } from "zod";
import {
  createModuleRegistration,
  createModuleRegistrations,
  getModuleRegistrationById,
  listModuleRegistrations
} from "../repositories/moduleRegistrationRepository";
import { getModuleKey } from "../utils/moduleIdentity";

const createSchema = z.object({
  employeeId: z.string().trim().min(1),
  templateId: z.string().trim().min(1)
});

const createBatchSchema = z.object({
  employeeId: z.string().trim().min(1),
  templateIds: z.array(z.string().trim().min(1)).min(1)
});

export function createModuleRegistrationRouter(): Router {
  const router = Router();

  router.get("/", (request, response) => {
    const employeeId = typeof request.query.employeeId === "string" ? request.query.employeeId : undefined;
    const team = request.query.team === "C-OPS" || request.query.team === "F-OPS"
      ? request.query.team
      : undefined;
    const moduleKey = typeof request.query.moduleKey === "string" && request.query.moduleKey.trim()
      ? getModuleKey(request.query.moduleKey)
      : undefined;
    const status = request.query.status === "pending" || request.query.status === "completed"
      ? request.query.status
      : undefined;

    response.json(listModuleRegistrations({ employeeId, team, moduleKey, status }));
  });

  router.get("/:registrationId", (request, response) => {
    const registration = getModuleRegistrationById(request.params.registrationId);

    if (!registration) {
      response.status(404).json({ message: "Registration not found." });
      return;
    }

    response.json(registration);
  });

  router.post("/", async (request, response, next) => {
    try {
      const parsed = createSchema.parse(request.body);
      const registration = await createModuleRegistration(parsed);
      response.status(201).json(registration);
    } catch (error) {
      next(error);
    }
  });

  router.post("/batch", async (request, response, next) => {
    try {
      const parsed = createBatchSchema.parse(request.body);
      const result = await createModuleRegistrations(parsed);
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}