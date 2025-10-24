import { logger } from './logger.js';
import type { Metrics } from './metrics.js';

export interface Alert {
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  metrics?: Record<string, unknown>;
}

export class AlertManager {
  private readonly alertHistory = new Map<string, Date>();
  private readonly ALERT_COOLDOWN = 24 * 60 * 60 * 1000;

  sendAlert(alert: Alert): void {
    const alertKey = `${alert.severity}:${alert.title}`;
    const lastAlert = this.alertHistory.get(alertKey);

    if (lastAlert && Date.now() - lastAlert.getTime() < this.ALERT_COOLDOWN) {
      logger.debug('Alert suppressed (cooldown)', { alertKey });
      return;
    }

    this.alertHistory.set(alertKey, new Date());

    logger.error('ALERT', undefined, {
      alert: {
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        metrics: alert.metrics
      }
    });
  }

  checkSLOs(metrics: Metrics, projectedAnnualCost: number): Alert[] {
    const alerts: Alert[] = [];

    if (projectedAnnualCost > 10) {
      alerts.push({
        severity: 'critical',
        title: 'Cost SLO Breach',
        description: `Projected annual cost ($${projectedAnnualCost.toFixed(2)}) exceeds budget ($9.28)`,
        metrics: {
          projectedAnnualCost,
          currentCost: metrics.cost.total
        }
      });
    }

    const successRate = metrics.fixes.total
      ? metrics.fixes.successful / metrics.fixes.total
      : 0;

    if (successRate < 0.6) {
      alerts.push({
        severity: 'high',
        title: 'Success Rate SLO Breach',
        description: `Overall success rate (${(successRate * 100).toFixed(1)}%) below target (70%)`,
        metrics: {
          successRate,
          totalFixes: metrics.fixes.total
        }
      });
    }

    return alerts;
  }
}

export const alertManager = new AlertManager();
