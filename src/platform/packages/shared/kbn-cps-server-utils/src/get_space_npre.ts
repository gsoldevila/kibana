/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { DEFAULT_SPACE_ID, getSpaceIdFromPath } from '@kbn/spaces-utils';

/**
 * Get the NPRE for a given space ID or request
 * @param spaceIdOrRequest - The space ID or request
 * @returns The NPRE
 */
export function getSpaceNPRE(spaceIdOrRequest: string | KibanaRequest): string {
  const spaceId =
    typeof spaceIdOrRequest === 'string'
      ? spaceIdOrRequest || DEFAULT_SPACE_ID
      : getSpaceIdFromPath(spaceIdOrRequest.url.pathname).spaceId;

  return `kibana_space_${spaceId}_default`;
}
