/**
 * Access scope wording shared by every place a role is displayed.
 * An organisation administrator's membership is not "project scoped" — the role
 * reaches every project in the organisation (Part 3.1).
 */
export const ORGANISATION_WIDE_ROLES = ['organisation_admin', 'platform_admin'] as const;

export function accessScopeLabel(role: string | null | undefined) {
  return ORGANISATION_WIDE_ROLES.includes(role as (typeof ORGANISATION_WIDE_ROLES)[number])
    ? 'Organisation-wide'
    : 'Project scoped';
}

export function isOrganisationWide(role: string | null | undefined) {
  return accessScopeLabel(role) === 'Organisation-wide';
}
