/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { EXAMPLE_SPACE_ID, UNMAPPED_FIELDS_ITEM_TYPE } from '../common/constants';
import type { UnmappedFieldsItemAttributes } from './saved_objects';

export interface UnmappedFieldsItemSeed extends UnmappedFieldsItemAttributes {
  id: string;
}

export const defaultNamespaceItems: UnmappedFieldsItemSeed[] = [
  {
    id: 'item-1',
    title: 'Alpha dashboard',
    category: 'alpha',
    score: '10',
    notes: 'First item in default space',
  },
  {
    id: 'item-2',
    title: 'Beta dashboard',
    category: 'beta',
    score: '30',
    notes: 'Second item in default space',
  },
  {
    id: 'item-3',
    title: 'Gamma dashboard',
    category: 'alpha',
    score: '20',
    notes: 'Third item in default space',
  },
];

export const exampleSpaceItems: UnmappedFieldsItemSeed[] = [
  {
    id: 'item-a-1',
    title: 'Space A item',
    category: 'space-a',
    score: '5',
    notes: `Only visible in the ${EXAMPLE_SPACE_ID} space`,
  },
];

const assertNoBulkCreateErrors = (
  operation: string,
  results: Array<{ id?: string; error?: { message?: string } }>
) => {
  const errors = results.filter((result) => result.error);
  if (errors.length === 0) {
    return;
  }

  const details = errors
    .map((result) => `${result.id ?? 'unknown'}: ${result.error?.message ?? 'unknown error'}`)
    .join('; ');
  throw new Error(`${operation} failed for ${errors.length} object(s): ${details}`);
};

export async function setupSeedData(
  defaultSpaceClient: SavedObjectsClientContract,
  exampleSpaceClient: SavedObjectsClientContract
) {
  await defaultSpaceClient.bulkDelete(
    defaultNamespaceItems.map(({ id }) => ({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      id,
    }))
  );

  await exampleSpaceClient.bulkDelete(
    exampleSpaceItems.map(({ id }) => ({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      id,
    }))
  );

  const defaultCreateResult = await defaultSpaceClient.bulkCreate(
    defaultNamespaceItems.map(({ id, ...attributes }) => ({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      id,
      attributes,
    }))
  );
  assertNoBulkCreateErrors('bulkCreate (default)', defaultCreateResult.saved_objects);

  const exampleSpaceCreateResult = await exampleSpaceClient.bulkCreate(
    exampleSpaceItems.map(({ id, ...attributes }) => ({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      id,
      attributes,
    }))
  );
  assertNoBulkCreateErrors('bulkCreate (example space)', exampleSpaceCreateResult.saved_objects);
}
