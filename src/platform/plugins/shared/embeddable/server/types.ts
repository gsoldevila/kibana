/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import { PersistableState, PersistableStateDefinition } from '@kbn/kibana-utils-plugin/common';
import { EmbeddableStateWithType } from './persistable_state/types';

export type EmbeddableFactoryRegistry = Map<string, EmbeddableRegistryItem>;
export type EnhancementsRegistry = Map<string, EnhancementRegistryItem>;

export interface EnhancementRegistryDefinition<P extends SerializableRecord = SerializableRecord>
  extends PersistableStateDefinition<P> {
  id: string;
}

export interface EnhancementRegistryItem<P extends SerializableRecord = SerializableRecord>
  extends PersistableState<P> {
  id: string;
}

export interface EmbeddableRegistryItem<P extends EmbeddableStateWithType = EmbeddableStateWithType>
  extends PersistableState<P> {
  id: string;
}

export interface EmbeddableRegistryDefinition<
  P extends EmbeddableStateWithType = EmbeddableStateWithType
> extends PersistableStateDefinition<P> {
  id: string;
}
