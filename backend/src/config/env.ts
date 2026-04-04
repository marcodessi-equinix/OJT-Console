import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { workspaceRoot } from "./paths";

dotenv.config({ path: resolve(workspaceRoot, ".env") });

const optionalString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().optional());

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),
  ADMIN_IDENTIFIER: z.string().trim().min(1).default("admin"),
  ADMIN_NAME: z.string().trim().min(1).default("OJT Admin"),
  ADMIN_PIN: z.string().trim().regex(/^\d{4}(?:\d{2})?$/).default("1234"),
  MAIL_FROM: optionalString,
  DEFAULT_PRIMARY_RECIPIENT: optionalString,
  DEFAULT_CC_ME: optionalString,
  DOCUMENTS_ROOT: optionalString,
  ENGLISH_DOCUMENTS_ROOT: optionalString,
  GERMAN_DOCUMENTS_ROOT: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString
});

export const env = envSchema.parse(process.env);

export const smtpConfigured = Boolean(
  env.MAIL_FROM && env.SMTP_HOST && env.SMTP_PORT && env.DEFAULT_PRIMARY_RECIPIENT
);
