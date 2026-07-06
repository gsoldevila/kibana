/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  DEFAULT_APP_CATEGORIES,
  type CoreSetup,
  type CoreStart,
  type Logger,
  type Plugin,
  type PluginInitializerContext,
  type SavedObjectsServiceStart,
} from '@kbn/core/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { UNMAPPED_FIELDS_ITEM_TYPE } from '../common/constants';
import { unmappedFieldsItemType } from './saved_objects';
import { registerUnmappedFieldsEsqlRoutes } from './routes';

interface SetupDeps {
  features: FeaturesPluginSetup;
  spaces: SpacesPluginSetup;
}

interface StartDeps {
  spaces: SpacesPluginStart;
}

export class UnmappedFieldsEsqlExamplePlugin implements Plugin<void, void, SetupDeps, StartDeps> {
  private readonly logger: Logger;
  private savedObjectsStart: SavedObjectsServiceStart | undefined;
  private spacesStart: SpacesPluginStart | undefined;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup<StartDeps>, plugins: SetupDeps) {
    core.savedObjects.registerType(unmappedFieldsItemType);

    plugins.features.registerKibanaFeature({
      id: 'unmappedFieldsEsqlExample',
      name: 'Unmapped fields ES|QL example',
      category: DEFAULT_APP_CATEGORIES.kibana,
      app: ['unmappedFieldsEsqlExample'],
      privileges: {
        all: {
          app: ['unmappedFieldsEsqlExample'],
          savedObject: {
            all: [UNMAPPED_FIELDS_ITEM_TYPE],
            read: [UNMAPPED_FIELDS_ITEM_TYPE],
          },
          api: [],
          ui: [],
        },
        read: {
          app: ['unmappedFieldsEsqlExample'],
          savedObject: {
            all: [],
            read: [UNMAPPED_FIELDS_ITEM_TYPE],
          },
          api: [],
          ui: [],
        },
      },
    });

    registerUnmappedFieldsEsqlRoutes({
      router: core.http.createRouter(),
      logger: this.logger,
      getSavedObjectsStart: () => this.savedObjectsStart,
      getSpacesStart: () => this.spacesStart,
    });
  }

  public start(_core: CoreStart, plugins: StartDeps) {
    this.savedObjectsStart = _core.savedObjects;
    this.spacesStart = plugins.spaces;
  }

  public stop() {}
}
