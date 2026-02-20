/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FakeRequest, ScopeableRequest } from '@kbn/core-elasticsearch-server';
import { getSpaceNPRE } from './get_space_npre';

const mockKibanaRequest = (pathname: string) =>
  ({ url: new URL(`http://localhost:5601${pathname}`) } as unknown as ScopeableRequest);

const mockFakeRequest = (headers: FakeRequest['headers'] = {}): FakeRequest => ({ headers });

describe('getSpaceNPRE', () => {
  describe('when called with a spaceId string', () => {
    it('returns the NPRE for the given space', () => {
      expect(getSpaceNPRE('my-space')).toBe('kibana_space_my-space_default');
    });

    it('uses "default" when spaceId is an empty string', () => {
      expect(getSpaceNPRE('')).toBe('kibana_space_default_default');
    });

    it('returns the NPRE for the default space when spaceId is "default"', () => {
      expect(getSpaceNPRE('default')).toBe('kibana_space_default_default');
    });
  });

  describe('when called with a KibanaRequest', () => {
    it('extracts the space from the request URL and returns the NPRE', () => {
      expect(getSpaceNPRE(mockKibanaRequest('/s/my-space/api/foo'))).toBe(
        'kibana_space_my-space_default'
      );
    });

    it('returns the default space NPRE when the request URL has no space segment', () => {
      expect(getSpaceNPRE(mockKibanaRequest('/api/foo'))).toBe('kibana_space_default_default');
    });
  });

  describe('when called with a FakeRequest (no url)', () => {
    it('falls back to the default space NPRE', () => {
      expect(getSpaceNPRE(mockFakeRequest({ authorization: 'Bearer tok' }))).toBe(
        'kibana_space_default_default'
      );
    });

    it('falls back to the default space NPRE for an empty FakeRequest', () => {
      expect(getSpaceNPRE(mockFakeRequest())).toBe('kibana_space_default_default');
    });
  });
});
