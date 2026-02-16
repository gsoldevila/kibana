/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CPSServerPlugin } from './plugin';
import { coreMock, httpServerMock } from '@kbn/core/server/mocks';
import type { ProjectRoutingResolver } from '@kbn/core-elasticsearch-server';
import { registerRoutes } from './routes';

jest.mock('./routes', () => ({
  registerRoutes: jest.fn(),
}));

describe('CPSServerPlugin', () => {
  let plugin: CPSServerPlugin;
  let mockInitContext: ReturnType<typeof coreMock.createPluginInitializerContext>;
  let mockCoreSetup: ReturnType<typeof coreMock.createSetup>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCoreSetup = coreMock.createSetup();
  });

  describe('when cpsEnabled is true', () => {
    beforeEach(() => {
      mockInitContext = coreMock.createPluginInitializerContext({
        enabled: true,
        cpsEnabled: true,
      });
      (mockInitContext.env.packageInfo as any).buildFlavor = 'serverless';
      plugin = new CPSServerPlugin(mockInitContext);
    });

    it('should return true from getCpsEnabled', () => {
      const setup = plugin.setup(mockCoreSetup, {});
      expect(setup.getCpsEnabled()).toBe(true);
    });

    it('should register a projectRoutingResolver', () => {
      plugin.setup(mockCoreSetup, {});
      expect(mockCoreSetup.elasticsearch.registerProjectRoutingResolver).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('should resolve to the NPRE name based on the space ID from the spaces plugin', async () => {
      const mockGetSpaceId = jest.fn().mockReturnValue('my-space');
      const spacesSetup = { spacesService: { getSpaceId: mockGetSpaceId } } as any;

      plugin.setup(mockCoreSetup, { spaces: spacesSetup });

      const resolver: ProjectRoutingResolver =
        mockCoreSetup.elasticsearch.registerProjectRoutingResolver.mock.calls[0][0];
      const request = httpServerMock.createKibanaRequest();
      const result = await resolver(request);

      expect(mockGetSpaceId).toHaveBeenCalledWith(request);
      expect(result).toBe('kibana_space_my-space_default');
    });

    it('should fall back to the default space ID when spaces plugin is not available', async () => {
      plugin.setup(mockCoreSetup, {});

      const resolver: ProjectRoutingResolver =
        mockCoreSetup.elasticsearch.registerProjectRoutingResolver.mock.calls[0][0];
      const request = httpServerMock.createKibanaRequest();
      const result = await resolver(request);

      expect(result).toBe('kibana_space_default_default');
    });
  });

  describe('when cpsEnabled is false', () => {
    beforeEach(() => {
      mockInitContext = coreMock.createPluginInitializerContext({
        enabled: true,
        cpsEnabled: false,
      });
      (mockInitContext.env.packageInfo as any).buildFlavor = 'serverless';
      plugin = new CPSServerPlugin(mockInitContext);
    });

    it('should return false from getCpsEnabled', () => {
      const setup = plugin.setup(mockCoreSetup, {});
      expect(setup.getCpsEnabled()).toBe(false);
    });

    it('should not register a projectRoutingResolver', () => {
      plugin.setup(mockCoreSetup, {});
      expect(mockCoreSetup.elasticsearch.registerProjectRoutingResolver).not.toHaveBeenCalled();
    });
  });

  it('should register routes in serverless mode', () => {
    mockInitContext = coreMock.createPluginInitializerContext({
      enabled: true,
      cpsEnabled: false,
    });
    (mockInitContext.env.packageInfo as any).buildFlavor = 'serverless';
    plugin = new CPSServerPlugin(mockInitContext);
    plugin.setup(mockCoreSetup, {});
    expect(registerRoutes).toHaveBeenCalled();
  });
});
