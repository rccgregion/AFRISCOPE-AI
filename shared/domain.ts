export const ROLES = [
  'platform_admin',
  'organisation_admin',
  'programme_manager',
  'data_analyst',
  'operator',
  'reviewer',
  'executive',
] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform administrator',
  organisation_admin: 'Organisation administrator',
  programme_manager: 'Programme manager',
  data_analyst: 'Data analyst',
  operator: 'Programme / facility operator',
  reviewer: 'Reviewer & approver',
  executive: 'Executive · read only',
};
export type RecommendationState =
  | 'Draft'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Deferred'
  | 'Implemented'
  | 'Outcome Reviewed';
export const TRANSITIONS: Record<RecommendationState, RecommendationState[]> = {
  Draft: ['Under Review'],
  'Under Review': ['Approved', 'Rejected', 'Deferred'],
  Approved: ['Implemented'],
  Rejected: ['Draft'],
  Deferred: ['Under Review', 'Draft'],
  Implemented: ['Outcome Reviewed'],
  'Outcome Reviewed': [],
};
export type Permission = 'read' | 'data' | 'manage' | 'operate' | 'approve' | 'admin';
const permissions: Record<Role, Permission[]> = {
  platform_admin: ['read', 'data', 'manage', 'operate', 'approve', 'admin'],
  organisation_admin: ['read', 'data', 'manage', 'operate', 'approve', 'admin'],
  programme_manager: ['read', 'data', 'manage', 'operate'],
  data_analyst: ['read', 'data'],
  operator: ['read', 'operate'],
  reviewer: ['read', 'approve'],
  executive: ['read'],
};
export function can(role: Role | undefined, permission: Permission) {
  return !!role && permissions[role].includes(permission);
}
export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  is_platform_admin: boolean;
}
export interface Membership {
  organisation_id: string;
  project_id: string | null;
  role: Role;
  organisation_name?: string;
}
export interface Project {
  id: string;
  organisation_id: string;
  title: string;
  sector: string;
  countries: string;
  description: string;
  status: string;
  settings: Record<string, number>;
  created_at: string;
}
export interface Evidence {
  id: string;
  project_id: string;
  question: string;
  method: string;
  method_version: string;
  result: Record<string, unknown>;
  assumptions: string[];
  limitations: string[];
  source_versions: { dataset_id: string; version_id: string; version: number }[];
  reporting_period: string;
  freshness: string;
  classification: string;
  created_at: string;
}
export interface Recommendation {
  id: string;
  project_id: string;
  title: string;
  problem: string;
  proposed_action: Record<string, unknown>;
  expected_benefit: string;
  risks: string[];
  assumptions: string[];
  limitations: string[];
  state: RecommendationState;
  owner_id: string;
  evidence_ids: string[];
  created_at: string;
  review_date: string | null;
}
export interface InventoryRecord {
  id: string;
  project_id: string;
  facility_id: string;
  product_id: string;
  reporting_date: string;
  opening_stock: number;
  quantity_received: number;
  quantity_dispensed: number;
  adjustments: number;
  closing_stock: number;
  usable_stock: number;
  reserved_stock: number;
  expired_stock: number;
  stockout_days: number;
  expiry_date: string;
  batch_identifier: string;
  minimum_stock: number;
  maximum_stock: number;
  quality_status: string;
  source_row: number;
}
export interface StockRow extends InventoryRecord {
  facility_name: string;
  district: string;
  product_name: string;
  unit: string;
  daily_consumption: number | null;
  days_of_stock: number | null;
  expected_delivery: string | null;
  risk: 'Critical' | 'Elevated' | 'Stable' | 'Unknown' | 'No demand';
  reason: string;
  transfer_opportunity?: {
    donor_id: string;
    donor_name: string;
    recipient_id: string;
    recipient_name: string;
    product_id: string;
    product_name: string;
    quantity: number;
    unit: string;
    transit_days: number;
    donor_days_after: number;
    recipient_days_after: number;
    source_records: string[];
    constraints: string[];
  } | null;
}
export interface ForecastPoint {
  date: string;
  actual: number | null;
  predicted: number | null;
  lower: number | null;
  upper: number | null;
}
export interface ForecastMetric {
  method: string;
  mae: number;
  wape: number | null;
  bias: number;
  n: number;
}
export interface ForecastResult {
  metrics: ForecastMetric[];
  best_method: string;
  train_period: string;
  validation_period: string;
  horizon: number;
  series: { key: string; name: string; points: ForecastPoint[] }[];
  limitations: string[];
}
export const money = (value: number, currency = 'USD') =>
  new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
    value,
  );
export const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);
export const dateLabel = (date: string | null | undefined) =>
  date
    ? new Date(date.length === 10 ? date + 'T12:00:00Z' : date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Not set';
export const DEMO_ORG = '00000000-0000-4000-8000-000000000001';
export const DEMO_PROJECTS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];
export const AS_OF = '2026-09-30';
