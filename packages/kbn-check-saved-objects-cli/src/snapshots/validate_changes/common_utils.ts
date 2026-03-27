/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectsType, ModelVersionIdentifier } from '@kbn/core-saved-objects-server';
import type { MigrationInfoRecord, ModelVersionSummary } from '../../types';
import { getVersions } from '../../migrations';

export function getFirstModelVersion(info: MigrationInfoRecord): ModelVersionSummary {
  const firstVersion = getVersions(info)
    .filter((version) => version !== '0.0.0')
    .pop()!;
  return info.modelVersions.find(({ version }) => `10.${version}.0` === firstVersion)!;
}

export function getLatestModelVersion(info: MigrationInfoRecord): ModelVersionSummary {
  const latestVersion = getVersions(info).shift()!;
  return info.modelVersions.find(({ version }) => `10.${version}.0` === latestVersion)!;
}

export function validateInitialModelVersion(name: string, mv: ModelVersionSummary): void {
  if (mv.changeTypes.length) {
    throw new Error(
      `❌ The new model version '${mv.version}' for SO type '${name}' is defining mappings' changes. For backwards-compatibility reasons, the initial model version can only include schema definitions.`
    );
  }
}

export function validateModelVersionNumbers(name: string, mvs: ModelVersionSummary[]) {
  mvs
    .map<number>(({ version }) => {
      const parsed = parseInt(version, 10);
      if (isNaN(parsed)) {
        throw new Error(
          `❌ Invalid model version '${version}' for SO type '${name}'. Model versions must be consecutive integer numbers starting at 1.`
        );
      }
      return parsed;
    })
    .sort((a, b) => a - b)
    .forEach((versionNumber, index, list) => {
      if (versionNumber !== index + 1) {
        throw new Error(
          `❌ The '${name}' SO type is missing model version '${
            index + 1
          }'. Model versions defined: ${list}`
        );
      }
    });
}

export function validateNewModelVersionSchemas(name: string, mv: ModelVersionSummary) {
  if (!mv.schemas) {
    throw new Error(
      `❌ The new model version '${mv.version}' for SO type '${name}' is missing the 'schemas' definition.`
    );
  }
  if (mv.schemas.forwardCompatibility === false) {
    throw new Error(
      `❌ The new model version '${mv.version}' for SO type '${name}' is missing the 'forwardCompatibility' schema definition.`
    );
  }
  if (mv.schemas.create === false) {
    throw new Error(
      `❌ The new model version '${mv.version}' for SO type '${name}' is missing the 'create' schema definition.`
    );
  }
}

/**
 * Extracts field paths from flattened ES mapping keys (e.g. properties.foo.type, properties.bar.properties.baz.type).
 * Returns paths in ES format (e.g. "bar.properties.baz" for nested).
 */
export function getMappingFieldPaths(mappings: Record<string, unknown>): string[] {
  return [
    ...new Set(
      Object.keys(mappings)
        .filter((key) => {
          if (!key.startsWith('properties.')) return false;
          // Exclude multi-field subfield paths (e.g. properties.name.fields.keyword.type).
          // In the flattened key format, a property literally named 'fields' is always surrounded
          // by '.properties.' boundaries (e.g. properties.parent.properties.fields.properties.id.type).
          // Stripping the leading 'properties.' prefix and then splitting on '.properties.' yields
          // one segment per nesting level. A '.fields.' occurrence inside any such segment means
          // the key describes a multi-field subfield, not a regular nested property.
          const keyBody = key.slice('properties.'.length);
          return !keyBody.split('.properties.').some((segment) => segment.includes('.fields.'));
        })
        .map((key) => {
          const withoutPrefix = key.slice('properties.'.length);
          const lastDotIndex = withoutPrefix.lastIndexOf('.');
          return lastDotIndex > 0 ? withoutPrefix.slice(0, lastDotIndex) : null;
        })
        .filter((path): path is string => path !== null)
    ),
  ].sort();
}

/**
 * Normalizes ES mapping path (e.g. "schedule.properties.interval") to schema path format (e.g. "schedule.interval")
 * for comparison with getSchemaStructure() output.
 */
