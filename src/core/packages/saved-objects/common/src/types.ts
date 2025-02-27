/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * An identifier for a saved object within a space.
 *
 * @public
 */
export interface SavedObjectTypeIdTuple {
  /** The id of the saved object */
  id: string;
  /** The type of the saved object */
  type: string;
}

/**
 * Client interface for interacting with legacy URL aliases.
 */
export interface LegacyUrlAliasTarget {
  /**
   * The namespace that the object existed in when it was converted.
   */
  targetSpace: string;
  /**
   * The type of the object when it was converted.
   */
  targetType: string;
  /**
   * The original ID of the object, before it was converted.
   */
  sourceId: string;
}
