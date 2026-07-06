/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const UNMAPPED_FIELDS_ITEM_TYPE = 'unmapped-fields-item';

/** Kibana space used for namespace isolation demos (must be lowercase). */
export const EXAMPLE_SPACE_ID = 'namespace-a';

export type UnmappedFieldsMode = 'LOAD' | 'NULLIFY' | 'DEFAULT';

export type QueryScenario =
  | 'filter_mapped_title'
  | 'filter_unmapped_category'
  | 'sort_unmapped_score'
  | 'stats_by_unmapped_category'
  | 'keep_unmapped_fields'
  | 'eval_unmapped_score'
  | 'metadata_source';

export interface QueryScenarioDefinition {
  id: QueryScenario;
  label: string;
  description: string;
  unmappedFieldsMode: UnmappedFieldsMode;
}

export const QUERY_SCENARIOS: QueryScenarioDefinition[] = [
  {
    id: 'filter_mapped_title',
    label: 'Filter mapped field',
    description: 'WHERE on mapped title field (no unmapped_fields setting required)',
    unmappedFieldsMode: 'DEFAULT',
  },
  {
    id: 'filter_unmapped_category',
    label: 'Filter unmapped field',
    description: 'WHERE on unmapped category attribute using SET unmapped_fields = "LOAD"',
    unmappedFieldsMode: 'LOAD',
  },
  {
    id: 'sort_unmapped_score',
    label: 'Sort unmapped field',
    description: 'SORT on unmapped score attribute loaded from _source',
    unmappedFieldsMode: 'LOAD',
  },
  {
    id: 'stats_by_unmapped_category',
    label: 'Aggregate unmapped field',
    description: 'STATS COUNT(*) BY unmapped category',
    unmappedFieldsMode: 'LOAD',
  },
  {
    id: 'keep_unmapped_fields',
    label: 'Keep unmapped fields',
    description: 'KEEP mapped title and unmapped category/score columns',
    unmappedFieldsMode: 'LOAD',
  },
  {
    id: 'eval_unmapped_score',
    label: 'Eval on unmapped field',
    description: 'EVAL numeric_score = TO_INTEGER(unmapped score)',
    unmappedFieldsMode: 'LOAD',
  },
  {
    id: 'metadata_source',
    label: 'Metadata _source',
    description:
      'Return _source to read unmapped attributes without referencing them in the pipeline',
    unmappedFieldsMode: 'DEFAULT',
  },
];
