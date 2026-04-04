import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { createAdminRouter } from "./routes/adminRoutes";
import { env } from "./config/env";
import { appDatabase } from "./db/database";
import { createEmployeeRouter } from "./routes/employeeRoutes";
import { createSettingsRouter } from "./routes/settingsRoutes";
import { createSubmissionRouter } from "./routes/submissionRoutes";
import { createTemplateRouter } from "./routes/templateRoutes";
import { createTrainerRouter } from "./routes/trainerRoutes";
import { ensureTrainerDefaultPins } from "./repositories/employeeRepository";
import { syncTemplatesFromDocuments } from "./services/docxTemplateService";

async function bootstrap(): Promise<void> {
  await appDatabase.initialize();
  await ensureTrainerDefaultPins();
  await syncTemplatesFromDocuments();

  const app = express();

  app.use(
    cors({
      origin: [
        env.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174"
      ],
      credentials: false
    })
  );
  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/admin", createAdminRouter());
  app.use("/api/employees", createEmployeeRouter());
  app.use("/api/trainers", createTrainerRouter());
  app.use("/api/settings", createSettingsRouter());
  app.use("/api/templates", createTemplateRouter());
  app.use("/api/submissions", createSubmissionRouter());

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: "Validation failed.",
        issues: error.issues
      });
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected server error.";
    response.status(500).json({ message });
  });

  app.listen(env.PORT, () => {
    console.log(`Backend listening on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});