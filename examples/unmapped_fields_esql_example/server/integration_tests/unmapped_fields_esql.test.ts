/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { URL } from 'url';
import { esql } from '@elastic/esql';
import type {
  ISavedObjectsRepository,
  SavedObjectsEsqlResponse,
} from '@kbn/core-saved-objects-api-server';
import type { InternalCoreSetup } from '@kbn/core-lifecycle-server-internal';
import type { Root } from '@kbn/core-root-server-internal';
import {
  createRootWithCorePlugins,
  createTestServers,
  type TestElasticsearchUtils,
} from '@kbn/core-test-helpers-kbn-server';
import { EXAMPLE_SPACE_ID, UNMAPPED_FIELDS_ITEM_TYPE } from '../../common/constants';
import { unmappedFieldsItemType } from '../saved_objects';
import { defaultNamespaceItems, exampleSpaceItems } from '../saved_objects_data';
import { runQueryScenario } from '../query_scenarios';

const colTitle = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.title`);
const colCategory = esql.col(`${UNMAPPED_FIELDS_ITEM_TYPE}.category`);

const registerType = (setup: InternalCoreSetup) => {
  setup.savedObjects.registerType(unmappedFieldsItemType);
};

const getColumnIndex = (columns: SavedObjectsEsqlResponse['columns'], name: string): number =>
  columns.findIndex((column) => column.name === name);

describe('Unmapped fields ES|QL saved objects integration', () => {
  let root: Root;
  let esServer: TestElasticsearchUtils;
  let savedObjectsRepository: ISavedObjectsRepository;

  beforeAll(async () => {
    const { startES } = createTestServers({
      adjustTimeout: (t: number) => jest.setTimeout(t),
    });
    esServer = await startES();

    const { hostname: esHostname, port: esPort } = new URL(esServer.hosts[0]);

    root = createRootWithCorePlugins({
      elasticsearch: {
        hosts: [`http://${esHostname}:${esPort}`],
      },
      migrations: {
        skip: false,
      },
    });

    await root.preboot();
    const setup = await root.setup();
    registerType(setup);

    const start = await root.start();
    savedObjectsRepository = start.savedObjects.createInternalRepository();

    await savedObjectsRepository.bulkCreate([
      ...defaultNamespaceItems.map(({ id, ...attributes }) => ({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        id,
        attributes,
      })),
      ...exampleSpaceItems.map(({ id, ...attributes }) => ({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        id,
        attributes,
        initialNamespaces: [EXAMPLE_SPACE_ID],
      })),
    ]);
  });

  afterAll(async () => {
    await root?.shutdown();
    await esServer?.stop();
  });

  it('queries mapped fields without setOptions', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'filter_mapped_title',
      'DEFAULT',
      'default'
    );

    expect(result.values).toHaveLength(1);
    const titleIdx = getColumnIndex(result.columns, `${UNMAPPED_FIELDS_ITEM_TYPE}.title`);
    expect(result.values[0][titleIdx]).toBe('Alpha dashboard');
  });

  it('filters on unmapped category with SET unmapped_fields = "LOAD"', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'filter_unmapped_category',
      'LOAD',
      'default'
    );

    expect(result.values).toHaveLength(2);
    const categoryIdx = getColumnIndex(result.columns, `${UNMAPPED_FIELDS_ITEM_TYPE}.category`);
    expect(result.values.every((row) => row[categoryIdx] === 'alpha')).toBe(true);
  });

  it('sorts on unmapped score with SET unmapped_fields = "LOAD"', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'sort_unmapped_score',
      'LOAD',
      'default'
    );

    const scoreIdx = getColumnIndex(result.columns, `${UNMAPPED_FIELDS_ITEM_TYPE}.score`);
    const scores = result.values.map((row) => row[scoreIdx]);
    expect(scores).toEqual(['10', '20', '30']);
  });

  it('aggregates by unmapped category with SET unmapped_fields = "LOAD"', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'stats_by_unmapped_category',
      'LOAD',
      'default'
    );

    const categoryIdx = getColumnIndex(result.columns, `${UNMAPPED_FIELDS_ITEM_TYPE}.category`);
    const countIdx = getColumnIndex(result.columns, 'doc_count');
    const rowsByCategory = Object.fromEntries(
      result.values.map((row) => [row[categoryIdx], row[countIdx]])
    );

    expect(rowsByCategory.alpha).toBe(2);
    expect(rowsByCategory.beta).toBe(1);
  });

  it('keeps unmapped columns with SET unmapped_fields = "LOAD"', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'keep_unmapped_fields',
      'LOAD',
      'default'
    );

    expect(result.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        `${UNMAPPED_FIELDS_ITEM_TYPE}.title`,
        `${UNMAPPED_FIELDS_ITEM_TYPE}.category`,
        `${UNMAPPED_FIELDS_ITEM_TYPE}.score`,
        `${UNMAPPED_FIELDS_ITEM_TYPE}.notes`,
      ])
    );
    expect(result.values).toHaveLength(3);
  });

  it('evaluates TO_INTEGER on unmapped score with SET unmapped_fields = "LOAD"', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'eval_unmapped_score',
      'LOAD',
      'default'
    );

    const numericScoreIdx = getColumnIndex(result.columns, 'numeric_score');
    const numericScores = result.values.map((row) => row[numericScoreIdx]);
    expect(numericScores).toEqual([30, 20, 10]);
  });

  it('returns _source metadata without referencing unmapped fields in the pipeline', async () => {
    const result = await runQueryScenario(
      savedObjectsRepository,
      'metadata_source',
      'DEFAULT',
      'default'
    );

    const sourceIdx = getColumnIndex(result.columns, '_source');
    const sources = result.values.map(
      (row) => row[sourceIdx] as unknown as Record<string, unknown>
    );
    const categories = sources.map(
      (source) =>
        (source[UNMAPPED_FIELDS_ITEM_TYPE] as Record<string, unknown> | undefined)?.category
    );

    expect(categories.sort()).toEqual(['alpha', 'alpha', 'beta']);
  });

  it('scopes unmapped field queries to the requested namespace', async () => {
    const defaultResult = await runQueryScenario(
      savedObjectsRepository,
      'filter_unmapped_category',
      'LOAD',
      'default'
    );
    expect(defaultResult.values).toHaveLength(2);

    const exampleSpaceResult = await savedObjectsRepository.esql({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      namespaces: [EXAMPLE_SPACE_ID],
      setOptions: { unmapped_fields: 'LOAD' },
      pipeline: esql`
        WHERE ${colCategory} == "space-a"
        | KEEP ${colTitle}, ${colCategory}
        | LIMIT 10
      `,
    });
    expect(exampleSpaceResult.values).toHaveLength(1);

    const categoryIdx = getColumnIndex(
      exampleSpaceResult.columns,
      `${UNMAPPED_FIELDS_ITEM_TYPE}.category`
    );
    expect(exampleSpaceResult.values[0][categoryIdx]).toBe('space-a');
  });

  it('prepends SET unmapped_fields before the auto-generated FROM clause', async () => {
    await savedObjectsRepository.esql({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      namespaces: ['default'],
      setOptions: { unmapped_fields: 'LOAD' },
      pipeline: esql`KEEP ${colTitle} | LIMIT 1`,
    });

    // Indirect assertion via successful query — unit tests in core verify query shape.
    const result = await savedObjectsRepository.esql({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      namespaces: ['default'],
      setOptions: { unmapped_fields: 'LOAD' },
      pipeline: esql`WHERE ${colCategory} == "alpha" | KEEP ${colTitle}, ${colCategory} | LIMIT 10`,
    });
    expect(result.values.length).toBeGreaterThan(0);
  });

  it('fails when referencing unmapped fields with DEFAULT mode', async () => {
    await expect(
      savedObjectsRepository.esql({
        type: UNMAPPED_FIELDS_ITEM_TYPE,
        namespaces: ['default'],
        pipeline: esql`WHERE ${colCategory} == "alpha" | LIMIT 10`,
      })
    ).rejects.toThrow();
  });

  it('returns empty rows for unmapped field filters with NULLIFY mode', async () => {
    const result = await savedObjectsRepository.esql({
      type: UNMAPPED_FIELDS_ITEM_TYPE,
      namespaces: ['default'],
      setOptions: { unmapped_fields: 'NULLIFY' },
      pipeline: esql`WHERE ${colCategory} == "alpha" | KEEP ${colTitle}, ${colCategory} | LIMIT 10`,
    });

    expect(result.values).toHaveLength(0);
  });
});
