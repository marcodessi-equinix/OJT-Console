import { resolve } from "node:path";

export const workspaceRoot = resolve(__dirname, "../../..");
export const backendRoot = resolve(workspaceRoot, "backend");
export const dataRoot = resolve(backendRoot, "data");
export const submissionsRoot = resolve(dataRoot, "submissions");
export const documentsRoot = resolve(dataRoot, "documents");
export const databaseFile = resolve(dataRoot, "ojt-app.db");
