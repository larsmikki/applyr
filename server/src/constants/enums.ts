// Single source of truth for the enum values stored in user-facing columns.
// These match the CHECK constraint on applications.status in the initial migration.

export const APPLICATION_STATUSES = [
  'draft',
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
const APPLICATION_STATUS_SET: ReadonlySet<string> = new Set(APPLICATION_STATUSES);
export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && APPLICATION_STATUS_SET.has(value);
}

export const VAULT_DOC_TYPES = [
  'cv',
  'cover_letter',
  'portfolio',
  'other',
  'cover_letter_template',
  'attachment',
] as const;
export type VaultDocType = (typeof VAULT_DOC_TYPES)[number];
const VAULT_DOC_TYPE_SET: ReadonlySet<string> = new Set(VAULT_DOC_TYPES);
export function isVaultDocType(value: unknown): value is VaultDocType {
  return typeof value === 'string' && VAULT_DOC_TYPE_SET.has(value);
}
