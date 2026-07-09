/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getPageLoadTransactionName } from './get_page_load_transaction_name';

describe('getPageLoadTransactionName', () => {
  it('returns /app/{appId} for deep app routes', () => {
    expect(getPageLoadTransactionName('/app/apm/services/my-service/overview')).toBe('/app/apm');
  });

  it('returns the pathname for non-app routes', () => {
    expect(getPageLoadTransactionName('/login')).toBe('/login');
  });
});
