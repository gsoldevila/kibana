/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ISpacesClient } from '@kbn/spaces-plugin/server';
import { EXAMPLE_SPACE_ID } from '../common/constants';

export async function ensureExampleSpace(spacesClient: ISpacesClient): Promise<void> {
  try {
    await spacesClient.get(EXAMPLE_SPACE_ID);
  } catch {
    await spacesClient.create({
      id: EXAMPLE_SPACE_ID,
      name: 'Namespace A',
      description: 'Example space for unmapped fields ES|QL demo',
      color: '#006bb4',
      disabledFeatures: [],
    });
  }
}
