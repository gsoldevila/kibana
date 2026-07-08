/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Client } from '@elastic/elasticsearch';
import { createTestServers, type TestElasticsearchUtils } from '@kbn/core-test-helpers-kbn-server';
import {
  categoryFieldPath,
  countTermQuery,
  createTestIndex,
  deleteTestIndex,
  indexDocument,
  putCategoryMapping,
  refreshIndex,
} from './mapping_transition_helpers';

const itemTypeKey = 'unmapped-fields-item';

describe('Elasticsearch mapping transition for unmapped _source fields', () => {
  let esServer: TestElasticsearchUtils;
  let client: Client;

  beforeAll(async () => {
    const { startES } = createTestServers({
      adjustTimeout: (timeout) => jest.setTimeout(timeout),
    });
    esServer = await startES();
    client = esServer.es.getClient();
  });

  afterAll(async () => {
    await esServer?.stop();
  });

  describe('dynamic: false (saved object pattern)', () => {
    const index = 'test_unmapped_so_dynamic_false';

    beforeEach(async () => {
      await deleteTestIndex(client, index);
      await createTestIndex(client, index);
    });

    afterEach(async () => {
      await deleteTestIndex(client, index);
    });

    it('allows PUT mapping for a field that existed only in _source', async () => {
      await indexDocument(client, index, '1', { title: 'Alpha', category: 'alpha' });
      await indexDocument(client, index, '2', { title: 'Beta', category: 42 });

      await expect(putCategoryMapping(client, index)).resolves.toMatchObject({
        acknowledged: true,
      });
    });

    it('does not index pre-existing _source values until documents are re-ingested', async () => {
      await indexDocument(client, index, '1', { title: 'Alpha', category: 'alpha' });
      await indexDocument(client, index, '2', { title: 'Beta', category: 'beta' });

      await putCategoryMapping(client, index);
      await refreshIndex(client, index);

      expect(await countTermQuery(client, index, 'alpha')).toBe(0);
      expect(await countTermQuery(client, index, 'beta')).toBe(0);

      await indexDocument(client, index, '3', { title: 'Gamma', category: 'gamma' });
      expect(await countTermQuery(client, index, 'gamma')).toBe(1);
    });

    it('update_by_query succeeds but skips documents with incompatible _source types', async () => {
      await indexDocument(client, index, '1', { title: 'Alpha', category: 'alpha' });
      await indexDocument(client, index, '2', { title: 'Beta', category: 42 });

      await putCategoryMapping(client, index);
      await refreshIndex(client, index);

      const response = await client.updateByQuery({
        index,
        refresh: true,
        script: {
          lang: 'painless',
          source: `
            def item = ctx._source['${itemTypeKey}'];
            if (item == null || item.category == null) {
              ctx.op = 'noop';
              return;
            }
            if (item.category instanceof String) {
              item.category = 'normalized';
            } else {
              ctx.op = 'noop';
            }
          `,
        },
      });

      expect(response.failures).toHaveLength(0);
      expect(response.updated).toBe(1);

      const doc1 = await client.get({ index, id: '1' });
      const doc2 = await client.get({ index, id: '2' });

      expect(doc1._source).toMatchObject({
        [itemTypeKey]: { category: 'normalized' },
      });
      expect(doc2._source).toMatchObject({
        [itemTypeKey]: { category: 42 },
      });

      await indexDocument(client, index, '2', {
        title: 'Beta',
        category: 'forty-two',
      });
      expect(await countTermQuery(client, index, 'forty-two')).toBe(1);
    });
  });

  describe('dynamic: true (contrast — field was dynamically mapped)', () => {
    const index = 'test_unmapped_so_dynamic_true';

    beforeEach(async () => {
      await deleteTestIndex(client, index);
      await client.indices.create({ index });
    });

    afterEach(async () => {
      await deleteTestIndex(client, index);
    });

    it('rejects PUT mapping when existing documents conflict with the new type', async () => {
      await client.index({
        index,
        id: '1',
        document: { [categoryFieldPath]: 'alpha' },
        refresh: true,
      });
      await client.index({
        index,
        id: '2',
        document: { [categoryFieldPath]: 42 },
        refresh: true,
      });

      await expect(
        client.indices.putMapping({
          index,
          properties: {
            [categoryFieldPath]: { type: 'long' },
          },
        })
      ).rejects.toMatchObject({
        meta: {
          body: {
            error: {
              type: 'illegal_argument_exception',
            },
          },
        },
      });
    });
  });
});
