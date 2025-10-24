# Secrets Management Policy

## Approved Secrets

| Secret | Type | Rotation | Usage |
|--------|------|----------|-------|
| `DEEPSEEK_API_KEY` | API Key | 90 days | Tier 1/2 AI calls |
| `OPENAI_API_KEY` | API Key | 90 days | Tier 2/3 AI calls |
| `GITHUB_TOKEN` | Ephemeral (GitHub Action) | Per-run | GitHub API interactions |
| `SNYK_TOKEN` | API Key | 180 days | Weekly SCA workflow |

## Forbidden Patterns

- `.env` files or secrets in version control
- Hardcoded credentials or personal access tokens (PATs)
- Sharing secrets via GitHub issues, PRs, or logs
- Long-lived PATs (prefer GitHub-issued workflow tokens with OIDC)

## Validation & Monitoring

- `gitleaks` runs on every push/PR (see `.github/workflows/security.yml`).
- Weekly scheduled scans ensure no regressions across branches.
- Manual quarterly review confirms rotation cadence and access lists.

## Incident Response

1. Immediately revoke exposed credentials via provider dashboard.
2. Rotate impacted secrets and update GitHub repository secrets.
3. Run the security scan workflow manually to confirm clean state.
4. Document the incident and mitigation steps in SECURITY.md.
