/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import equal from 'fast-deep-equal';
import type { SavedObjectsType } from '@kbn/core-saved-objects-server';
import type { MigrationInfoRecord } from '../../types';
import {
  validateNewModelVersionSchemas,
  validateModelVersionNumbers,
  validateNoIndexOrEnabledFalse,
  getLatestModelVersion,
  validateInitialModelVersion,
} from './common_utils';
import {
  mappingsUpdated,
  validateNoStructuralModelVersionChanges,
  validateNewMappingsInModelVersion,
  validateNameTitleFieldTypesExistingType,
} from './existing_type_utils';

interface ValidateChangesExistingTypeParams {
  from: MigrationInfoRecord;
  to: MigrationInfoRecord;
  registeredType: SavedObjectsType;
  log: (message: string) => void;
}

export function validateChangesExistingType({
  from,
  to,
  registeredType,
  log,
}: ValidateChangesExistingTypeParams): void {
  const name = to.name;

  // check that no migrations have been removed or mutated
  if (
    (from.migrationVersions && !to.migrationVersions) ||
    !equal(to.migrationVersions, from.migrationVersions)
  ) {
    throw new Error(
      `❌ Modifications have been detected in the '${name}.migrations'. This property is deprected and no modifications are allowed.`
    );
  }

  // check that no model versions have been removed
  if (
    (from.modelVersions && !to.modelVersions) ||
    to.modelVersions.length < from.modelVersions.length
  ) {
    throw new Error(`❌ Some model versions have been deleted for SO type '${name}'.`);
  }

  // check that defined modelVersions are consecutive integer numbers, starting at 1
  validateModelVersionNumbers(name, to.modelVersions);

  // validate that name and title fields are of type "text"
  validateNameTitleFieldTypesExistingType(name, to, from, registeredType, log);

  // Schema-only mutations are tolerated (they don't affect ES index operations).
  validateNoStructuralModelVersionChanges(from, to, registeredType, log);

  const newModelVersionCount = to.modelVersions.length - from.modelVersions.length;

  if (newModelVersionCount === 0) {
    if (mappingsUpdated(from, to)) {
      throw new Error(
        `❌ The '${name}' SO type has changes in the mappings, but is missing a modelVersion that defines these changes.`
      );
    }
  } else if (newModelVersionCount === 1) {
    const newModelVersion = getLatestModelVersion(to);

    if (to.modelVersions.length === 1) {
      // an existing SO type can be defining its first model version ever
      validateInitialModelVersion(name, newModelVersion);
    }

    // check that the last modelVersion has schemas and that schemas have both create and forwardCompatibility defined
    validateNewModelVersionSchemas(name, newModelVersion);

    // validate that newly added mapping fields are declared in the new model version
    validateNewMappingsInModelVersion(name, from, to);

    // validate that new mappings do not use index: false or enabled: false
    validateNoIndexOrEnabledFalse(name, to, [newModelVersion]);
  } else {
    // cannot define more than 1 new model version at a time
    throw new Error(
      `❌ The SO type '${name}' is defining ${newModelVersionCount} new model versions, but can only define one at a time.`
    );
  }
}
