/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { lazy } from 'react';
import { render, unmountComponentAtNode } from 'react-dom';
import { METRIC_TYPE } from '@kbn/analytics';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import {
  ExpressionValueVisDimension,
  VisualizationContainer,
} from '@kbn/visualizations-plugin/public';
import {
  ExpressionRenderDefinition,
  IInterpreterRenderHandlers,
} from '@kbn/expressions-plugin/common/expression_renderers';
import { getColumnByAccessor } from '@kbn/visualizations-plugin/common/utils';
import { Datatable } from '@kbn/expressions-plugin/common';
import { StartServicesGetter } from '@kbn/kibana-utils-plugin/public';
import {
  ChartSizeEvent,
  extractContainerType,
  extractVisualizationType,
} from '@kbn/chart-expressions-common';
import { css } from '@emotion/react';
import { ExpressionLegacyMetricPluginStart } from '../plugin';
import { EXPRESSION_METRIC_NAME, MetricVisRenderConfig, VisParams } from '../../common';

// @ts-ignore
const MetricVisComponent = lazy(() => import('../components/metric_component'));

async function metricFilterable(
  dimensions: VisParams['dimensions'],
  table: Datatable,
  handlers: IInterpreterRenderHandlers
) {
  return Promise.all(
    dimensions.metrics.map(async (metric: string | ExpressionValueVisDimension) => {
      const column = getColumnByAccessor(metric, table.columns);
      const colIndex = table.columns.indexOf(column!);
      return Boolean(
        await handlers.hasCompatibleActions?.({
          name: 'filter',
          data: {
            data: [
              {
                table,
                column: colIndex,
                row: 0,
              },
            ],
          },
        })
      );
    })
  );
}

/** @internal **/
export interface ExpressionMetricVisRendererDependencies {
  getStartDeps: StartServicesGetter<ExpressionLegacyMetricPluginStart>;
}

export const getMetricVisRenderer: (
  deps: ExpressionMetricVisRendererDependencies
) => ExpressionRenderDefinition<MetricVisRenderConfig> = ({ getStartDeps }) => ({
  name: EXPRESSION_METRIC_NAME,
  displayName: 'metric visualization',
  reuseDomNode: true,
  render: async (domNode, { visData, visConfig, canNavigateToLens }, handlers) => {
    const { core, plugins } = getStartDeps();

    handlers.onDestroy(() => {
      unmountComponentAtNode(domNode);
    });

    const filterable = await metricFilterable(visConfig.dimensions, visData, handlers);

    const renderComplete = () => {
      const executionContext = handlers.getExecutionContext();
      const containerType = extractContainerType(executionContext);
      const visualizationType = extractVisualizationType(executionContext);

      if (containerType && visualizationType) {
        const events = [
          `render_${visualizationType}_legacy_metric`,
          canNavigateToLens ? `render_${visualizationType}_legacy_metric_convertable` : undefined,
        ].filter<string>((event): event is string => Boolean(event));

        plugins.usageCollection?.reportUiCounter(containerType, METRIC_TYPE.COUNT, events);
      }

      handlers.done();
    };

    const chartSizeEvent: ChartSizeEvent = {
      name: 'chartSize',
      data: {
        maxDimensions: {
          x: { value: 100, unit: 'percentage' },
          y: { value: 100, unit: 'percentage' },
        },
      },
    };

    handlers.event(chartSizeEvent);

    render(
      <KibanaRenderContextProvider {...core}>
        <VisualizationContainer
          data-test-subj="legacyMtrVis"
          className="eui-scrollBar legacyMtrVis"
          showNoResult={!visData.rows?.length}
          renderComplete={renderComplete}
          handlers={handlers}
          css={legacyMtrVisCss}
        >
          <MetricVisComponent
            visData={visData}
            visParams={visConfig}
            renderComplete={renderComplete}
            fireEvent={handlers.event}
            filterable={filterable}
          />
        </VisualizationContainer>
      </KibanaRenderContextProvider>,
      domNode
    );
  },
});

const legacyMtrVisCss = css({
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  flexWrap: 'wrap',
  overflow: 'auto',
});
