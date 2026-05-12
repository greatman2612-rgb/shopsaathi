export const PLAN_LIMITS = {
  free: {
    maxBillsPerMonth: 30,
    hasInventory: false,
    hasReports: false,
    hasAI: false,
    hasWhatsappReminder: false,
  },
  basic: {
    maxBillsPerMonth: Infinity,
    hasInventory: false,
    hasReports: true,
    hasAI: false,
    hasWhatsappReminder: true,
  },
  pro: {
    maxBillsPerMonth: Infinity,
    hasInventory: true,
    hasReports: true,
    hasAI: true,
    hasWhatsappReminder: true,
  },
  business: {
    maxBillsPerMonth: Infinity,
    hasInventory: true,
    hasReports: true,
    hasAI: true,
    hasWhatsappReminder: true,
  },
} as const;

export type PlanKey = keyof typeof PLAN_LIMITS;
