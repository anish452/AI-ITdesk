import { cn } from '../../lib/utils';

const tones: Record<string, string> = {
  CRITICAL: 'bg-[#f8e4e4] text-bad',
  HIGH: 'bg-[#f8ead4] text-warn',
  MEDIUM: 'bg-[#ece7dc] text-ink',
  LOW: 'bg-moss text-good',
  P1: 'bg-[#f8e4e4] text-bad',
  P2: 'bg-[#f8ead4] text-warn',
  P3: 'bg-[#ece7dc] text-ink',
  P4: 'bg-moss text-good',
  ESCALATED: 'bg-[#f8e4e4] text-bad',
  RESOLVED: 'bg-moss text-good',
  PENDING_REVIEW: 'bg-copper-soft text-copper',
  IN_PROGRESS: 'bg-[#e7eef8] text-[#1d4e89]',
  CLASSIFYING: 'bg-[#ece7dc] text-muted',
  RECOMMENDING: 'bg-[#ece7dc] text-muted',
  SUBMITTED: 'bg-[#ece7dc] text-muted',
  LEARNED_PATTERN: 'bg-[#efe7f8] text-[#5b3d86]',
  APPROVED_ARTICLE: 'bg-moss text-good',
};

export function Badge({ value, children }: { value?: string; children?: React.ReactNode }) {
  const key = value ?? '';
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', tones[key] ?? 'bg-[#ece7dc] text-ink')}>{children ?? key}</span>;
}
