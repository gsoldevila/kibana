/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Space } from '@kbn/spaces-plugin/public';

import { ALL_SPACES_ID } from '../../../../../../common/constants';

/**
 * The synthetic "all spaces" (`*`) entry shown throughout role management.
 *
 * It is modeled as a distinct type rather than a {@link Space} so that the `*`
 * sentinel never lives inside a real space's `id`. Keeping the sentinel out of
 * `Space.id` is the prerequisite for branding `Space.id` as a nominal `SpaceId`
 * (see https://github.com/elastic/kibana-team/issues/3680).
 */
export interface AllSpacesEntry {
  id: typeof ALL_SPACES_ID;
  name: string;
  color?: string;
  initials?: string;
  disabledFeatures: string[];
}

/**
 * A space displayed in role management: either a real {@link Space} or the
 * synthetic {@link AllSpacesEntry} "all spaces" pseudo-entry.
 */
export type RoleSpace = Space | AllSpacesEntry;

/** Type guard narrowing a {@link RoleSpace} to the "all spaces" pseudo-entry. */
export const isAllSpacesEntry = (space: RoleSpace): space is AllSpacesEntry =>
  space.id === ALL_SPACES_ID;

/** The single source of truth for the "all spaces" pseudo-entry display fields. */
export const createAllSpacesEntry = (name: string): AllSpacesEntry => ({
  id: ALL_SPACES_ID,
  name,
  color: '#D3DAE6',
  initials: '*',
  disabledFeatures: [],
});
