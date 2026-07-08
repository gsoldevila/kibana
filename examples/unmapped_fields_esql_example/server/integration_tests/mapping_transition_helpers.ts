/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
import { UNMAPPED_FIELDS_ITEM_TYPE } from '../../common/constants';

/** Mirrors the example saved object type mapping (title only; category unmapped). */
export const savedObjectLikeInitialMapping = {
  dynamic: false,
  properties: {
    [UNMAPPED_FIELDS_ITEM_TYPE]: {
      dynamic: false,
      properties: {
        title: {
          type: 'text',
          fields: {
            keyword: { type: 'keyword' },
          },
        },
      },
    },
  },
} as const;

export const savedObjectLikeMappingWithCategory = {
  dynamic: false,
  properties: {
    [UNMAPPED_FIELDS_ITEM_TYPE]: {
      dynamic: false,
      properties: {
        title: {
          type: 'text',
          fields: {
            keyword: { type: 'keyword' },
          },
        },
        category: { type: 'keyword' },
      },
    },
  },
} as const;

export const categoryFieldPath = `${UNMAPPED_FIELDS_ITEM_TYPE}.category`;

export const createTestIndex = async (client: Client, index: string) => {
  await client.indices.create({
    index,
    mappings: savedObjectLikeInitialMapping,
  });
};

export const deleteTestIndex = async (client: Client, index: string) => {
  await client.indices.delete({ index }, { ignore: [404] });
};

export const refreshIndex = async (client: Client, index: string) => {
  await client.indices.refresh({ index });
};

export const indexDocument = async (
  client: Client,
  index: string,
  id: string,
  attributes: { title: string; category?: string | number }
) => {
  await client.index({
    index,
    id,
    document: {
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      [UNMAPPED_FIELDS_ITEM_TYPE]: attributes,
    },
    refresh: true,
  });
};

export const countTermQuery = async (client: Client, index: string, category: string) => {
  const response = await client.count({
    index,
    query: {
      term: {
        [categoryFieldPath]: category,
      },
    },
  });
  return response.count;
};

export const putCategoryMapping = async (client: Client, index: string) => {
  return client.indices.putMapping({
    index,
    properties: {
      [UNMAPPED_FIELDS_ITEM_TYPE]: {
        properties: {
          category: { type: 'keyword' },
        },
      },
    },
  });
};
