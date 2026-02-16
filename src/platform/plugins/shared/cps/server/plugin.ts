/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import { registerRoutes } from './routes';
import type { CPSConfig } from './config';
import type { CPSServerSetup } from './types';

const CPS_PROJECT_ROUTING_ALL = '_alias:_origin';

export class CPSServerPlugin implements Plugin<CPSServerSetup> {
  private readonly initContext: PluginInitializerContext;
  private readonly isServerless: boolean;
  private readonly config$: CPSConfig;

  constructor(initContext: PluginInitializerContext) {
    this.initContext = { ...initContext };
    this.isServerless = initContext.env.packageInfo.buildFlavor === 'serverless';
    this.config$ = initContext.config.get();
  }

  public setup(core: CoreSetup) {
    const { initContext, config$ } = this;
    const { enabled, cpsEnabled } = config$;

    // Register route only for serverless
    if (this.isServerless) {
      if (enabled) {
        registerRoutes(core, initContext);
      }
      if (cpsEnabled) {
        core.elasticsearch.registerProjectRoutingResolver(async (request) => {
          // TODO use namespace-based named routing expressions (see https://github.com/elastic/kibana/pull/250990/changes#diff-d4c45adb24e34f0646a02ab753e763f13aed939ffb33da72d21f427d3f2c5981R8)
          return CPS_PROJECT_ROUTING_ALL;
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
