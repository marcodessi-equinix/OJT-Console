export type TemplateLanguage = "English" | "German";
export type Team = "C-OPS" | "F-OPS";
export type TemplateTeam = Team;
export type EmployeeTeam = Team;
export type SubmissionSendStatus = "draft" | "sent" | "send_failed";
export type TrainingSessionStatus = "assigned" | "in_progress" | "paused" | "completed" | "delivered" | "cancelled";
export type TrainingSessionDeliveryStatus = "pending" | "draft_saved" | "mail_prepared" | "sent" | "send_failed";

export interface AppSettings {
  defaultPrimaryRecipient: string;
  defaultCcMe: string;
  deliveryRecipients: string[];
  smtpConfigured: boolean;
}

export type EmployeeRole = "employee" | "trainer";

export interface EmployeeProfile {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: EmployeeRole;
  team: EmployeeTeam;
  hasPin: boolean;
  createdAt: string;
}

export interface AdminSession {
  identifier: string;
  name: string;
  role: "admin";
}

export interface TrainerSession {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  createdAt: string;
  hasPin: boolean;
  mustChangePin: boolean;
  signatureDataUrl?: string;
}

export interface TrainingSection {
  id: string;
  title: string;
  content: string;
  tableIndex: number;
  rowIndex: number;
}

export interface TrainingTemplateSummary {
  id: string;
  slug: string;
  title: string;
  language: TemplateLanguage;
  team: TemplateTeam;
  sourceFile: string;
  importedAt: string;
  sectionCount: number;
}

export interface TrainingTemplate extends TrainingTemplateSummary {
  sections: TrainingSection[];
}

export interface SectionReview {
  sectionId: string;
  acknowledged: boolean;
  note?: string;
}

export interface TrainingSession {
  id: string;
  employeeId: string;
  templateId: string;
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  status: TrainingSessionStatus;
  deliveryStatus: TrainingSessionDeliveryStatus;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
  deliveryUpdatedAt?: string;
  currentIndex: number;
  sectionReviews: SectionReview[];
  notes?: string;
  primaryRecipient: string;
  additionalCc: string[];
  employeeSignatureDataUrl: string;
  trainerSignatureDataUrl: string;
  submissionId?: string;
}

export interface TrainingSessionListItem extends TrainingSession {
  employeeName: string;
  employeeEmail: string;
  employeeTeam: EmployeeTeam;
  templateTitle: string;
  templateLanguage: TemplateLanguage;
  templateTeam: TemplateTeam;
  totalSections: number;
  acknowledgedSections: number;
}

export interface SubmissionPayload {
  trainingSessionId?: string;
  employeeId: string;
  templateId: string;
  employeeName: string;
  employeeEmail: string;
  trainerName: string;
  trainerEmail: string;
  supervisorEmail?: string;
  primaryRecipient: string;
  additionalCc?: string[];
  notes?: string;
  employeeSignatureDataUrl: string;
  trainerSignatureDataUrl: string;
  deliveryMode: "draft" | "send";
  sectionReviews: SectionReview[];
}

export interface SubmissionResponse {
  id: string;
  pdfPath: string;
  emailDelivered: boolean;
  emailMessage: string;
  ccRecipients: string[];
  sendStatus: SubmissionSendStatus;
  isComplete: boolean;
}

export interface SubmissionListItem {
  id: string;
  trainingSessionId?: string;
  employeeId: string;
  templateId: string;
  templateTitle: string;
  language: TemplateLanguage;
  employeeName: string;
  employeeEmail: string;
  trainerName: string;
  trainerEmail: string;
  primaryRecipient: string;
  ccRecipients: string[];
  pdfPath: string;
  createdAt: string;
  emailDelivered: boolean;
  emailMessage: string;
  sendStatus: SubmissionSendStatus;
  isComplete: boolean;
  sentAt?: string;
}

export interface BatchSendResponse {
  employeeId: string;
  count: number;
  emailDelivered: boolean;
  emailMessage: string;
  sentAt?: string;
}
