/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defaultLogViewsStaticConfig, LogViewsStaticConfig } from '../../../common/log_views';
import { LogViewsClient } from './log_views_client';
import { LogViewsServiceStartDeps, LogViewsServiceSetup, LogViewsServiceStart } from './types';

export class LogViewsService {
  private logViewsStaticConfig: LogViewsStaticConfig = defaultLogViewsStaticConfig;

  public setup(): LogViewsServiceSetup {
    return {
      setLogViewsStaticConfig: (config: LogViewsStaticConfig) => {
        this.logViewsStaticConfig = config;
      },
    };
  }

  public start({
    dataViews,
    http,
    search,
    logSourcesService,
  }: LogViewsServiceStartDeps): LogViewsServiceStart {
    const client = new LogViewsClient(
      dataViews,
      logSourcesService,
      http,
      search.search,
      this.logViewsStaticConfig
    );

    return {
      client,
    };
  }
}
