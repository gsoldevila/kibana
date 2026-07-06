/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBasicTable,
  EuiButton,
  EuiCallOut,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPageTemplate,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { HttpSetup } from '@kbn/core/public';
import {
  EXAMPLE_SPACE_ID,
  QUERY_SCENARIOS,
  type QueryScenario,
  type QueryScenarioDefinition,
  type UnmappedFieldsMode,
} from '../common/constants';

interface QueryResponse {
  scenario: QueryScenario;
  unmappedFieldsMode: UnmappedFieldsMode;
  namespace: string;
  columns: Array<{ name: string; type: string }>;
  values: unknown[][];
}

interface UnmappedFieldsEsqlAppProps {
  http: HttpSetup;
}

const namespaceOptions = [
  { value: 'default', text: 'default' },
  { value: EXAMPLE_SPACE_ID, text: EXAMPLE_SPACE_ID },
];

export const UnmappedFieldsEsqlApp = ({ http }: UnmappedFieldsEsqlAppProps) => {
  const [selectedScenario, setSelectedScenario] = useState<QueryScenario>(QUERY_SCENARIOS[0].id);
  const [namespace, setNamespace] = useState('default');
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const scenarioDefinition = useMemo<QueryScenarioDefinition | undefined>(
    () => QUERY_SCENARIOS.find(({ id }) => id === selectedScenario),
    [selectedScenario]
  );

  const setupData = useCallback(async () => {
    await http.post('/api/unmapped_fields_esql_example/_setup');
  }, [http]);

  useEffect(() => {
    setupData().catch((setupError: unknown) => {
      setError(
        setupError instanceof Error
          ? `Setup failed: ${setupError.message}`
          : `Setup failed: ${String(setupError)}`
      );
    });
  }, [setupData]);

  const runScenario = useCallback(async () => {
    if (!scenarioDefinition) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await http.post<QueryResponse>('/api/unmapped_fields_esql_example/_query', {
        body: JSON.stringify({
          scenario: selectedScenario,
          unmappedFieldsMode: scenarioDefinition.unmappedFieldsMode,
          namespace,
        }),
      });
      setResponse(result);
    } catch (queryError) {
      setResponse(null);
      setError(String(queryError));
    } finally {
      setIsLoading(false);
    }
  }, [http, namespace, scenarioDefinition, selectedScenario]);

  const tableItems = useMemo(() => {
    if (!response) {
      return [];
    }

    return response.values.map((row, rowIndex) =>
      response.columns.reduce<Record<string, unknown>>(
        (item, column, columnIndex) => {
          item[column.name] = row[columnIndex];
          return item;
        },
        { id: String(rowIndex) }
      )
    );
  }, [response]);

  const tableColumns = useMemo(
    () =>
      response?.columns.map((column) => ({
        field: column.name,
        name: column.name,
        render: (value: unknown) =>
          typeof value === 'object' ? (
            <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
              {JSON.stringify(value, null, 2)}
            </EuiCodeBlock>
          ) : (
            String(value ?? '')
          ),
      })) ?? [],
    [response]
  );

  return (
    <EuiPageTemplate panelled>
      <EuiPageTemplate.Header
        pageTitle="Unmapped fields ES|QL example"
        description="Demonstrates querying saved object attributes stored in _source but not mapped, using savedObjectsClient.esql() with SET unmapped_fields."
      />
      <EuiPageTemplate.Section>
        <EuiText size="s">
          <p>
            The <code>unmapped-fields-item</code> saved object type maps only <strong>title</strong>
            . Attributes <strong>category</strong>, <strong>score</strong>, and{' '}
            <strong>notes</strong> are stored in <code>_source</code> under{' '}
            <code>dynamic: false</code> and require{' '}
            <code>SET unmapped_fields = &quot;LOAD&quot;</code> to reference them in ES|QL
            pipelines.
          </p>
        </EuiText>

        <EuiSpacer size="l" />

        <EuiFlexGroup alignItems="flexEnd">
          <EuiFlexItem grow={2}>
            <EuiFormRow label="Query scenario" fullWidth>
              <EuiSelect
                data-test-subj="unmappedFieldsScenarioSelect"
                fullWidth
                options={QUERY_SCENARIOS.map(({ id, label }) => ({ value: id, text: label }))}
                value={selectedScenario}
                onChange={(event) => setSelectedScenario(event.target.value as QueryScenario)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={1}>
            <EuiFormRow label="Namespace" fullWidth>
              <EuiSelect
                data-test-subj="unmappedFieldsNamespaceSelect"
                fullWidth
                options={namespaceOptions}
                value={namespace}
                onChange={(event) => setNamespace(event.target.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="unmappedFieldsRunQueryButton"
              fill
              onClick={runScenario}
              isLoading={isLoading}
            >
              Run query
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>

        {scenarioDefinition ? (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              title={`unmapped_fields mode: ${scenarioDefinition.unmappedFieldsMode}`}
              iconType="info"
              size="s"
            >
              <p>{scenarioDefinition.description}</p>
            </EuiCallOut>
          </>
        ) : null}

        {error ? (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut title="Request failed" color="danger" iconType="error">
              <p>{error}</p>
            </EuiCallOut>
          </>
        ) : null}

        {response ? (
          <>
            <EuiSpacer size="l" />
            <EuiTitle size="s">
              <h2>Results</h2>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiBasicTable
              data-test-subj="unmappedFieldsResultsTable"
              items={tableItems}
              columns={tableColumns}
              tableLayout="auto"
            />
          </>
        ) : null}
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};
