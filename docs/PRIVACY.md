# Homeostat Privacy & Compliance

## Privacy Guarantees

### Zero PII Leaks

**Commitment**: Homeostat **never** sends personally identifiable information (PII) to AI models or external services.

**Implementation**:
1. **Client-side sanitization** (Logger): PII removed before GitHub issue creation
2. **Server-side sanitization** (Homeostat): Additional PII redaction before AI calls
3. **Continuous validation**: Security test suite verifies zero leaks

---

## GDPR/CCPA Compliance

### Data Processing

| Data Type | Collected | Stored | Shared | Purpose |
|-----------|-----------|--------|--------|---------|
| Error stack traces | ✅ | ✅ (GitHub issues) | ❌ | Bug fixing |
| Sanitized code | ✅ | ✅ (PRs) | ❌ | Automated fixes |
| Metrics (anonymized) | ✅ | ✅ (local) | ❌ | SLO monitoring |
| User identifiers | ❌ | ❌ | ❌ | N/A |

### Data Retention

- **GitHub Issues**: Indefinite (user-controlled)
- **Pull Requests**: Indefinite (user-controlled)
- **Logs**: 30 days (GitHub Actions default)
- **Metrics**: Local only, not persisted

### User Rights

Users can exercise GDPR/CCPA rights via GitHub:
- **Right to Access**: View all issues/PRs
- **Right to Deletion**: Close/delete issues/PRs
- **Right to Rectification**: Edit issues
- **Right to Opt-Out**: Remove `robot` label

---

## PII Sanitization

### Patterns Redacted

- Email addresses: `user@example.com` → `[REDACTED_EMAIL]`
- API keys: `sk-proj-abc123...` → `[REDACTED_API_KEY]`
- File paths: `/Users/john/...` → `/Users/[REDACTED]/...`
- IP addresses: `192.168.1.1` → `[REDACTED_IP]`
- Credit cards: `4532-1234-5678-9010` → `[REDACTED_CC]`
- JWTs: `eyJ...` → `[REDACTED_JWT]`

### Validation

Run security test suite:
```bash
npm run test:security
```

50+ PII patterns validated for zero leaks.

---

## Third-Party Services

### AI Models
- **DeepSeek V3.2-Exp**: Receives sanitized code only
- **GPT-5**: Receives sanitized code only
- **Data retention**: Per provider policies (DeepSeek: 30 days, OpenAI: 30 days for API)

### GitHub
- **Data**: Issues, PRs, comments
- **Access**: Via GitHub API (OAuth or PAT)
- **Compliance**: GitHub's GDPR/CCPA policies apply

---

## Security Measures

- **Secrets**: Stored in GitHub Secrets (encrypted)
- **Logs**: PII sanitized before logging
- **Network**: TLS 1.3 for all API calls
- **Access Control**: GitHub permissions model

---

## Audit Trail

All actions logged with:
- Issue number
- Tier selected
- Model used
- Cost incurred
- Success/failure

Logs available in GitHub Actions for 30 days.

---

## Contact

Privacy questions: Open issue in `littlebearapps/homeostat` with label `privacy`
