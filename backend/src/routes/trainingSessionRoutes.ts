import { Router } from "express";
import { z } from "zod";
import { getEmployeeById } from "../repositories/employeeRepository";
import { getTemplateById } from "../repositories/templateRepository";
import {
  createTrainingSession,
  getTrainingSessionById,
  listTrainingSessions,
  updateTrainingSession
} from "../repositories/trainingSessionRepository";

const sectionReviewSchema = z.object({
  sectionId: z.string().trim().min(1),
  acknowledged: z.boolean(),
  note: z.string().trim().optional()
});

const signatureFieldSchema = z.union([z.literal(""), z.string().startsWith("data:image/png;base64,")]).default("");

const createSchema = z.object({
  employeeId: z.string().trim().min(1),
  templateId: z.string().trim().min(1),
  trainerId: z.string().trim().min(1),
  trainerName: z.string().trim().min(1),
  trainerEmail: z.email(),
  primaryRecipient: z.union([z.literal(""), z.email()]).optional().default("")
});

const updateSchema = z.object({
  status: z.enum(["assigned", "in_progress", "paused", "completed", "delivered", "cancelled"]).optional(),
  deliveryStatus: z.enum(["pending", "draft_saved", "mail_prepared", "sent", "send_failed"]).optional(),
  currentIndex: z.number().int().min(0).optional(),
  sectionReviews: z.array(sectionReviewSchema).optional(),
  notes: z.string().optional(),
  primaryRecipient: z.union([z.literal(""), z.email()]).optional(),
  additionalCc: z.array(z.email()).optional(),
  employeeSignatureDataUrl: signatureFieldSchema.optional(),
  trainerSignatureDataUrl: signatureFieldSchema.optional(),
  trainerName: z.string().trim().min(1).optional(),
  trainerEmail: z.email().optional(),
  submissionId: z.string().trim().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one session field must be updated."
});

export function createTrainingSessionRouter(): Router {
  const router = Router();

  router.get("/", (request, response) => {
    const employeeId = typeof request.query.employeeId === "string" ? request.query.employeeId : undefined;
    const trainerId = typeof request.query.trainerId === "string" ? request.query.trainerId : undefined;
    const status = typeof request.query.status === "string" ? request.query.status as never : undefined;
    response.json(listTrainingSessions({ employeeId, trainerId, status, excludeCancelled: true }));
  });

  router.get("/:sessionId", (request, response) => {
    const session = getTrainingSessionById(request.params.sessionId);

    if (!session) {
      response.status(404).json({ message: "Training session not found." });
      return;
    }

    response.json(session);
  });

  router.post("/", async (request, response, next) => {
    try {
      const parsed = createSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      const template = getTemplateById(parsed.templateId);

      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      if (!template) {
        response.status(404).json({ message: "Template not found." });
        return;
      }

      const session = await createTrainingSession(parsed);
      response.status(201).json(session);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:sessionId", async (request, response, next) => {
    try {
      const parsed = updateSchema.parse(request.body);
      const session = await updateTrainingSession(request.params.sessionId, parsed);
      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  return router;
}