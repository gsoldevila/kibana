/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { DeveloperExamplesSetup } from '@kbn/developer-examples-plugin/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { UnmappedFieldsEsqlApp } from './app';

interface SetupDeps {
  developerExamples: DeveloperExamplesSetup;
}

export class UnmappedFieldsEsqlExamplePlugin implements Plugin<void, void, SetupDeps> {
  public setup(core: CoreSetup, deps: SetupDeps) {
    core.application.register({
      id: 'unmappedFieldsEsqlExample',
      title: 'Unmapped fields ES|QL',
      async mount({ element }: AppMountParameters) {
        ReactDOM.render(
          <KibanaContextProvider services={{ http: core.http }}>
            <UnmappedFieldsEsqlApp http={core.http} />
          </KibanaContextProvider>,
          element
        );
        return () => ReactDOM.unmountComponentAtNode(element);
      },
    });

    deps.developerExamples.register({
      appId: 'unmappedFieldsEsqlExample',
      title: 'Unmapped fields ES|QL',
      description:
        'Query saved object attributes stored in _source but not mapped, using savedObjectsClient.esql() and SET unmapped_fields.',
    });
  }

  public start(_core: CoreStart) {}

  public stop() {}
}
