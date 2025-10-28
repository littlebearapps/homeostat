/**
 * Slack Notifier - Critical Alerts for Ops Monitoring
 *
 * Sends critical infrastructure alerts to Slack ops-monitoring channel
 *
 * Environment Variables:
 * - SLACK_OPS_MONITORING_WEBHOOK (required) - Webhook URL for #ops-monitoring
 *
 * Usage:
 *   await notifySlack({
 *     title: 'Circuit Breaker Tripped',
 *     text: 'Issue #123 exhausted 3 autofix attempts',
 *     severity: 'critical',
 *     fields: [
 *       { title: 'Issue', value: '#123', short: true },
 *       { title: 'Extension', value: 'notebridge', short: true }
 *     ]
 *   });
 */

const SEVERITY_COLORS = {
  critical: '#FF0000',  // Red
  high: '#FFA500',      // Orange
  warning: '#FFFF00',   // Yellow
  info: '#00FF00'       // Green
};

/**
 * Send notification to Slack ops-monitoring channel
 *
 * @param {Object} message - Notification message
 * @param {string} message.title - Alert title
 * @param {string} message.text - Alert description
 * @param {string} [message.severity='critical'] - Severity level (critical, high, warning, info)
 * @param {Array<Object>} [message.fields] - Additional fields (Slack attachment format)
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.silent=false] - If true, don't throw on failure (log warning instead)
 * @returns {Promise<boolean>} True if sent successfully, false if failed (when silent=true)
 */
export async function notifySlack(message, options = {}) {
  const webhookUrl = process.env.SLACK_OPS_MONITORING_WEBHOOK;

  // If webhook not configured, log warning and return
  if (!webhookUrl) {
    console.warn('[Slack] SLACK_OPS_MONITORING_WEBHOOK not configured, skipping notification');
    return false;
  }

  const severity = message.severity || 'critical';
  const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.critical;

  const payload = {
    text: `🚨 *${message.title}*`,
    attachments: [
      {
        color,
        title: message.title,
        text: message.text,
        fields: message.fields || [],
        footer: 'Little Bear Apps Infrastructure',
        footer_icon: 'https://littlebearapps.com/favicon.ico',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack webhook returned ${response.status}: ${errorText}`);
    }

    console.log(`[Slack] ✅ Sent notification: ${message.title}`);
    return true;
  } catch (error) {
    const errorMessage = `[Slack] ❌ Failed to send notification: ${error.message}`;

    if (options.silent) {
      console.warn(errorMessage);
      return false;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Notify about circuit breaker trip
 *
 * @param {Object} details - Circuit breaker details
 * @param {number} details.issueNumber - GitHub issue number
 * @param {string} details.extension - Extension name
 * @param {string} details.issueUrl - GitHub issue URL
 * @param {number} details.hopCount - Final hop count (usually 3)
 * @param {string} [details.reason] - Reason for trip
 */
export async function notifyCircuitBreakerTripped(details) {
  return notifySlack({
    title: 'Circuit Breaker Tripped',
    text: `Issue #${details.issueNumber} has exhausted ${details.hopCount} autofix attempts and requires manual intervention.`,
    severity: 'critical',
    fields: [
      {
        title: 'Extension',
        value: details.extension,
        short: true
      },
      {
        title: 'Issue',
        value: `<${details.issueUrl}|#${details.issueNumber}>`,
        short: true
      },
      {
        title: 'Hop Count',
        value: `${details.hopCount}/3`,
        short: true
      },
      {
        title: 'Reason',
        value: details.reason || 'Max attempts reached',
        short: true
      },
      {
        title: 'Next Steps',
        value: '1. Review attempted fixes\n2. Manually fix the issue\n3. Remove circuit-breaker label to reset',
        short: false
      }
    ]
  }, { silent: true }); // Don't block workflow on Slack failure
}

/**
 * Notify about workflow failure
 *
 * @param {Object} details - Workflow failure details
 * @param {string} details.workflow - Workflow name
 * @param {string} details.error - Error message
 * @param {string} [details.issueNumber] - Related issue number (if any)
 * @param {string} [details.extension] - Extension name (if any)
 */
export async function notifyWorkflowFailure(details) {
  const fields = [
    {
      title: 'Workflow',
      value: details.workflow,
      short: true
    },
    {
      title: 'Error',
      value: details.error.substring(0, 200), // Truncate long errors
      short: false
    }
  ];

  if (details.issueNumber) {
    fields.push({
      title: 'Issue',
      value: `#${details.issueNumber}`,
      short: true
    });
  }

  if (details.extension) {
    fields.push({
      title: 'Extension',
      value: details.extension,
      short: true
    });
  }

  return notifySlack({
    title: 'Workflow Failure',
    text: `Homeostat workflow "${details.workflow}" crashed unexpectedly.`,
    severity: 'critical',
    fields
  }, { silent: true }); // Don't block workflow on Slack failure
}
