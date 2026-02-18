/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { set } from '@kbn/safer-lodash-set';
import { isPlainObject } from 'lodash';
import type { Logger } from '@kbn/logging';
import type { OnRequestHandler } from '@kbn/core-elasticsearch-client-server-internal';

const LOCAL_PROJECT_ROUTING = '_alias:_origin';
const ONE_HOUR = 3_600_000;

const CPS_SENSITIVE_SUFFIXES = [
  '/_search',
  '/_async_search',
  '/_msearch',
  '/_query',
  '/_field_caps',
  '/_search/template',
  '/_msearch/template',
  '/_eql/search',
  '/_sql',
  '/_pit',
  '/_count',
];

const CPS_SENSITIVE_SEGMENTS = ['/_query/async', '/_resolve/index/', '/_mvt/', '/_cat/count'];

const isCpsSensitivePath = (path: string): boolean =>
  CPS_SENSITIVE_SUFFIXES.some((suffix) => path.endsWith(suffix)) ||
  CPS_SENSITIVE_SEGMENTS.some((segment) => path.includes(segment));

/** @internal */
export class CpsRequestHandler {
  private cpsEnabled = false;
  private lastDirectRequestWarning = 0;

  constructor(private readonly log: Logger, private readonly isServerless: boolean) {}

  public setCpsFeatureFlag(enabled: boolean) {
    this.cpsEnabled = enabled;
    this.log.info(`CPS feature flag set to ${enabled}`);
  }

  public readonly onRequest: OnRequestHandler = (_ctx, params, _options) => {
    if (!this.isServerless) return;

    const shouldApply = this.shouldApplyProjectRouting(params.path, params.meta?.acceptedParams);
    if (!shouldApply) return;

    const body = isPlainObject(params.body) ? (params.body as Record<string, unknown>) : undefined;

    if (this.cpsEnabled) {
      if (body?.pit != null) {
        if (body?.project_routing != null) delete body.project_routing;
        return;
      }
      if (body?.project_routing != null) return;
      set(params, 'body.project_routing', LOCAL_PROJECT_ROUTING);
    } else {
      if (body?.project_routing != null) delete body.project_routing;
    }
  };

  private shouldApplyProjectRouting(path: string, acceptedParams: string[] | undefined): boolean {
    if (acceptedParams) {
      return acceptedParams.includes('project_routing');
    }
    const isSensitive = isCpsSensitivePath(path);
    if (isSensitive) {
      const now = Date.now();
      if (now - this.lastDirectRequestWarning >= ONE_HOUR) {
        this.lastDirectRequestWarning = now;
        this.log.warn(
          `Direct transport.request() call to CPS-sensitive path [${path}] detected. ` +
            `Prefer using the high-level Elasticsearch client API so that project_routing ` +
            `metadata is handled automatically.`
        );
      }
    }
    return isSensitive;
  }
}
