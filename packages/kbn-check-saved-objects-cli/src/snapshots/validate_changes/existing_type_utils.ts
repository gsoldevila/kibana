/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHash } from 'crypto';
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
 * Returns true if the structural fields of two model version summaries are identical,
 * meaning any detected difference must be limited to schemas.
 * Structural fields are changeTypes, hasTransformation, and newMappings.
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
 * Schema-only mutations (create / forwardCompatibility) are tolerated when they are
 * non-breaking. Specific breaking changes (field removal, type changes, adding required
 * fields to a create schema) cause an error. Non-breaking changes (new optional fields,
 * loosened constraints) are allowed silently. Potentially tightening changes (new rules,
 * custom validators) emit a warning.
 *
 * When comparing against an older baseline that stored schemas as hashes, granular
 * diffing is not possible; a general warning is emitted instead.
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
  const schemaOnlyMutations: MutationEntry[] = [];
  const structuralMutations: string[] = [];

  from.modelVersions.forEach((summaryBefore, index) => {
    const summaryAfter = to.modelVersions[index];
    const versionLabel = `10.${summaryBefore.version}.0`;

    if (!summaryBefore.modelVersionHash) {
      // Very old snapshot format without hash properties – treat any change as structural.
      const comparable: Partial<ModelVersionSummary> = cloneDeep(summaryAfter);
      delete comparable.modelVersionHash;
      // @ts-ignore we're simulating an older version of the type without the new properties
      delete comparable.schemas.create;
      // @ts-ignore we're simulating an older version of the type without the new properties
      comparable.schemas.forwardCompatibility = Boolean(comparable.schemas.forwardCompatibility);
      if (!equal(summaryBefore, comparable)) {
        structuralMutations.push(versionLabel);
      }
    } else if (!isOnlySchemaMutated(summaryBefore, summaryAfter)) {
      structuralMutations.push(versionLabel);
    } else if (schemasChanged(summaryBefore, summaryAfter)) {
      schemaOnlyMutations.push({ versionLabel, before: summaryBefore, after: summaryAfter });
    }
  });

  if (structuralMutations.length > 0) {
    throw new Error(
      `❌ Some modelVersions have been structurally updated for SO type '${name}' after they were defined: ${structuralMutations}.`
    );
  }

  if (schemaOnlyMutations.length > 0) {
    validateAllMappingsInModelVersion(name, to, registeredType);
    reportSchemaChanges(name, schemaOnlyMutations, log);
  }
}

// ---------------------------------------------------------------------------
// Schema change detection (handles cross-format: hash strings vs. objects)
// ---------------------------------------------------------------------------

/**
 * Returns true if the schemas of two model version summaries differ.
 * Handles three snapshot formats for the `schemas.create` / `schemas.forwardCompatibility`
 * fields:
 *  - `false`                     – no schema defined
 *  - `string`                    – SHA-256 hash (older baseline format)
 *  - `Record<string, unknown>`   – full serialized Joi `describe()` output (current format)
 *
 * Cross-format comparison (hash vs. object) works by computing `SHA-256(JSON.stringify(obj))`
 * and comparing it against the stored hash, because that is exactly how the hash was
 * originally produced.
 */
function schemasChanged(before: ModelVersionSummary, after: ModelVersionSummary): boolean {
  return (
    !schemasEqual(before.schemas.create as SchemasValue, after.schemas.create as SchemasValue) ||
    !schemasEqual(
      before.schemas.forwardCompatibility as SchemasValue,
      after.schemas.forwardCompatibility as SchemasValue
    )
  );
}

type SchemasValue = false | string | Record<string, unknown>;

function schemasEqual(a: SchemasValue, b: SchemasValue): boolean {
  if (a === false && b === false) return true;
  if (a === false || b === false) return false;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'string') return a === computeSchemaHash(b as Record<string, unknown>);
  if (typeof b === 'string') return computeSchemaHash(a) === b;
  return equal(a, b);
}

