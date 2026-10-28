import { makeId } from "@/lib/random";
import type { JobEvent, JobEventType, Millis } from "@/types/domain";

export const makeEvent = (jobId: string, type: JobEventType, text: string, at: Millis): JobEvent => ({
  id: makeId("ev"),
  jobId,
  type,
  at,
  text,
});
