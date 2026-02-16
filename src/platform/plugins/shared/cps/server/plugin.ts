/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { SpacesPluginSetup } from '@kbn/spaces-plugin/server';
import { registerRoutes } from './routes';
import type { CPSConfig } from './config';
import type { CPSServerSetup } from './types';

const DEFAULT_SPACE_ID = 'default';

const getSpaceDefaultNpreName = (spaceId: string): string => `kibana_space_${spaceId}_default`;

interface CPSServerSetupDeps {
  spaces?: SpacesPluginSetup;
}

export class CPSServerPlugin implements Plugin<CPSServerSetup, void, CPSServerSetupDeps> {
  private readonly initContext: PluginInitializerContext;
  private readonly isServerless: boolean;
  private readonly config$: CPSConfig;

  constructor(initContext: PluginInitializerContext) {
    this.initContext = { ...initContext };
    this.isServerless = initContext.env.packageInfo.buildFlavor === 'serverless';
    this.config$ = initContext.config.get();
  }

  public setup(core: CoreSetup, plugins: CPSServerSetupDeps) {
    const { initContext, config$ } = this;
    const { enabled, cpsEnabled } = config$;

    // Register route only for serverless
    if (this.isServerless) {
      if (enabled) {
        registerRoutes(core, initContext);
      }
      if (cpsEnabled) {
        core.elasticsearch.registerProjectRoutingResolver(async (request) => {
          const spaceId = plugins.spaces?.spacesService.getSpaceId(request) ?? DEFAULT_SPACE_ID;
          return getSpaceDefaultNpreName(spaceId);
        });
      }
    }

    return {
      getCpsEnabled: () => cpsEnabled,
    };
  }

  public start(core: CoreStart) {
    return {};
  }

  public stop() {}
}
