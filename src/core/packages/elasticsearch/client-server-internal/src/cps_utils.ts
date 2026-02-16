/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

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

/**
 * Determines whether the given ES request path targets a CPS-sensitive endpoint
 * that should have `project_routing` injected when cross-project search is enabled.
 */
export const isCpsSensitivePath = (path: string): boolean => {
  return (
    CPS_SENSITIVE_SUFFIXES.some((suffix) => path.endsWith(suffix)) ||
    CPS_SENSITIVE_SEGMENTS.some((segment) => path.includes(segment))
  );
};
