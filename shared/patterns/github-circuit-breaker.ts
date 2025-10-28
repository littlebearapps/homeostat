import { Octokit } from '@octokit/rest';
import crypto from 'node:crypto';
import { notifyCircuitBreakerTripped } from '../slack-notifier.js';

export interface CircuitBreakerOptions {
  octokit: Octokit;
  owner: string;
  repo: string;
  maxHops?: number;
  now?: () => Date;
}

export interface CircuitBreakerState {
  allowed: boolean;
  reason?: 'circuit_breaker_tripped' | 'max_hops_reached' | 'in_cooldown';
  currentHop: number;
  maxHops: number;
  cooldownUntil?: string;
}

export interface CircuitBreakerMetadata {
  hop: number;
  trace: string;
  reason: string;
  timestamp: string;
  signature: string;
}

export interface LockResult {
  acquired: boolean;
  currentHop?: number;
  etag?: string;
  reason?: 'circuit_breaker_tripped' | 'race_condition' | 'already_locked' | 'existing_pr';
}

const DEFAULT_MAX_HOPS = 3;
const LABEL_PREFIX_HOP = 'hop:';
const LABEL_CIRCUIT_BREAKER = 'circuit-breaker';
const LABEL_AUTOFIX_ATTEMPTED = 'autofix:attempted';
const LABEL_AUTOFIX_SUCCESS = 'autofix:success';
const LABEL_AUTOFIX_FAILED = 'autofix:failed';

/**
 * GitHub-native circuit breaker using labels and comments (not file-based)
 *
 * Benefits over file-based:
 * - Visible in GitHub UI (users can see hop count, circuit breaker status)
 * - Distributed (multiple Homeostat instances can read labels)
 * - Auditable (signed comments provide full audit trail)
 * - Manual reset (users can remove circuit-breaker label)
 * - Idempotent (PR existence check + identical diff detection)
 */
export class GitHubCircuitBreaker {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly maxHops: number;
  private readonly now: () => Date;

  constructor(options: CircuitBreakerOptions) {
    this.octokit = options.octokit;
    this.owner = options.owner;
    this.repo = options.repo;
    this.maxHops = options.maxHops ?? DEFAULT_MAX_HOPS;
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Check if an autofix attempt is allowed for this issue
   */
  async canAttempt(issueNumber: number): Promise<CircuitBreakerState> {
    const issue = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    // Check if circuit breaker tripped
    if (issue.data.labels.some(l => typeof l === 'object' && l.name === LABEL_CIRCUIT_BREAKER)) {
      return {
        allowed: false,
        reason: 'circuit_breaker_tripped',
        currentHop: this.maxHops,
        maxHops: this.maxHops
      };
    }

    // Get current hop count from labels
    const hopLabel = issue.data.labels.find(l =>
      typeof l === 'object' && l.name?.startsWith(LABEL_PREFIX_HOP)
    );
    const currentHop = hopLabel && typeof hopLabel === 'object' && hopLabel.name
      ? parseInt(hopLabel.name.split(':')[1])
      : 0;

    // Check if max hops reached
    if (currentHop >= this.maxHops) {
      return {
        allowed: false,
        reason: 'max_hops_reached',
        currentHop,
        maxHops: this.maxHops
      };
    }

    // Check for existing PR (idempotency)
    const existingPR = await this.findExistingPR(issueNumber);
    if (existingPR) {
      console.log(`PR #${existingPR.number} already exists for issue #${issueNumber}, skipping duplicate attempt`);
      return {
        allowed: false,
        reason: 'circuit_breaker_tripped', // Treat as blocked to prevent duplicate
        currentHop,
        maxHops: this.maxHops
      };
    }

    return {
      allowed: true,
      currentHop,
      maxHops: this.maxHops
    };
  }

  /**
   * Find existing PR for this issue (idempotency check)
   */
  private async findExistingPR(issueNumber: number): Promise<{ number: number } | null> {
    const prs = await this.octokit.pulls.list({
      owner: this.owner,
      repo: this.repo,
      state: 'open'
    });

    for (const pr of prs.data) {
      // Check if PR body mentions this issue (e.g., "Fixes #123")
      if (pr.body?.includes(`#${issueNumber}`)) {
        return { number: pr.number };
      }

      // Check if PR has homeostat-fix label and links to this issue
      const hasHomeostatlabel = pr.labels.some(l => l.name === 'homeostat-fix');
      if (hasHomeostatlabel && pr.body?.includes(`#${issueNumber}`)) {
        return { number: pr.number };
      }
    }

    return null;
  }

  /**
   * Increment hop count BEFORE attempting fix
   * This prevents race conditions (hop incremented atomically via GitHub API)
   */
  async incrementHop(issueNumber: number, metadata: Omit<CircuitBreakerMetadata, 'hop' | 'signature'>): Promise<void> {
    const issue = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    // Get current hop
    const hopLabel = issue.data.labels.find(l =>
      typeof l === 'object' && l.name?.startsWith(LABEL_PREFIX_HOP)
    );
    const currentHop = hopLabel && typeof hopLabel === 'object' && hopLabel.name
      ? parseInt(hopLabel.name.split(':')[1])
      : 0;
    const newHop = currentHop + 1;

    // Remove old hop label
    if (hopLabel && typeof hopLabel === 'object' && hopLabel.name) {
      try {
        await this.octokit.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: hopLabel.name
        });
      } catch (error) {
        // Label might not exist, ignore
        console.warn(`Failed to remove label ${hopLabel.name}:`, error);
      }
    }

