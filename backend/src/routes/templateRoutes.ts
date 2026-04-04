import { Router, type Request, type Response } from "express";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { deleteTemplate, getTemplateById, listTemplates, updateTemplateMeta, updateTemplateSection, upsertTemplate } from "../repositories/templateRepository";
import {
  getStoredTemplateFilePath,
  getTemplateMimeType,
  isSupportedTemplateFile,
  parseTemplateFromBuffer
} from "../services/docxTemplateService";
import { documentsRoot } from "../config/paths";
import type { TemplateLanguage, TemplateTeam } from "../types/training";

function isValidTemplateTeam(value: unknown): value is TemplateTeam {
  return value === "C-OPS" || value === "F-OPS";
}

async function saveTemplateFile(templateId: string, sourceFile: string, buffer: Buffer): Promise<void> {
  await mkdir(documentsRoot, { recursive: true });
  await writeFile(getStoredTemplateFilePath(templateId, sourceFile), buffer);
}

export function createTemplateRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    response.json(listTemplates());
  });

  router.get("/:templateId", (request, response) => {
    const template = getTemplateById(request.params.templateId);

    if (!template) {
      response.status(404).json({ message: "Template not found." });
      return;
    }

    response.json(template);
  });

  const handleFileRequest = (request: Request, response: Response) => {
    const templateId = String(request.params.templateId);
    const template = getTemplateById(templateId);
    if (!template) {
      response.status(404).json({ message: "Template not found." });
      return;
    }

    const filePath = getStoredTemplateFilePath(templateId, template.sourceFile);

    if (!existsSync(filePath)) {
      response.status(404).json({ message: "Original document file not available for this template." });
      return;
    }

    response.setHeader("Content-Type", getTemplateMimeType(template.sourceFile));
    response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(template.sourceFile)}"`);
    response.sendFile(filePath);
  };

  router.get("/:templateId/file", handleFileRequest);
  router.get("/:templateId/docx", handleFileRequest);

  router.post("/upload", async (request, response, next) => {
    try {
      const { fileName, language, team, fileBase64 } = request.body as {
        fileName?: string;
        language?: TemplateLanguage;
        team?: TemplateTeam;
        fileBase64?: string;
      };

      if (!fileName || !language || !team || !fileBase64) {
        response.status(400).json({ message: "fileName, language, team, and fileBase64 are required." });
        return;
      }

      if (!["English", "German"].includes(language)) {
        response.status(400).json({ message: "language must be English or German." });
        return;
      }

      if (!isValidTemplateTeam(team)) {
        response.status(400).json({ message: "team must be C-OPS or F-OPS." });
        return;
      }

      if (!isSupportedTemplateFile(fileName)) {
        response.status(400).json({ message: "Allowed file types: DOC, DOCX, PDF, TXT." });
        return;
      }

      const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-\s()]/g, "_");
      const buffer = Buffer.from(fileBase64, "base64");
      const template = await parseTemplateFromBuffer(buffer, language, team, safeFileName);
      await upsertTemplate(template);
      await saveTemplateFile(template.id, safeFileName, buffer);

      response.json(template);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:templateId", async (request, response, next) => {
    try {
      const { title, language, team } = request.body as {
        title?: string;
        language?: TemplateLanguage;
        team?: TemplateTeam;
      };

      if (team !== undefined && !isValidTemplateTeam(team)) {
        response.status(400).json({ message: "team must be C-OPS or F-OPS." });
        return;
      }

      const updated = await updateTemplateMeta(request.params.templateId, { title, language, team });

      if (!updated) {
        response.status(404).json({ message: "Template not found." });
        return;
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:templateId/sections/:sectionId", async (request, response, next) => {
    try {
      const { title, content } = request.body as { title?: string; content?: string };
      const updated = await updateTemplateSection(
        request.params.templateId,
        request.params.sectionId,
        { title, content }
      );

      if (!updated) {
        response.status(404).json({ message: "Template or section not found." });
        return;
      }

      response.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:templateId", async (request, response, next) => {
    try {
      const deleted = await deleteTemplate(request.params.templateId);

      if (!deleted) {
        response.status(404).json({ message: "Template not found." });
        return;
      }

      response.json({ message: "Template deleted." });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
