/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { esql } from '@elastic/esql';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { SavedObjectsEsqlResponse } from '@kbn/core-saved-objects-api-server';
import {
  type QueryScenario,
  type UnmappedFieldsMode,
  UNMAPPED_FIELDS_ITEM_TYPE,
} from '../common/constants';

const colTitle = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.title`);
const colCategory = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.category`);
const colScore = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.score`);
const colNotes = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.notes`);

const setOptionsForMode = (mode: UnmappedFieldsMode): Record<string, string> | undefined => {
  if (mode === 'DEFAULT') {
    return undefined;
  }
  return { unmapped_fields: mode };
};

export async function runQueryScenario(
  savedObjectsClient: Pick<SavedObjectsClientContract, 'esql'>,
  scenario: QueryScenario,
  unmappedFieldsMode: UnmappedFieldsMode,
  namespace: string
): Promise<SavedObjectsEsqlResponse> {
  const setOptions = setOptionsForMode(unmappedFieldsMode);

  switch (scenario) {
    case 'filter_mapped_title':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          WHERE ${colTitle} == "Alpha dashboard"
          | KEEP ${colTitle}
          | LIMIT 10
        `,
      });

    case 'filter_unmapped_category':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          WHERE ${colCategory} == "alpha"
          | KEEP ${colTitle}, ${colCategory}
          | SORT ${colTitle}
          | LIMIT 10
        `,
      });

    case 'sort_unmapped_score':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          KEEP ${colTitle}, ${colScore}
          | SORT ${colScore} ASC
          | LIMIT 10
        `,
      });

    case 'stats_by_unmapped_category':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          STATS doc_count = COUNT(*) BY ${colCategory}
          | SORT doc_count DESC
        `,
      });

    case 'keep_unmapped_fields':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          KEEP ${colTitle}, ${colCategory}, ${colScore}, ${colNotes}
          | SORT ${colTitle}
          | LIMIT 10
        `,
      });

    case 'eval_unmapped_score':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        setOptions,
        pipeline: esql`
          EVAL numeric_score = TO_INTEGER(${colScore})
          | KEEP ${colTitle}, numeric_score
          | SORT numeric_score DESC
          | LIMIT 10
        `,
      });

    case 'metadata_source':
      return savedObjectsClient.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: [namespace],
        metadata: ['_id', '_source'],
        setOptions,
        pipeline: esql`
          KEEP _id, _source
          | SORT _id
          | LIMIT 10
        `,
      });
  }
}
