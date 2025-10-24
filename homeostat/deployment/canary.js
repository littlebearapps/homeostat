/**
 * Canary deployment per IMPLEMENTATION-ROADMAP.md lines 354-393.
 */
import { ensureGitHubQuota } from '../execution/ai-utils.js';

export const CANARY_STAGES = [
  { percentage: 1, duration: '1h', failureThreshold: 0.01 },
  { percentage: 5, duration: '2h', failureThreshold: 0.02 },
  { percentage: 25, duration: '4h', failureThreshold: 0.05 },
  { percentage: 100, duration: 'permanent', failureThreshold: 0.1 }
];

async function defaultUpdateConfig({ percentage, version }, _issueNumber) {
  console.info(`Updating canary to ${percentage}% for version ${version ?? 'latest'}`);
}

async function defaultComment(issueNumber, message, fetchImpl = fetch) {
  if (!issueNumber) return;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !process.env.GITHUB_TOKEN) {
    console.warn('Missing repository or token for GitHub comment');
    return;
  }
  await ensureGitHubQuota(fetchImpl);
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
    },
    body: JSON.stringify({ body: message })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to comment on issue #${issueNumber}: ${text}`);
  }
}

export async function monitorErrors(duration, { fetchImpl = fetch, metricsUrl = process.env.CANARY_METRICS_URL } = {}) {
  if (!metricsUrl) {
    return 0; // Default to zero when no telemetry configured
  }
  const response = await fetchImpl(`${metricsUrl}?window=${encodeURIComponent(duration)}`);
  if (!response.ok) {
    throw new Error(`Failed to monitor errors: ${response.status}`);
  }
  const data = await response.json();
  return data.errorRate ?? 0;
}

export async function rollback(issueNumber, options = {}) {
  const {
    updateConfig = defaultUpdateConfig,
    comment = defaultComment,
    fetchImpl = fetch,
    version
  } = options;
  await updateConfig({ percentage: 0, version }, issueNumber);
  await comment(issueNumber, '🚨 Canary deployment rolled back due to elevated error rate.', fetchImpl);
  return { success: false };
}

export async function deploy(issueNumber, options = {}) {
  const {
    stages = CANARY_STAGES,
    updateConfig = defaultUpdateConfig,
    monitor = monitorErrors,
    comment = defaultComment,
    fetchImpl = fetch,
    version
  } = options;

  for (const stage of stages) {
    await updateConfig({ percentage: stage.percentage, version }, issueNumber);
    await comment(
      issueNumber,
      `🚀 Deploying fix to ${stage.percentage}% of users. Monitoring for ${stage.duration}.`,
      fetchImpl
    );
    const errorRate = await monitor(stage.duration, { fetchImpl });
    if (errorRate > stage.failureThreshold) {
      await comment(
        issueNumber,
        `⚠️ Error rate ${errorRate.toFixed(4)} exceeded threshold ${stage.failureThreshold}. Rolling back.`,
        fetchImpl
      );
      await rollback(issueNumber, { updateConfig, comment, fetchImpl, version });
      return { success: false, failedStage: stage.percentage, errorRate };
    }
  }

  await comment(issueNumber, '✅ Canary succeeded. Rolling out to 100% of users.', fetchImpl);
  return { success: true };
}

export default { deploy, monitorErrors, rollback, CANARY_STAGES };
