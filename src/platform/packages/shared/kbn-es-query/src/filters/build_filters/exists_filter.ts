/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { has } from 'lodash';
import type { DataViewFieldBase, DataViewBaseNoFields } from '../../es_query';
import type { Filter, FilterMeta } from './types';

/** @public */
export type ExistsFilter = Filter & {
  meta: FilterMeta;
  query: {
    exists?: {
      field: string;
    };
  };
};

/**
 * @param filter
 * @returns `true` if a filter is an `ExistsFilter`
 *
 * @public
 */
export const isExistsFilter = (filter: Filter): filter is ExistsFilter =>
  has(filter, 'query.exists');

/**
 * @internal
 */
export const getExistsFilterField = (filter: ExistsFilter) => {
  return filter.query.exists && filter.query.exists.field;
};

/**
 * Builds an `ExistsFilter`
 * @param field field to validate the existence of
 * @param indexPattern index pattern to look for the field in
 * @returns An `ExistsFilter`
 *
 * @public
 */
export const buildExistsFilter = (field: DataViewFieldBase, indexPattern: DataViewBaseNoFields) => {
  return {
    meta: {
      index: indexPattern.id,
    },
    query: {
      exists: {
        field: field.name,
      },
    },
  } as ExistsFilter;
};

export const buildSimpleExistFilter = (fieldName: string, dataViewId: string) => {
  return {
    meta: {
      index: dataViewId,
    },
    query: {
      exists: {
        field: fieldName,
      },
    },
  } as ExistsFilter;
};
