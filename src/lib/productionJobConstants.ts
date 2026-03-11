/** Production job statuses (DB values snake_case) */
export const JOB_STATUSES = [
  "design_review",
  "plate_making",
  "printing",
  "cutting_binding",
  "quality_check",
  "ready_dispatch",
  "completed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

/** Display labels for job statuses */
export const JOB_STATUS_LABELS: Record<string, string> = {
  design_review: "Design Review",
  plate_making: "Plate Making",
  printing: "Printing",
  cutting_binding: "Cutting / Binding",
  quality_check: "Quality Check",
  ready_dispatch: "Ready to Dispatch",
  completed: "Completed",
};

/** Status that triggers order auto-update when all jobs reach it */
export const JOB_STATUS_READY_DISPATCH = "ready_dispatch";
