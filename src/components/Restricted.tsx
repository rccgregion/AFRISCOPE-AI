import { Link } from 'react-router-dom';
import { Empty, PageHeader } from './ui';
import { ROLE_LABELS, type Role } from '../../shared/domain';

/**
 * Shown *instead of* a page a role cannot use. Rendering the notice above the
 * real page stacked "Administrator access required" on top of live administrator
 * content (Part 3.1).
 */
export function RestrictedAdministration({ role }: { role: Role | string }) {
  return (
    <>
      <PageHeader
        eyebrow="ORGANISATION ADMINISTRATION"
        title="Administrator access required"
        description={`Your current role (${ROLE_LABELS[role as Role] ?? role}) cannot manage organisation membership, invitations or sample-data controls. Ask an organisation administrator if you need this access.`}
      />
      <Empty
        title="Nothing is hidden behind this page"
        description="Administration holds membership, invitations, sample-data controls and connector settings only. No analysis, evidence or project data lives here."
        action={
          <Link to="/" className="btn btn-secondary">
            Return to overview
          </Link>
        }
      />
    </>
  );
}
