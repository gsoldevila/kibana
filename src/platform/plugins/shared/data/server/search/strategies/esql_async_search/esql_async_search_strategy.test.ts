/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import { KbnServerError } from '@kbn/kibana-utils-plugin/server';
import { KbnSearchError } from '../../report_search_error';
import { errors } from '@elastic/elasticsearch';
import indexNotFoundException from '../../../../common/search/test_data/index_not_found_exception.json';
import xContentParseException from '../../../../common/search/test_data/x_content_parse_exception.json';
import type { SearchStrategyDependencies } from '../../types';
import { esqlAsyncSearchStrategyProvider } from './esql_async_search_strategy';
import { getMockSearchConfig } from '../../../../config.mock';

const mockAsyncResponse = {
  body: {
    id: 'foo',
    is_running: false,
    is_partial: false,
    columns: [],
    values: [],
  },
  headers: {
    'x-elasticsearch-async-id': 'foo',
    'x-elasticsearch-async-is-running': '?0',
  },
  meta: {
    request: {
      params: {},
    },
  },
};

describe('ES|QL async search strategy', () => {
  const mockAsyncQuery = jest.fn();
  const mockAsyncQueryGet = jest.fn();
  const mockAsyncQueryStop = jest.fn();
  const mockAsyncQueryDelete = jest.fn();
  const mockLogger: any = {
    debug: () => {},
    error: () => {},
  };
  const mockDeps = {
    uiSettingsClient: {
      get: jest.fn(),
    },
    esClient: {
      asCurrentUser: {
        esql: {
          asyncQuery: mockAsyncQuery,
          asyncQueryGet: mockAsyncQueryGet,
          asyncQueryStop: mockAsyncQueryStop,
          asyncQueryDelete: mockAsyncQueryDelete,
        },
      },
    },
  } as unknown as SearchStrategyDependencies;

  const mockSearchConfig = getMockSearchConfig({});

  beforeEach(() => {
    mockAsyncQuery.mockClear();
    mockAsyncQueryGet.mockClear();
    mockAsyncQueryStop.mockClear();
    mockAsyncQueryDelete.mockClear();
  });

  it('returns a strategy with `search and `cancel`', async () => {
    const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

    expect(typeof esSearch.search).toBe('function');
  });

  describe('search', () => {
    describe('no sessionId', () => {
      it('makes a POST request with params when no ID provided', async () => {
        mockAsyncQuery.mockResolvedValueOnce(mockAsyncResponse);

        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);
        const params = {
          query: 'from logs* | limit 10',
        };
        await esSearch
          .search(
            {
              id: undefined,
              params,
            },
            {},
            mockDeps
          )
          .toPromise();

        expect(mockAsyncQuery).toBeCalled();
        const [requestParams] = mockAsyncQuery.mock.calls[0];
        expect(requestParams.query).toEqual(params.query);
        expect(requestParams).toHaveProperty('keep_alive', '60000ms');
      });

      it('makes a GET request to async search with ID', async () => {
        mockAsyncQueryGet.mockResolvedValueOnce(mockAsyncResponse);

        const params = {
          query: 'from logs* | limit 10',
        };
        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

        await esSearch.search({ id: 'foo', params }, {}, mockDeps).toPromise();

        expect(mockAsyncQueryGet).toBeCalled();
        const [requestParams] = mockAsyncQueryGet.mock.calls[0];
        expect(requestParams.id).toBe('foo');
        expect(requestParams).toHaveProperty('wait_for_completion_timeout');
        expect(requestParams).toHaveProperty('keep_alive', '60000ms');
      });

      it('uses default keep_alive and wait_for_completion_timeout from config on GET requests', async () => {
        mockAsyncQueryGet.mockResolvedValueOnce(mockAsyncResponse);

        const params = {
          query: 'from logs* | limit 10',
        };
        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

        await esSearch.search({ id: 'foo', params }, {}, mockDeps).toPromise();

        expect(mockAsyncQueryGet).toBeCalled();
        const [requestParams] = mockAsyncQueryGet.mock.calls[0];
        expect(requestParams.id).toBe('foo');
        expect(requestParams).toHaveProperty('wait_for_completion_timeout');
        expect(requestParams).toHaveProperty('keep_alive');
      });

      it('sets transport options on POST requests', async () => {
        const transportOptions = { maxRetries: 1 };
        mockAsyncQuery.mockResolvedValueOnce(mockAsyncResponse);
        const params = { query: 'from logs' };
        const esSearch = esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

        await firstValueFrom(
          esSearch.search({ params }, { transport: transportOptions }, mockDeps)
        );

        expect(mockAsyncQuery).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            keep_alive: '60000ms',
            wait_for_completion_timeout: '100ms',
            keep_on_completion: false,
            query: 'from logs',
          }),
          expect.objectContaining({ maxRetries: 1, meta: true, signal: undefined })
        );
      });

      it('sets transport options on GET requests', async () => {
        mockAsyncQueryGet.mockResolvedValueOnce(mockAsyncResponse);
        const params = {
          query: 'from logs* | limit 10',
        };
        const esSearch = esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

        await firstValueFrom(
          esSearch.search({ id: 'foo', params }, { transport: { maxRetries: 1 } }, mockDeps)
        );

        expect(mockAsyncQueryGet).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            id: 'foo',
            keep_alive: '60000ms',
            wait_for_completion_timeout: '100ms',
          }),
          expect.objectContaining({ maxRetries: 1, meta: true, signal: undefined })
        );
      });

      it('sets wait_for_completion_timeout and keep_alive in the request', async () => {
        mockAsyncQuery.mockResolvedValueOnce(mockAsyncResponse);

        const params = {
          query: 'from logs* | limit 10',
        };
        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

        await esSearch.search({ params }, {}, mockDeps).toPromise();

        expect(mockAsyncQuery).toBeCalled();
        const [requestParams] = mockAsyncQuery.mock.calls[0];
        expect(requestParams).toHaveProperty('wait_for_completion_timeout');
        expect(requestParams).toHaveProperty('keep_alive');
      });

      it('calls /stop with the given ID when using options.retrieveResults: true', async () => {
        mockAsyncQueryStop.mockResolvedValueOnce({
          ...mockAsyncResponse,
          body: {
            columns: [],
            values: [],
          },
        });

        const id = 'FlBvQU5CS3BKVEdPcWM1V2lkYXNUbXccVmNhQl9wcWFRdG1WYzE4N2tsOFNNdzozNjMzOQ==';
        const params = { query: 'from logs* | limit 10' };
        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);
        await esSearch.search({ id, params }, { retrieveResults: true }, mockDeps).toPromise();

        expect(mockAsyncQueryStop).toBeCalled();
        const [requestParams] = mockAsyncQueryStop.mock.calls[0];
        expect(requestParams.id).toBe(id);
      });

      it('should delete when aborted', async () => {
        mockAsyncQuery.mockResolvedValueOnce({
          ...mockAsyncResponse,
          body: {
            ...mockAsyncResponse.body,
            is_running: true,
          },
        });

        const params = {
          query: 'from logs* | limit 10',
        };
        const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);
        const abortController = new AbortController();
        const abortSignal = abortController.signal;

        // Abort after an incomplete first response is returned
        setTimeout(() => abortController.abort(), 100);

        let err: KbnServerError | undefined;
        try {
          await esSearch.search({ params }, { abortSignal }, mockDeps).toPromise();
        } catch (e) {
          err = e;
        }
        expect(mockAsyncQuery).toBeCalled();
        expect(err).not.toBeUndefined();
        expect(mockAsyncQuery).toBeCalled();
      });
    });

    it('throws normalized error if ResponseError is thrown', async () => {
      const errResponse = new errors.ResponseError({
        body: indexNotFoundException,
        statusCode: 404,
        headers: {},
        warnings: [],
        meta: {} as any,
      });

      mockAsyncQuery.mockRejectedValue(errResponse);

      const params = {
        query: 'from logs* | limit 10',
      };
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      let err: KbnSearchError | undefined;
      try {
        await esSearch.search({ params }, {}, mockDeps).toPromise();
      } catch (e) {
        err = e;
      }
      expect(mockAsyncQuery).toBeCalled();
      expect(err).toBeInstanceOf(KbnSearchError);
      expect(err?.statusCode).toBe(404);
      expect(err?.message).toBe(errResponse.message);
      expect(err?.errBody).toEqual(indexNotFoundException);
    });

    it('throws normalized error if Error is thrown', async () => {
      const errResponse = new Error('not good');

      mockAsyncQuery.mockRejectedValue(errResponse);

      const params = {
        query: 'from logs* | limit 10',
      };
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      let err: KbnSearchError | undefined;
      try {
        await esSearch.search({ params }, {}, mockDeps).toPromise();
      } catch (e) {
        err = e;
      }
      expect(mockAsyncQuery).toBeCalled();
      expect(err).toBeInstanceOf(KbnSearchError);
      expect(err?.statusCode).toBe(500);
      expect(err?.message).toBe(errResponse.message);
      expect(err?.errBody).toBe(undefined);
    });
  });

  describe('cancel', () => {
    it('makes a DELETE request to async search with the provided ID', async () => {
      mockAsyncQueryDelete.mockResolvedValueOnce({ acknowledged: true });

      const id = 'some_id';
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      await esSearch.cancel!(id, {}, mockDeps);

      expect(mockAsyncQueryDelete).toBeCalled();
      const [requestParams] = mockAsyncQueryDelete.mock.calls[0];
      expect(requestParams.id).toBe(id);
    });

    it('throws normalized error on ResponseError', async () => {
      const errResponse = new errors.ResponseError({
        body: xContentParseException,
        statusCode: 400,
        headers: {},
        warnings: [],
        meta: {} as any,
      });
      mockAsyncQueryDelete.mockRejectedValue(errResponse);

      const id = 'some_id';
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      let err: KbnServerError | undefined;
      try {
        await esSearch.cancel!(id, {}, mockDeps);
      } catch (e) {
        err = e;
      }

      expect(mockAsyncQueryDelete).toBeCalled();
      expect(err).toBeInstanceOf(KbnServerError);
      expect(err?.statusCode).toBe(400);
      expect(err?.message).toBe(errResponse.message);
      expect(err?.errBody).toEqual(xContentParseException);
    });
  });

  describe('extend', () => {
    it('makes a GET request to async search with the provided ID and keepAlive', async () => {
      mockAsyncQueryGet.mockResolvedValueOnce(mockAsyncResponse);

      const id = 'some_other_id';
      const keepAlive = '1d';
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      await esSearch.extend!(id, keepAlive, {}, mockDeps);

      expect(mockAsyncQueryGet).toBeCalled();
      const [requestParams] = mockAsyncQueryGet.mock.calls[0];
      expect(requestParams).toEqual({ id, keep_alive: keepAlive });
    });

    it('throws normalized error on ElasticsearchClientError', async () => {
      const errResponse = new errors.ElasticsearchClientError('something is wrong with EsClient');
      mockAsyncQueryGet.mockRejectedValue(errResponse);

      const id = 'some_other_id';
      const keepAlive = '1d';
      const esSearch = await esqlAsyncSearchStrategyProvider(mockSearchConfig, mockLogger);

      let err: KbnServerError | undefined;
      try {
        await esSearch.extend!(id, keepAlive, {}, mockDeps);
      } catch (e) {
        err = e;
      }

      expect(mockAsyncQueryGet).toBeCalled();
      expect(err).toBeInstanceOf(KbnServerError);
      expect(err?.statusCode).toBe(500);
      expect(err?.message).toBe(errResponse.message);
      expect(err?.errBody).toBe(undefined);
    });
  });
});