export function toSchemaPathFormat(mappingPath: string): string {
  return mappingPath.replace(/\.properties\./g, '.');
}

/**
 * Recursively extracts field paths from a Joi schema in the same format that ES mapping
 * extraction produces, so they can be directly compared.
 *
 * Key differences from getSchemaStructure():
 *   - Arrays of objects: recurses into the item's object schema instead of stopping at the
 *     array, because ES has no array type and stores object sub-properties directly.
 *   - Union types (schema.nullable / schema.oneOf): recurses into all alternatives and
 *     returns the union of their paths.
 */
// Note: we deliberately access Joi schema internals here, following the same pattern already
// established in getSchemaStructure() in kbn-config-schema. If Joi internals change, both
// places will need updating.
function extractMappingCompatibleSchemaFields(joiSchema: any, path: string[] = []): string[] {
  // Union types (schema.nullable / schema.oneOf) — recurse into all alternatives
  const matches: Array<{ schema: any }> = joiSchema.$_terms?.matches;
  if (matches?.length > 0) {
    return matches.flatMap(({ schema: alt }) => extractMappingCompatibleSchemaFields(alt, path));
  }

  // Object types — recurse into named keys
  const namedKeys: Map<string, { schema: any }> = joiSchema._ids?._byKey;
  if (namedKeys?.size > 0) {
    return [...namedKeys.entries()].flatMap(([key, { schema: child }]) =>
      extractMappingCompatibleSchemaFields(child, [...path, key])
    );
  }

  // Array types — recurse into item schemas so that arrayOf(object({...})) produces the same
  // sub-paths as a plain ES object mapping.
  const items: any[] = joiSchema.$_terms?.items;
  if (items?.length > 0) {
    const itemPaths = items.flatMap((item) => extractMappingCompatibleSchemaFields(item, path));
    // If item schemas produced sub-paths the array contains objects; return those paths.
    // Otherwise it is an array of primitives and the field itself is the leaf.
    return itemPaths.length > 0 ? itemPaths : path.length > 0 ? [path.join('.')] : [];
  }

  // Leaf field (primitive, literal, etc.)
  return path.length > 0 ? [path.join('.')] : [];
}

export function validateAllMappingsInModelVersion(
  name: string,
  to: MigrationInfoRecord,
  registeredType: SavedObjectsType
): void {
  if (!to.modelVersions?.length) {
    return;
  }

  const modelVersionMap =
    typeof registeredType.modelVersions === 'function'
      ? registeredType.modelVersions()
      : registeredType.modelVersions ?? {};

  const latestVersionKey = Object.keys(modelVersionMap)
    .map(Number)
    .sort((a, b) => a - b)
    .pop();

  if (!latestVersionKey) {
    return;
  }

  const latestModelVersion = modelVersionMap[String(latestVersionKey) as ModelVersionIdentifier];
  const createSchema = latestModelVersion?.schemas?.create;
  if (!createSchema) {
    return;
  }

  const mappingFieldPaths = getMappingFieldPaths(to.mappings);

  // ES mappings have no array type — fields inside arrayOf(object(...)) appear as direct
  // sub-properties in the mapping, identical to plain object fields. We therefore traverse the
  // Joi schema recursively and recurse into array item schemas so the produced field paths match
  // what the mapping extraction would produce.
  const schemaFields = extractMappingCompatibleSchemaFields(createSchema.getSchema());

  // Normalize mapping paths (ES format: "parent.properties.child") to schema format ("parent.child")
  const normalizedMappingPaths = mappingFieldPaths.map((p) => toSchemaPathFormat(p));
  const undeclaredFields = normalizedMappingPaths.filter((field) => {
    if (schemaFields.includes(field)) return false;
    // A mapping may declare a parent field as type:object/enabled:false without enumerating
    // sub-properties (so only the parent path appears). If the schema has deeper leaf paths
    // under that parent, the field is still covered.
    if (schemaFields.some((sf) => sf.startsWith(`${field}.`))) return false;
    return true;
  });

  if (undeclaredFields.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has mapping fields not present in the latest model version schema: ${undeclaredFields.join(
        ', '
      )}. ` + `All mapping fields must be declared in the latest model version's 'create' schema.`
    );
  }
}

