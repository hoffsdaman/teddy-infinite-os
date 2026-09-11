// Client-safe salary types. No server-only imports (compensation.ts, which
// pulls in the service-role client, re-exports these), so the Compensation UI
// can import from here without dragging secrets into the client bundle.
// Salaries are monthly AUD cents — AUD is the only currency in the system.

// The compensation.comp_type value for a monthly base salary (an allowed value
// in the compensation_comp_type_check constraint).
export const COMP_TYPE_SALARY = "base_salary";

export type SalaryRow = {
  id: string;
  salaryAudCents: number | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  isCurrent: boolean;
  changeReason: string | null;
  createdAt: string;
};

export type SalaryChangeInput = {
  salaryAudCents: number;
  effectiveFrom: string; // "YYYY-MM-DD"
  changeReason?: string | null;
};
