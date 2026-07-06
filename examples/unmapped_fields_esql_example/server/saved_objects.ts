/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsType } from '@kbn/core/server';
import { UNMAPPED_FIELDS_ITEM_TYPE } from '../common/constants';

export interface UnmappedFieldsItemAttributes {
  /** Mapped — indexed and queryable without unmapped_fields. */
  title: string;
  /** Unmapped — stored in _source only; query via SET unmapped_fields = "LOAD". */
  category?: string;
  /** Unmapped numeric-like value stored as string in _source. */
  score?: string;
  /** Unmapped free-text notes. */
  notes?: string;
}

export const unmappedFieldsItemType: SavedObjectsType<UnmappedFieldsItemAttributes> = {
  name: UNMAPPED_FIELDS_ITEM_TYPE,
  hidden: false,
  namespaceType: 'multiple',
  mappings: {
    dynamic: false,
    properties: {
      title: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
          },
        },
      },
    },
  },
  management: {
    importableAndExportable: false,
  },
  modelVersions: {},
};
