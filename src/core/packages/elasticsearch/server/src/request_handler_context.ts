/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AsScopedOptions, IScopedClusterClient } from './client';

/**
 * Core's `elasticsearch` request handler context.
 * @public
 */
export interface ElasticsearchRequestHandlerContext {
  /**
   * A pre-scoped {@link IScopedClusterClient} for the current request using origin-only routing.
   * Use {@link ElasticsearchRequestHandlerContext.getClient} for CPS-aware routing.
   */
  client: IScopedClusterClient;

  /**
   * Returns a {@link IScopedClusterClient} scoped to the current request with the given
   * {@link AsScopedOptions | routing options}.
   *
   * Use `{ projectRouting: 'http-header' }` to honour the project picker selection forwarded
   * by the CPS browser-side interceptor via the `x-kbn-project-routing` header:
   *
   * ```ts
   * const client = core.elasticsearch.getClient({ projectRouting: 'http-header' });
   * const result = await client.asCurrentUser.search(...);
   * ```
   */
  getClient(opts: AsScopedOptions): IScopedClusterClient;
}