function throwIfIndexOrEnabledFalse(
  name: string,
  fieldsWithIndexFalse: string[],
  fieldsWithEnabledFalse: string[]
): void {
  if (fieldsWithIndexFalse.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has new mapping fields with 'index: false': ${fieldsWithIndexFalse.join(
        ', '
      )}. ` +
        `This option cannot be updated without reindexing. Use 'dynamic: false' instead or omit the mapping.`
    );
  }

  if (fieldsWithEnabledFalse.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has new mapping fields with 'enabled: false': ${fieldsWithEnabledFalse.join(
        ', '
      )}. ` +
        `This option cannot be updated without reindexing. Use 'dynamic: false' instead or omit the mapping.`
    );
  }
}

/**
 * Validates that mappings introduced in the given model versions do not use 'index: false'
 * or 'enabled: false'. Used for existing types where only newly added mapping fields need
 * to be checked.
 */
export function validateNoIndexOrEnabledFalse(
  name: string,
  to: MigrationInfoRecord,
  modelVersionsToCheck: ModelVersionSummary[]
): void {
  const fieldsWithIndexFalse: string[] = [];
  const fieldsWithEnabledFalse: string[] = [];

  modelVersionsToCheck.forEach((modelVersion) => {
    modelVersion.newMappings.forEach((mapping) => {
      const lastDot = mapping.lastIndexOf('.');
      const fieldPath = lastDot > 0 ? mapping.slice(0, lastDot) : mapping;

      if (to.mappings[`properties.${fieldPath}.index`] === false) {
        fieldsWithIndexFalse.push(fieldPath);
      }
      if (to.mappings[`properties.${fieldPath}.enabled`] === false) {
        fieldsWithEnabledFalse.push(fieldPath);
      }
    });
  });

  throwIfIndexOrEnabledFalse(name, fieldsWithIndexFalse, fieldsWithEnabledFalse);
}

/**
 * Validates that no field in the entire mapping uses 'index: false' or 'enabled: false'.
 * Used for new types where all mapping fields need to be checked (newMappings is always
 * empty for initial model versions, so we scan the full mappings snapshot instead).
 */
export function validateNoIndexOrEnabledFalseInAllMappings(
  name: string,
  to: MigrationInfoRecord
): void {
  const fieldsWithIndexFalse: string[] = [];
  const fieldsWithEnabledFalse: string[] = [];

  Object.entries(to.mappings).forEach(([key, value]) => {
    if (!key.startsWith('properties.') || value !== false) return;
    if (key.endsWith('.index')) {
      fieldsWithIndexFalse.push(
        toSchemaPathFormat(key.slice('properties.'.length, -'.index'.length))
      );
    } else if (key.endsWith('.enabled')) {
      fieldsWithEnabledFalse.push(
        toSchemaPathFormat(key.slice('properties.'.length, -'.enabled'.length))
      );
    }
  });

  throwIfIndexOrEnabledFalse(name, fieldsWithIndexFalse, fieldsWithEnabledFalse);
}

export function validateNameTitleFieldTypes(name: string, to: MigrationInfoRecord): void {
  const invalidFields: string[] = [];

  if (
    'properties.name.type' in to.mappings &&
    to.mappings['properties.name.type'] !== 'text'
  ) {
    invalidFields.push(
      `name (type: ${to.mappings['properties.name.type']}, expected: text)`
    );
  }

  if (
    'properties.title.type' in to.mappings &&
    to.mappings['properties.title.type'] !== 'text'
  ) {
    invalidFields.push(
      `title (type: ${to.mappings['properties.title.type']}, expected: text)`
    );
  }

  if (invalidFields.length > 0) {
    throw new Error(
      `❌ The SO type '${name}' has 'name' or 'title' fields with incorrect types: ${invalidFields.join(
        ', '
      )}. ` + `These fields must be of type 'text' for Search API compatibility.`
    );
  }
}
