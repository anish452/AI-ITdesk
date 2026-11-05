import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function ticketNo(number: number): string {
  return `NL-${1000 + number}`;
}

export const REQUEST_CATEGORIES = [
  'ERP',
  'MES',
  'IDENTITY_ACCESS',
  'NETWORK',
  'HARDWARE',
  'SOFTWARE',
  'CYBERSECURITY',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  ERP: 'ERP',
  MES: 'MES',
  IDENTITY_ACCESS: 'Identity & access',
  NETWORK: 'Network',
  HARDWARE: 'Hardware',
  SOFTWARE: 'Software',
  CYBERSECURITY: 'Cybersecurity',
};

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return CATEGORY_LABEL[value] ?? pretty(value);
}

export function pretty(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function when(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function percent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)}%`;
}
