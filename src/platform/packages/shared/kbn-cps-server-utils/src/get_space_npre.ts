/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ScopeableRequest } from '@kbn/core-elasticsearch-server';
import { DEFAULT_SPACE_ID, getSpaceIdFromPath } from '@kbn/spaces-utils';

/**
 * Get the NPRE for a given space ID or request.
 *
 * When a {@link ScopeableRequest} is provided, the space is extracted from the
 * URL pathname. Requests without a `url` property (e.g. `FakeRequest`) fall
 * back to the default space.
 *
 * **Assumption**: this function assumes that the server base path is `/` (the
 * default). If Kibana is configured with a custom `server.basePath`, the base
 * path prefix will not be stripped before matching the space segment, causing
 * the function to always fall back to the default space. CPS is a
 * Serverless-only feature and Serverless deployments always run at the root
 * path, so this is not a practical concern today.
 *
 * @param spaceIdOrRequest - The space ID string, or a {@link ScopeableRequest}
 * @returns The NPRE
 */
export function getSpaceNPRE(spaceIdOrRequest: string | ScopeableRequest): string {
  if (typeof spaceIdOrRequest === 'string') {
    return `kibana_space_${spaceIdOrRequest || DEFAULT_SPACE_ID}_default`;
  } else {
    const spaceId =
      'url' in spaceIdOrRequest
        ? getSpaceIdFromPath(spaceIdOrRequest.url.pathname).spaceId
        : DEFAULT_SPACE_ID;
    return `kibana_space_${spaceId}_default`;
  }
}