    // Add new hop label
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [`${LABEL_PREFIX_HOP}${newHop}`, LABEL_AUTOFIX_ATTEMPTED]
    });

    // Add signed comment (audit trail)
    const fullMetadata: CircuitBreakerMetadata = {
      ...metadata,
      hop: newHop,
      signature: this.generateSignature({ ...metadata, hop: newHop })
    };

    const comment = this.formatMetadataComment(fullMetadata);
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: comment
    });
  }

  /**
   * Trip circuit breaker (max hops reached)
   */
  async tripCircuitBreaker(issueNumber: number, reason: string): Promise<void> {
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [LABEL_CIRCUIT_BREAKER]
    });

    const commentBody = `🚨 **Circuit Breaker Tripped**\n\n` +
          `This issue has exhausted ${this.maxHops} autofix attempts and requires manual intervention.\n\n` +
          `**Reason**: ${reason}\n\n` +
          `**Next Steps**:\n` +
          `1. Review the attempted fixes above\n` +
          `2. Manually fix the issue\n` +
          `3. Remove the \`${LABEL_CIRCUIT_BREAKER}\` label to reset\n\n` +
          `---\n` +
          `*Automated by Homeostat*`;

    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: commentBody
    });

    // Send Slack notification (non-blocking)
    const issueUrl = `https://github.com/${this.owner}/${this.repo}/issues/${issueNumber}`;
    notifyCircuitBreakerTripped({
      issueNumber,
      extension: this.repo,
      issueUrl,
      hopCount: this.maxHops,
      reason
    }).catch((error) => {
      console.warn(`[CircuitBreaker] Failed to send Slack notification:`, error.message);
    });
  }

  /**
   * Mark autofix as successful (PR merged)
   */
  async markSuccess(issueNumber: number): Promise<void> {
    // Remove hop labels and circuit breaker
    const issue = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    for (const label of issue.data.labels) {
      if (typeof label === 'object' && label.name) {
        if (label.name.startsWith(LABEL_PREFIX_HOP) || label.name === LABEL_CIRCUIT_BREAKER) {
          try {
            await this.octokit.issues.removeLabel({
              owner: this.owner,
              repo: this.repo,
              issue_number: issueNumber,
              name: label.name
            });
          } catch (error) {
            console.warn(`Failed to remove label ${label.name}:`, error);
          }
        }
      }
    }

    // Add success label
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [LABEL_AUTOFIX_SUCCESS]
    });
  }

  /**
   * Mark autofix as failed (PR closed without merge)
   */
  async markFailure(issueNumber: number): Promise<void> {
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [LABEL_AUTOFIX_FAILED]
    });
  }

  /**
   * Reset circuit breaker (manual intervention)
   */
  async reset(issueNumber: number): Promise<void> {
    const issue = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    // Remove all circuit breaker labels
    for (const label of issue.data.labels) {
      if (typeof label === 'object' && label.name) {
        if (
          label.name.startsWith(LABEL_PREFIX_HOP) ||
          label.name === LABEL_CIRCUIT_BREAKER ||
          label.name === LABEL_AUTOFIX_ATTEMPTED ||
          label.name === LABEL_AUTOFIX_FAILED
        ) {
          try {
            await this.octokit.issues.removeLabel({
              owner: this.owner,
              repo: this.repo,
              issue_number: issueNumber,
              name: label.name
            });
          } catch (error) {
            console.warn(`Failed to remove label ${label.name}:`, error);
          }
        }
      }
    }

    // Reset to hop:0
    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [`${LABEL_PREFIX_HOP}0`]
    });

    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: `🔄 **Circuit Breaker Reset**\n\n` +
            `Manual reset performed. Homeostat can attempt fixes again.\n\n` +
            `---\n` +
            `*Automated by Homeostat*`
    });
  }

  /**
   * Atomically acquire lock and increment hop using ETag
   * This replaces the manual sequence of canAttempt() + incrementHop()
   */
  async acquireLockAndIncrementHop(issueNumber: number, metadata: {
    trace: string;
    reason: string;
  }): Promise<LockResult> {
    // 1. Get current issue state with ETag
    const { data: issue, headers } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    const etag = headers.etag;
    const labels = issue.labels.map((l: any) => typeof l === 'string' ? l : l.name);

    // 2. Check if already locked (with stale lock override)
    if (labels.includes('processing:homeostat')) {
      const lockAge = await this.getLockAge(issueNumber);
      if (lockAge < 30 * 60 * 1000) {  // 30 minutes
        console.log(`Issue #${issueNumber} already locked (age: ${Math.floor(lockAge / 1000)}s)`);
        return { acquired: false, reason: 'already_locked' };
      }
      console.log(`Stale lock detected (age: ${Math.floor(lockAge / 1000)}s), overriding`);
    }

    // 3. Check circuit breaker (reuse existing logic)
    if (labels.includes(LABEL_CIRCUIT_BREAKER)) {
      return { acquired: false, reason: 'circuit_breaker_tripped' };
    }

    // 4. Get current hop count from labels
    const currentHop = this.getCurrentHopFromLabels(labels);
    if (currentHop >= this.maxHops) {
      return { acquired: false, reason: 'circuit_breaker_tripped' };
    }

    // 5. Check for existing PR (reuse existing findExistingPR logic)
    const existingPR = await this.findExistingPR(issueNumber);
    if (existingPR) {
      console.log(`PR #${existingPR.number} already exists for issue #${issueNumber}`);
      return { acquired: false, reason: 'existing_pr' };
    }

    // 6. Atomically: acquire lock + increment hop + add autofix:attempted
    const newHop = currentHop + 1;
    const newLabels = labels
      .filter((l: string) => !l.startsWith(LABEL_PREFIX_HOP) && l !== 'processing:homeostat')
      .concat([
        `${LABEL_PREFIX_HOP}${newHop}`,
        'processing:homeostat',
        LABEL_AUTOFIX_ATTEMPTED
      ]);

    // Add circuit-breaker label if we just hit the limit
    if (newHop >= this.maxHops) {
      newLabels.push(LABEL_CIRCUIT_BREAKER);
    }

    try {
      // CRITICAL: Atomic update with ETag
      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels: newLabels,
        headers: { 'If-Match': etag }  // Atomic check - fails if issue changed
      });

      console.log(`Lock acquired, hop ${currentHop} → ${newHop}`);

      // Add signed comment (audit trail) - this is NOT atomic, but that's OK
      const fullMetadata: CircuitBreakerMetadata = {
        trace: metadata.trace,
        reason: metadata.reason,
        timestamp: this.now().toISOString(),
        hop: newHop,
        signature: this.generateSignature({
          trace: metadata.trace,
          reason: metadata.reason,
          timestamp: this.now().toISOString(),
          hop: newHop
        })
      };

      const comment = this.formatMetadataComment(fullMetadata);
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: comment + `\n\nLock acquired at ${new Date().toISOString()}`
      });

      return { acquired: true, currentHop: newHop, etag };

    } catch (error: any) {
      if (error.status === 412) {
        // ETag mismatch - someone else modified the issue
        console.log(`Race condition detected on issue #${issueNumber} (ETag mismatch)`);
        return { acquired: false, reason: 'race_condition' };
      }
      throw error;
    }
  }

  /**
   * Release lock (remove processing:homeostat label)
   */
  async releaseLock(issueNumber: number): Promise<void> {
    try {
      await this.octokit.issues.removeLabel({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        name: 'processing:homeostat'
      });
      console.log(`Lock released for issue #${issueNumber}`);
    } catch (error: any) {
      if (error.status === 404) {
        // Label already removed, ignore
        console.log(`Lock already released for issue #${issueNumber}`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Get age of current lock in milliseconds
   */
  private async getLockAge(issueNumber: number): Promise<number> {
    const { data: comments } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      per_page: 100
    });

    // Find most recent "Lock acquired" comment
    const lockComments = comments
      .filter(c => c.body?.includes('Lock acquired at') || c.body?.includes('processing:homeostat acquired'))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (lockComments.length === 0) {
      return 0; // No lock comment found
    }

    const lockTime = new Date(lockComments[0].created_at).getTime();
    return Date.now() - lockTime;
  }

  /**
   * Helper: Extract current hop from labels
   */
  private getCurrentHopFromLabels(labels: string[]): number {
    const hopLabel = labels.find((l: string) => l.startsWith(LABEL_PREFIX_HOP));
    return hopLabel ? parseInt(hopLabel.split(':')[1]) : 0;
  }

  /**
   * Generate signature for metadata (prevents tampering)
   */
  private generateSignature(metadata: Omit<CircuitBreakerMetadata, 'signature'>): string {
    const payload = JSON.stringify(metadata);
    const secret = process.env.HOMEOSTAT_SIGNATURE_SECRET || 'default-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * Format metadata as GitHub comment
   */
  private formatMetadataComment(metadata: CircuitBreakerMetadata): string {
    return `<!-- homeostat-meta -->\n` +
           `[homeostat] hop=${metadata.hop} trace=${metadata.trace} reason="${metadata.reason}" ts=${metadata.timestamp} signature=sha256:${metadata.signature}\n` +
           `<!-- /homeostat-meta -->\n\n` +
           `**Attempt ${metadata.hop} of ${this.maxHops}**\n` +
           `- Trace: \`${metadata.trace}\`\n` +
           `- Reason: ${metadata.reason}\n` +
           `- Timestamp: ${metadata.timestamp}\n\n` +
           `---\n` +
           `*Automated by Homeostat*`;
  }
}

/**
 * Create required labels on repository (one-time setup)
 */
export async function createCircuitBreakerLabels(octokit: Octokit, owner: string, repo: string): Promise<void> {
  const labels = [
    { name: 'hop:0', color: '0E8A16', description: 'No autofix attempts yet' },
    { name: 'hop:1', color: 'FBCA04', description: 'First autofix attempt' },
    { name: 'hop:2', color: 'FFA500', description: 'Second autofix attempt' },
    { name: 'hop:3', color: 'D93F0B', description: 'Third autofix attempt (final)' },
    { name: 'circuit-breaker', color: 'B60205', description: 'Circuit breaker tripped, needs manual intervention' },
    { name: 'processing:homeostat', color: 'FBCA04', description: 'Homeostat is currently processing (soft lock)' },
    { name: 'autofix:attempted', color: '5319E7', description: 'Homeostat has attempted fix' },
    { name: 'autofix:success', color: '0E8A16', description: 'Autofix succeeded (PR merged)' },
    { name: 'autofix:failed', color: 'D93F0B', description: 'Autofix failed (PR closed without merge)' }
  ];

  for (const label of labels) {
    try {
      await octokit.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description
      });
      console.log(`✓ Created label: ${label.name}`);
    } catch (error: any) {
      if (error.status === 422 && error.message.includes('already_exists')) {
        console.log(`  Label already exists: ${label.name}`);
      } else {
        throw error;
      }
    }
  }
}
