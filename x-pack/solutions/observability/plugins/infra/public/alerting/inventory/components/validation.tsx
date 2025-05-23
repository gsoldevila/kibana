/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ValidationResult } from '@kbn/triggers-actions-ui-plugin/public';
import { COMPARATORS } from '@kbn/alerting-comparators';
import type { FilterQuery, InventoryMetricConditions } from '../../../../common/alerting/metrics';
import { QUERY_INVALID } from '../../../../common/alerting/metrics';

export function validateMetricThreshold({
  criteria,
  filterQuery,
}: {
  criteria: InventoryMetricConditions[];
  filterQuery?: FilterQuery;
}): ValidationResult {
  const validationResult = { errors: {} };
  const errors: {
    [id: string]: {
      timeSizeUnit: string[];
      timeWindowSize: string[];
      critical: {
        threshold0: string[];
        threshold1: string[];
      };
      warning: {
        threshold0: string[];
        threshold1: string[];
      };
      metric: string[];
    };
  } & { filterQuery?: string[] } = {};
  validationResult.errors = errors;

  if (filterQuery === QUERY_INVALID) {
    errors.filterQuery = [
      i18n.translate('xpack.infra.metrics.alertFlyout.error.invalidFilterQuery', {
        defaultMessage: 'Filter query is invalid.',
      }),
    ];
  }

  if (!criteria || !criteria.length) {
    return validationResult;
  }

  criteria.forEach((c, idx) => {
    // Create an id for each criteria, so we can map errors to specific criteria.
    const id = idx.toString();

    errors[id] = errors[id] || {
      timeSizeUnit: [],
      timeWindowSize: [],
      critical: {
        threshold0: [],
        threshold1: [],
      },
      warning: {
        threshold0: [],
        threshold1: [],
      },
      metric: [],
    };

    if (!c.threshold || !c.threshold.length) {
      errors[id].critical.threshold0.push(
        i18n.translate('xpack.infra.metrics.alertFlyout.error.thresholdRequired', {
          defaultMessage: 'Threshold is required.',
        })
      );
    }

    if (c.warningThreshold && !c.warningThreshold.length) {
      errors[id].warning.threshold0.push(
        i18n.translate('xpack.infra.metrics.alertFlyout.error.thresholdRequired', {
          defaultMessage: 'Threshold is required.',
        })
      );
    }
    for (const props of [
      { comparator: c.comparator, threshold: c.threshold, type: 'critical' },
      { comparator: c.warningComparator, threshold: c.warningThreshold, type: 'warning' },
    ]) {
      // The Threshold component returns an empty array with a length ([empty]) because it's using delete newThreshold[i].
      // We need to use [...c.threshold] to convert it to an array with an undefined value ([undefined]) so we can test each element.
      const { comparator, threshold, type } = props as {
        comparator?: COMPARATORS;
        threshold?: number[];
        type: 'critical' | 'warning';
      };
      if (threshold && threshold.length && ![...threshold].every(isNumber)) {
        [...threshold].forEach((v, i) => {
          if (!isNumber(v)) {
            const key = i === 0 ? 'threshold0' : 'threshold1';
            errors[id][type][key].push(
              i18n.translate('xpack.infra.metrics.alertFlyout.error.thresholdTypeRequired', {
                defaultMessage: 'Thresholds must contain a valid number.',
              })
            );
          }
        });
      }

      if (comparator === COMPARATORS.BETWEEN && (!threshold || threshold.length < 2)) {
        errors[id][type].threshold1.push(
          i18n.translate('xpack.infra.metrics.alertFlyout.error.thresholdRequired', {
            defaultMessage: 'Threshold is required.',
          })
        );
      }
    }

    if (!c.timeSize) {
      errors[id].timeWindowSize.push(
        i18n.translate('xpack.infra.metrics.alertFlyout.error.timeRequred', {
          defaultMessage: 'Time size is Required.',
        })
      );
    }
    if (!c.metric) {
      errors[id].metric.push(
        i18n.translate('xpack.infra.metrics.alertFlyout.error.metricRequired', {
          defaultMessage: 'Metric is required.',
        })
      );
    }
    if (c.metric === 'custom' && !c.customMetric?.field) {
      errors[id].metric.push(
        i18n.translate('xpack.infra.metrics.alertFlyout.error.customMetricFieldRequired', {
          defaultMessage: 'Field is required.',
        })
      );
    }
  });

  return validationResult;
}

const isNumber = (value: unknown): value is number => typeof value === 'number';
