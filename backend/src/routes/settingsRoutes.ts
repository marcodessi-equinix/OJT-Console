import { Router } from "express";
import { z } from "zod";
import { smtpConfigured } from "../config/env";
import { readDeliverySettings, saveDeliveryEmailTemplates, saveDeliveryRecipients } from "../repositories/settingsRepository";

const settingsSchema = z.object({
  deliveryRecipients: z.array(z.email()).min(1),
  deliveryEmailSubjectTemplate: z.string().trim().min(1),
  deliveryEmailBodyTemplate: z.string().trim().min(1)
});

function readSettings() {
  const settings = readDeliverySettings();

  return {
    ...settings,
    smtpConfigured
  };
}

export function createSettingsRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json(readSettings());
  });

  router.patch("/", async (request, response, next) => {
    try {
      const parsed = settingsSchema.parse(request.body);
      await saveDeliveryRecipients(parsed.deliveryRecipients);
      await saveDeliveryEmailTemplates({
        subjectTemplate: parsed.deliveryEmailSubjectTemplate,
        bodyTemplate: parsed.deliveryEmailBodyTemplate
      });
      response.json(readSettings());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
