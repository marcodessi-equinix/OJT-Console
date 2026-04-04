import type { SubmissionResponse } from "../types/training";
import { useLanguage } from "../features/language/LanguageProvider";

interface Props {
  result: SubmissionResponse;
}

export function SubmissionResult({ result }: Props) {
  const { messages } = useLanguage();
  const statusLabel = result.sendStatus === "sent"
    ? messages.common.submissionStatus.sent
    : result.sendStatus === "completed"
      ? messages.common.submissionStatus.completed
    : result.sendStatus === "send_failed"
      ? messages.common.submissionStatus.failed
      : messages.common.submissionStatus.draft;

  return (
    <div className={`result-banner ${result.emailDelivered ? "success" : "warn"}`}>
      <span>{result.emailDelivered ? messages.delivery.sendSuccess : result.emailMessage}</span>
      <span className={`badge ${result.emailDelivered ? "badge-success" : "badge-warn"}`}>
        {statusLabel}
      </span>
    </div>
  );
}
