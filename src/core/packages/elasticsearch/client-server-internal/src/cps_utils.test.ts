/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isCpsSensitivePath } from './cps_utils';

describe('isCpsSensitivePath', () => {
  describe('suffix-matched endpoints', () => {
    it.each([
      ['/_search', '/_search'],
      ['/my-index/_search', '/_search with index prefix'],
      ['/_async_search', '/_async_search'],
      ['/my-index/_async_search', '/_async_search with index prefix'],
      ['/_msearch', '/_msearch'],
      ['/my-index/_msearch', '/_msearch with index prefix'],
      ['/_query', '/_query (ES|QL)'],
      ['/_field_caps', '/_field_caps'],
      ['/my-index/_field_caps', '/_field_caps with index prefix'],
      ['/_search/template', '/_search/template'],
      ['/my-index/_search/template', '/_search/template with index prefix'],
      ['/_msearch/template', '/_msearch/template'],
      ['/my-index/_msearch/template', '/_msearch/template with index prefix'],
      ['/_eql/search', '/_eql/search'],
      ['/my-index/_eql/search', '/_eql/search with index prefix'],
      ['/_sql', '/_sql'],
      ['/my-index/_pit', '/_pit with index prefix'],
      ['/_count', '/_count'],
      ['/my-index/_count', '/_count with index prefix'],
    ])('should match %s (%s)', (path) => {
      expect(isCpsSensitivePath(path)).toBe(true);
    });
  });

  describe('segment-matched endpoints', () => {
    it.each([
      ['/_query/async', '/_query/async (ES|QL async)'],
      ['/_resolve/index/my-index', '/_resolve/index with name'],
      ['/_resolve/index/*', '/_resolve/index with wildcard'],
      ['/my-index/_mvt/field/0/0/0', '/_mvt with index and tile coords'],
      ['/_cat/count', '/_cat/count'],
      ['/_cat/count/my-index', '/_cat/count with index'],
    ])('should match %s (%s)', (path) => {
      expect(isCpsSensitivePath(path)).toBe(true);
    });
  });

  describe('non-CPS paths', () => {
    it.each([
      '/_bulk',
      '/my-index/_doc/1',
      '/_cluster/health',
      '/_nodes',
      '/_aliases',
      '/_index_template/my-template',
      '/my-index/_mapping',
      '/_refresh',
      '/',
    ])('should not match %s', (path) => {
      expect(isCpsSensitivePath(path)).toBe(false);
    });
  });
});
