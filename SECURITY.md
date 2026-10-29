# Security policy

## Reporting

Do not open a public issue containing credentials, personal data, or an exploitable vulnerability. Contact the repository owner through a private GitHub security advisory (Security → Report a vulnerability). If advisories are unavailable, request a private contact channel without disclosing the exploit.

## Deployment status

This is a demonstration MVP, not a certified production system. See [docs/SECURITY.md](docs/SECURITY.md) for the implemented controls, threat model, and required production hardening. Never upload patient, confidential, or unlawfully obtained data to the public demo. Disable demo access and registration-like bootstrap paths before handling private data. Rotate any credential that was ever committed; deleting a file does not remove Git history.
