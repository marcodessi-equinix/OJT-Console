import type {
  AdminSession,
  AppSettings,
  BatchSendResponse,
  EmployeeProfile,
  SubmissionListItem,
  SubmissionPayload,
  SubmissionResponse,
  TrainingSession,
  TrainingSessionListItem,
  TrainerSession,
  TrainingTemplate,
  TrainingTemplateSummary
} from "../types/training";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function normalizeSettings(settings: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    defaultPrimaryRecipient: settings?.defaultPrimaryRecipient ?? "",
    defaultCcMe: settings?.defaultCcMe ?? "",
    deliveryRecipients: Array.isArray(settings?.deliveryRecipients) ? settings.deliveryRecipients : [],
    smtpConfigured: Boolean(settings?.smtpConfigured)
  };
}

async function createApiError(response: Response): Promise<Error> {
  const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
  return new Error(errorBody?.message ?? "API request failed.");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const maxRetries = init?.method && init.method !== "GET" ? 0 : 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${apiBaseUrl}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {})
        },
        ...init
      });

      if (!response.ok) {
        throw await createApiError(response);
      }

      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError!;
}

export function fetchSettings(): Promise<AppSettings> {
  return request<Partial<AppSettings>>("/settings").then(normalizeSettings);
}

export function updateSettings(payload: { deliveryRecipients: string[] }): Promise<AppSettings> {
  return request<Partial<AppSettings>>("/settings", {
    method: "PATCH",
    body: JSON.stringify(payload)
  }).then(normalizeSettings);
}

export function fetchTemplates(): Promise<TrainingTemplateSummary[]> {
  return request<TrainingTemplateSummary[]>("/templates");
}

export function fetchTemplate(templateId: string): Promise<TrainingTemplate> {
  return request<TrainingTemplate>(`/templates/${templateId}`);
}

export function uploadTemplate(payload: {
  fileName: string;
  language: "English" | "German";
  team: "C-OPS" | "F-OPS";
  fileBase64: string;
}): Promise<TrainingTemplate> {
  return request<TrainingTemplate>("/templates/upload", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteTemplate(templateId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/templates/${templateId}`, {
    method: "DELETE"
  });
}

export function updateTemplateMeta(
  templateId: string,
  payload: { title?: string; language?: "English" | "German"; team?: "C-OPS" | "F-OPS" }
): Promise<TrainingTemplate> {
  return request<TrainingTemplate>(`/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function updateTemplateSection(
  templateId: string,
  sectionId: string,
  payload: { title?: string; content?: string }
): Promise<TrainingTemplate> {
  return request<TrainingTemplate>(`/templates/${templateId}/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function fetchEmployees(): Promise<EmployeeProfile[]> {
  return request<EmployeeProfile[]>("/employees");
}

export function loginAdmin(payload: { identifier: string; pin: string }): Promise<AdminSession> {
  return request<AdminSession>("/admin/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createEmployee(payload: Pick<EmployeeProfile, "firstName" | "lastName" | "email" | "role" | "team"> & { pin?: string }): Promise<EmployeeProfile> {
  return request<EmployeeProfile>("/employees", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateEmployee(
  id: string,
  payload: { firstName?: string; lastName?: string; email?: string; role?: string; team?: string; pin?: string }
): Promise<EmployeeProfile> {
  return request<EmployeeProfile>(`/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteEmployee(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/employees/${id}`, {
    method: "DELETE"
  });
}

export function bulkCreateEmployees(
  employees: Array<{ firstName?: string; lastName?: string; name?: string; email: string; role?: string; team?: string }>
): Promise<{ created: number; skipped: number; employees: EmployeeProfile[] }> {
  return request<{ created: number; skipped: number; employees: EmployeeProfile[] }>(
    "/employees/bulk",
    {
      method: "POST",
      body: JSON.stringify({ employees })
    }
  );
}

export function loginTrainer(payload: { identifier?: string; pin: string }): Promise<TrainerSession> {
  return request<TrainerSession>("/trainers/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTrainerProfile(
  id: string,
  payload: { pin?: string; signatureDataUrl?: string }
): Promise<TrainerSession> {
  return request<TrainerSession>(`/trainers/${id}/profile`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function fetchTrainingSessions(employeeId?: string): Promise<TrainingSessionListItem[]> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return request<TrainingSessionListItem[]>(`/training-sessions${query}`);
}

export function fetchTrainingSession(sessionId: string): Promise<TrainingSession> {
  return request<TrainingSession>(`/training-sessions/${sessionId}`);
}

export function createTrainingSession(payload: {
  employeeId: string;
  templateId: string;
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  primaryRecipient?: string;
}): Promise<TrainingSession> {
  return request<TrainingSession>("/training-sessions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTrainingSession(
  sessionId: string,
  payload: {
    status?: "assigned" | "in_progress" | "paused" | "completed" | "delivered" | "cancelled";
    deliveryStatus?: "pending" | "draft_saved" | "mail_prepared" | "sent" | "send_failed";
    currentIndex?: number;
    sectionReviews?: SubmissionPayload["sectionReviews"];
    notes?: string;
    primaryRecipient?: string;
    additionalCc?: string[];
    employeeSignatureDataUrl?: string;
    trainerSignatureDataUrl?: string;
    trainerName?: string;
    trainerEmail?: string;
    submissionId?: string;
  }
): Promise<TrainingSession> {
  return request<TrainingSession>(`/training-sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function submitTraining(payload: SubmissionPayload): Promise<SubmissionResponse> {
  return request<SubmissionResponse>("/submissions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function sendSubmissionBatch(payload: {
  employeeId: string;
  primaryRecipient: string;
  additionalCc?: string[];
}): Promise<BatchSendResponse> {
  return request<BatchSendResponse>("/submissions/send-batch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchSubmissions(employeeId?: string): Promise<SubmissionListItem[]> {
  const query = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : "";
  return request<SubmissionListItem[]>(`/submissions${query}`);
}

export async function fetchSubmissionPdf(submissionId: string): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`${apiBaseUrl}/submissions/${encodeURIComponent(submissionId)}/pdf`);

  if (!response.ok) {
    throw await createApiError(response);
  }

  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const fileNameMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1].replace(/\"/g, "")) : `${submissionId}.pdf`;

  return {
    blob: await response.blob(),
    fileName
  };
}
