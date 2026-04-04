import { Router } from "express";
import { z } from "zod";
import { env, smtpConfigured } from "../config/env";
import { getStoredDeliveryRecipients, saveDeliveryRecipients } from "../repositories/settingsRepository";

const settingsSchema = z.object({
  deliveryRecipients: z.array(z.email()).min(1)
});

function getFallbackRecipients(): string[] {
  return (env.DEFAULT_PRIMARY_RECIPIENT ?? "")
    .split(/[;,\n]/)
    .map((recipient) => recipient.trim().toLowerCase())
    .filter(Boolean);
}

function readSettings() {
  const deliveryRecipients = getStoredDeliveryRecipients();
  const effectiveRecipients = deliveryRecipients.length ? deliveryRecipients : getFallbackRecipients();

  return {
    defaultPrimaryRecipient: effectiveRecipients[0] ?? "",
    defaultCcMe: "",
    deliveryRecipients: effectiveRecipients,
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
      response.json(readSettings());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
