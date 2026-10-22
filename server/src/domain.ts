export const CATEGORIES = [
  'ERP',
  'MES',
  'IDENTITY_ACCESS',
  'NETWORK',
  'HARDWARE',
  'SOFTWARE',
  'CYBERSECURITY',
] as const;

export const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const PRIORITIES = ['P4', 'P3', 'P2', 'P1'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Urgency = (typeof URGENCIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Role = 'EMPLOYEE' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN';

export const CATEGORY_LABEL: Record<Category, string> = {
  ERP: 'ERP',
  MES: 'MES',
  IDENTITY_ACCESS: 'Identity & access',
  NETWORK: 'Network',
  HARDWARE: 'Hardware',
  SOFTWARE: 'Software',
  CYBERSECURITY: 'Cybersecurity',
};

export const PRIORITY_FOR_URGENCY: Record<Urgency, Priority> = {
  LOW: 'P4',
  MEDIUM: 'P3',
  HIGH: 'P2',
  CRITICAL: 'P1',
};

export function urgencyRank(urgency: Urgency): number {
  return URGENCIES.indexOf(urgency);
}

export type Scenario = {
  key: string;
  category: Category;
  system: string;
  urgency: Urgency;
  priority: Priority;
  heldOut: boolean;
  articleTitle: string;
  steps: string[];
  resolution: string;
  titles: string[];
  details: string[];
};

export type ClassifiedTicket = {
  category: Category;
  urgency: Urgency;
  priority: Priority;
  confidence: number;
  rationale: string;
  method: string;
};

export type RetrievedHit = {
  id: string;
  title: string;
  body: string;
  category: string;
  system: string;
  sourceType: string;
  scenarioKey: string | null;
  score: number;
};

export type ResolutionDraft = {
  problem: string;
  steps: string[];
  references: { id: string; title: string; score: number; sourceType: string }[];
  confidence: number;
  warning: string | null;
  grounded: boolean;
  generator: string;
};