function computeSchemaHash(schema: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

// ---------------------------------------------------------------------------
// Schema change reporting and granular diffing
// ---------------------------------------------------------------------------

function reportSchemaChanges(
  name: string,
  mutations: MutationEntry[],
  log: (message: string) => void
): void {
  const breaking: string[] = [];
  const warnings: string[] = [];
  const undiffable: string[] = [];

  for (const { versionLabel, before, after } of mutations) {
    if (canDiffSchemas(before, after)) {
      const diff = diffModelVersionSchemas(before, after);
      diff.breaking.forEach((msg) => breaking.push(`[${versionLabel}] ${msg}`));
      diff.warnings.forEach((msg) => warnings.push(`[${versionLabel}] ${msg}`));
    } else {
      undiffable.push(versionLabel);
    }
  }

  if (breaking.length > 0) {
    throw new Error(
      `❌ Breaking schema changes detected in SO type '${name}':\n  - ${breaking.join('\n  - ')}`
    );
  }

  const versionLabels = mutations.map((m) => m.versionLabel).join(', ');

  if (undiffable.length > 0) {
    log(
      `⚠️ WARNING: Schema-only changes detected in model version(s) ${undiffable.join(', ')} ` +
        `of SO type '${name}' (baseline uses hash format — upgrade the baseline to enable detailed diff).`
    );
  }

  if (warnings.length > 0) {
    log(
      `⚠️ WARNING: Potentially breaking schema changes detected in model version(s) ` +
        `${versionLabels} of SO type '${name}':\n  - ${warnings.join('\n  - ')}`
    );
  } else if (undiffable.length === 0) {
    log(
      `⚠️ WARNING: Schema-only changes detected in model version(s) ${versionLabels} ` +
        `of SO type '${name}' (all changes are non-breaking).`
    );
  }
}

interface MutationEntry {
  versionLabel: string;
  before: ModelVersionSummary;
  after: ModelVersionSummary;
}

function canDiffSchemas(before: ModelVersionSummary, after: ModelVersionSummary): boolean {
  const isObject = (s: SchemasValue): s is Record<string, unknown> =>
    typeof s === 'object' && s !== null;
  const bCreate = before.schemas.create as SchemasValue;
  const aCreate = after.schemas.create as SchemasValue;
  const bFwd = before.schemas.forwardCompatibility as SchemasValue;
  const aFwd = after.schemas.forwardCompatibility as SchemasValue;
  return (
    (bCreate === false || isObject(bCreate)) &&
    (aCreate === false || isObject(aCreate)) &&
    (bFwd === false || isObject(bFwd)) &&
    (aFwd === false || isObject(aFwd))
  );
}

interface SchemaDiffResult {
  breaking: string[];
  warnings: string[];
}

function diffModelVersionSchemas(
  before: ModelVersionSummary,
  after: ModelVersionSummary
): SchemaDiffResult {
  const createDiff = diffSchemas(
    before.schemas.create as false | Record<string, unknown>,
    after.schemas.create as false | Record<string, unknown>,
    'create'
  );
  const fwdDiff = diffSchemas(
    before.schemas.forwardCompatibility as false | Record<string, unknown>,
    after.schemas.forwardCompatibility as false | Record<string, unknown>,
    'forwardCompatibility'
  );
  return {
    breaking: [...createDiff.breaking, ...fwdDiff.breaking],
    warnings: [...createDiff.warnings, ...fwdDiff.warnings],
  };
}

/**
 * Compares two serialized Joi `describe()` schema objects and classifies changes
 * per the following rules (applied recursively to all named fields):
 *
 * | Change                                  | `create`   | `forwardCompatibility` |
 * |-----------------------------------------|------------|------------------------|
 * | Field removed                           | ❌ break   | ❌ break               |
 * | Field type changed                      | ❌ break   | ❌ break               |
 * | Optional → required field               | ❌ break   | ⚠️ warn               |
 * | Required field added                    | ❌ break   | ⚠️ warn               |
 * | New optional field                      | ✅ allow   | ✅ allow               |
 * | Required → optional field               | ✅ allow   | ✅ allow               |
 * | Constraint tightened / validator added  | ⚠️ warn    | ⚠️ warn               |
 * | Constraint loosened / validator removed | ✅ allow   | ✅ allow               |
 */
function diffSchemas(
  before: false | Record<string, unknown>,
  after: false | Record<string, unknown>,
  schemaType: 'create' | 'forwardCompatibility'
): SchemaDiffResult {
  if (before === false || after === false) {
    return { breaking: [], warnings: [] };
  }

  const beforeFields = new Map(extractFieldDescriptions(before, '').map((f) => [f.path, f]));
  const afterFields = new Map(extractFieldDescriptions(after, '').map((f) => [f.path, f]));

  const breaking: string[] = [];
  const warnings: string[] = [];

  for (const [path] of beforeFields) {
    if (!afterFields.has(path)) {
      breaking.push(`field '${path}' removed from ${schemaType} schema`);
    }
  }

  for (const [path, afterField] of afterFields) {
    const beforeField = beforeFields.get(path);

    if (!beforeField) {
      if (afterField.presence === 'required') {
        if (schemaType === 'create') {
          breaking.push(`required field '${path}' added to ${schemaType} schema`);
        } else {
          warnings.push(`required field '${path}' added to ${schemaType} schema`);
        }
      }
      continue;
    }

    if (beforeField.type !== afterField.type) {
      breaking.push(
        `field '${path}' type changed from '${beforeField.type}' to '${afterField.type}' in ${schemaType} schema`
      );
      continue;
    }

    if (beforeField.presence === 'optional' && afterField.presence === 'required') {
      if (schemaType === 'create') {
        breaking.push(`field '${path}' changed from optional to required in ${schemaType} schema`);
      } else {
        warnings.push(`field '${path}' changed from optional to required in ${schemaType} schema`);
      }
    }

    if (afterField.rulesCount > beforeField.rulesCount) {
      warnings.push(
        `field '${path}' has ${
          afterField.rulesCount - beforeField.rulesCount
        } new constraint(s) in ${schemaType} schema`
      );
    } else if (
      afterField.rulesCount === beforeField.rulesCount &&
      !equal(beforeField.rules, afterField.rules)
    ) {
      warnings.push(`field '${path}' has modified constraints in ${schemaType} schema`);
    }

    if (!equal(beforeField.customValidators, afterField.customValidators)) {
      warnings.push(`field '${path}' has changed custom validators in ${schemaType} schema`);
    }
  }

  return { breaking, warnings };
}

// ---------------------------------------------------------------------------
// Schema field extraction from Joi describe() output
// ---------------------------------------------------------------------------

interface FieldDescription {
  path: string;
  type: string;
  presence: 'required' | 'optional';
  rulesCount: number;
  rules: unknown[];
  customValidators: unknown[];
}

type SchemaNode = Record<string, unknown>;

function extractFieldDescriptions(schema: SchemaNode, prefix: string): FieldDescription[] {
  const keys = schema.keys as Record<string, SchemaNode> | undefined;
  if (!keys) return [];

  return Object.entries(keys).flatMap(([key, fieldSchema]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const resolvedType = resolveSchemaType(fieldSchema);
    const presence = resolvePresence(fieldSchema);
    const rules = (fieldSchema.rules as unknown[]) ?? [];
    const customValidators = rules.filter((r) => {
      const rule = r as SchemaNode;
      return rule.name === 'custom' || rule.__fn !== undefined;
    });

    const desc: FieldDescription = {
      path,
      type: resolvedType,
      presence,
      rulesCount: rules.length,
      rules,
      customValidators,
    };

    const nested =
      resolvedType === 'object' && fieldSchema.keys
        ? extractFieldDescriptions(fieldSchema, path)
        : [];

    return [desc, ...nested];
  });
}

function resolveSchemaType(schema: SchemaNode): string {
  const type = schema.type as string;
  if (type === 'alternatives') {
    const matches = schema.matches as Array<{ schema: SchemaNode }> | undefined;
    if (matches) {
      const nonNull = matches.find((m) => {
        const s = m.schema;
        return !(s.type === 'any' && (s.allow as unknown[] | undefined)?.includes(null));
      });
      if (nonNull) return resolveSchemaType(nonNull.schema);
    }
  }
  return type ?? 'unknown';
}

function resolvePresence(schema: SchemaNode): 'required' | 'optional' {
  const flags = schema.flags as Record<string, unknown> | undefined;
  return flags?.presence === 'optional' ? 'optional' : 'required';
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
