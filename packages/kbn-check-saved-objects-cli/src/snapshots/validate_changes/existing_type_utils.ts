/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import equal from 'fast-deep-equal';
import { cloneDeep, difference } from 'lodash';
import type { SavedObjectsType } from '@kbn/core-saved-objects-server';
import type { MigrationInfoRecord, ModelVersionSummary } from '../../types';
import {
  getMappingFieldPaths,
  validateAllMappingsInModelVersion,
  getLatestModelVersion,
  getInvalidNameTitleFields,
  isSearchableViaManagement,
} from './common_utils';

export function mappingsUpdated(
  infoBefore: MigrationInfoRecord,
  infoAfter: MigrationInfoRecord
): boolean {
  return !equal(infoBefore.mappings, infoAfter.mappings);
}

/**
 * Returns true if the changes between two model versions are limited to schemas
 * (create and/or forwardCompatibility). Structural fields such as changeTypes,
 * hasTransformation, and newMappings must be identical.
 */
export function isOnlySchemaMutated(
  before: ModelVersionSummary,
  after: ModelVersionSummary
): boolean {
  return (
    before.version === after.version &&
    equal(before.changeTypes, after.changeTypes) &&
    before.hasTransformation === after.hasTransformation &&
    equal(before.newMappings, after.newMappings)
  );
}

/**
 * Validates that no model versions have been structurally mutated (i.e. changes to
 * changeTypes, hasTransformation, or newMappings).
 *
 * Schema-only mutations (create / forwardCompatibility) are tolerated: they affect
 * only validation logic, not ES index operations, so no model version bump is required
 * for them. A warning is emitted for each schema-only mutation found. When schema-only
 * mutations are present, the registered type's create schema is also validated to ensure
 * it still covers all mapped fields.
 *
 * Structural mutations (which drive index operations during upgrades) still fail
 * unconditionally.
 */
export function validateNoStructuralModelVersionChanges(
  from: MigrationInfoRecord,
  to: MigrationInfoRecord,
  registeredType: SavedObjectsType,
  log: (message: string) => void
): void {
  const name = to.name;
  const schemaOnlyMutations: string[] = [];
  const structuralMutations: string[] = [];

  from.modelVersions.forEach((summaryBefore, index) => {
    const summaryAfter = to.modelVersions[index];
    const versionLabel = `10.${summaryBefore.version}.0`;

    if (!summaryBefore.modelVersionHash) {
      // Comparing against an old snapshot without hash properties - we cannot reliably
      // distinguish schema-only from structural mutations, so treat any change as structural.
      const comparable: Partial<ModelVersionSummary> = cloneDeep(summaryAfter);
      delete comparable.modelVersionHash;
      // @ts-ignore we're simulating an older version of the type without the new properties
      delete comparable.schemas.create;
      // @ts-ignore we're simulating an older version of the type without the new properties
      comparable.schemas.forwardCompatibility = Boolean(comparable.schemas.forwardCompatibility);
      if (!equal(summaryBefore, comparable)) {
        structuralMutations.push(versionLabel);
      }
    } else if (!equal(summaryBefore, summaryAfter)) {
      if (isOnlySchemaMutated(summaryBefore, summaryAfter)) {
        schemaOnlyMutations.push(versionLabel);
      } else {
        structuralMutations.push(versionLabel);
      }
    }
  });

  if (structuralMutations.length > 0) {
    throw new Error(
      `❌ Some modelVersions have been structurally updated for SO type '${name}' after they were defined: ${structuralMutations}.`
    );
  }

  if (schemaOnlyMutations.length > 0) {
    validateAllMappingsInModelVersion(name, to, registeredType);
    log(
      `⚠️ WARNING: Schema-only changes detected in model version(s) ${schemaOnlyMutations.join(
        ', '
      )} of SO type '${name}'.`
    );
  }
}

export function validateNewMappingsInModelVersion(
  name: string,
  from: MigrationInfoRecord,
  to: MigrationInfoRecord
): void {
  if (to.modelVersions.length <= from.modelVersions.length) {
    return;
  }

  const newMappingFields = difference(
    getMappingFieldPaths(to.mappings),
    getMappingFieldPaths(from.mappings)
  );
  if (newMappingFields.length === 0) {
    return;
  }

  const newModelVersion = getLatestModelVersion(to);
  const declaredMappings = new Set(
    newModelVersion.newMappings.map((m) => {
      const lastDot = m.lastIndexOf('.');
      return lastDot > 0 ? m.slice(0, lastDot) : m;
    })
  );

  const undeclaredFields = newMappingFields.filter((field) => !declaredMappings.has(field));
  if (undeclaredFields.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has new mapping fields that are not declared in model version '${
        newModelVersion.version
      }': ${undeclaredFields.join(', ')}. ` +
        `All new mapping fields must be declared via 'mappings_addition' changes in the corresponding model version.`
    );
  }
}

/**
 * Validates that `name` and `title` mapping fields use `type: text` on an **existing** SO type.
 * Types that are not searchable via the management page are exempt.
 *
 * A field type cannot be changed from 'keyword' to 'text' without reindexing, so when a field
 * with an incorrect type was already present in the baseline (`from`), a warning is emitted
 * instead of throwing. Only fields newly introduced with the wrong type cause a hard failure.
 */
export function validateNameTitleFieldTypesExistingType(
  name: string,
  to: MigrationInfoRecord,
  from: MigrationInfoRecord,
  registeredType: SavedObjectsType,
  log: (message: string) => void
): void {
  if (!isSearchableViaManagement(registeredType)) {
    return;
  }

  const invalidInTo = getInvalidNameTitleFields(to);
  if (invalidInTo.length === 0) {
    return;
  }

  // A field is "pre-existing" only if it was already invalid in the baseline — not merely
  // present. This correctly catches the case where a field was downgraded from 'text' to
  // 'keyword', which is a newly introduced problem even though the key existed before.
  const alreadyInvalidInFrom = new Set(
    getInvalidNameTitleFields(from).map(({ fieldName }) => fieldName)
  );

  const preExisting = invalidInTo.filter(({ fieldName }) => alreadyInvalidInFrom.has(fieldName));
  const newlyIntroduced = invalidInTo.filter(
    ({ fieldName }) => !alreadyInvalidInFrom.has(fieldName)
  );

  if (preExisting.length > 0) {
    log(
      `⚠️  The SO type '${name}' has pre-existing 'name' or 'title' fields with incorrect types: ${preExisting
        .map(({ description }) => description)
        .join(', ')}. ` +
        `These fields must be of type 'text' for Search API compatibility, but cannot be changed without reindexing existing data.`
    );
  }

  if (newlyIntroduced.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has 'name' or 'title' fields with incorrect types: ${newlyIntroduced
        .map(({ description }) => description)
        .join(', ')}. ` + `These fields must be of type 'text' for Search API compatibility.`
    );
  }
}
