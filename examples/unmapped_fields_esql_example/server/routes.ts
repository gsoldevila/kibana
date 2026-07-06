/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AuthzDisabled } from '@kbn/core-security-server';
import type { IRouter, Logger, SavedObjectsServiceStart } from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import { schema } from '@kbn/config-schema';
import { isResponseError } from '@kbn/es-errors';
import { EXAMPLE_SPACE_ID, QUERY_SCENARIOS, type QueryScenario, type UnmappedFieldsMode } from '../common/constants';
import { ensureExampleSpace } from './ensure_example_space';
import { setupSeedData } from './saved_objects_data';
import { runQueryScenario } from './query_scenarios';

const queryScenarioSchema = schema.string({
  validate: (value) => {
    if (!QUERY_SCENARIOS.some(({ id }) => id === value)) {
      return 'invalid query scenario';
    }
  },
});

const unmappedFieldsModeSchema = schema.oneOf([
  schema.literal('LOAD'),
  schema.literal('NULLIFY'),
  schema.literal('DEFAULT'),
]);

export interface UnmappedFieldsEsqlRouteDependencies {
  router: IRouter;
  logger: Logger;
  getSavedObjectsStart: () => SavedObjectsServiceStart | undefined;
  getSpacesStart: () => SpacesPluginStart | undefined;
}

async function prepareExampleData(
  req: KibanaRequest,
  getSavedObjectsStart: () => SavedObjectsServiceStart | undefined,
  getSpacesStart: () => SpacesPluginStart | undefined
) {
  const savedObjectsStart = getSavedObjectsStart();
  const spacesStart = getSpacesStart();
  if (!savedObjectsStart) {
    throw new Error('Saved Objects service is not started yet');
  }
  if (!spacesStart) {
    throw new Error('Spaces plugin is required for the unmapped fields ES|QL example');
  }

  await ensureExampleSpace(spacesStart.spacesService.createSpacesClient(req));

  // Seed with the internal client so setup succeeds for any logged-in user. The request-scoped
  // client enforces saved object delete privileges, which demo users typically lack.
  const internalClient = savedObjectsStart.getUnsafeInternalClient();
  const defaultSpaceClient = internalClient;
  const exampleSpaceClient = internalClient.asScopedToNamespace(EXAMPLE_SPACE_ID);

  await setupSeedData(defaultSpaceClient, exampleSpaceClient);
}

export function registerUnmappedFieldsEsqlRoutes({
  router,
  logger,
  getSavedObjectsStart,
  getSpacesStart,
}: UnmappedFieldsEsqlRouteDependencies) {
  router.versioned
    .post({
      path: '/api/unmapped_fields_esql_example/_setup',
      summary: 'Seed saved objects for the unmapped fields ES|QL example',
      access: 'public',
      security: {
        authz: AuthzDisabled.fromReason('This route is an example'),
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: false,
      },
      async (ctx, req, res) => {
        try {
          await prepareExampleData(req, getSavedObjectsStart, getSpacesStart);
          return res.ok({ body: { success: true } });
        } catch (error) {
          logger.error(error);
          throw error;
        }
      }
    );

  router.versioned
    .post({
      path: '/api/unmapped_fields_esql_example/_query',
      summary: 'Run an ES|QL query scenario against saved objects',
      access: 'public',
      security: {
        authz: AuthzDisabled.fromReason('This route is an example'),
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: {
          request: {
            body: schema.object({
              scenario: queryScenarioSchema,
              unmappedFieldsMode: unmappedFieldsModeSchema,
              namespace: schema.string({ defaultValue: 'default' }),
            }),
          },
        },
      },
      async (ctx, req, res) => {
        const { scenario, unmappedFieldsMode, namespace } = req.body as {
          scenario: QueryScenario;
          unmappedFieldsMode: UnmappedFieldsMode;
          namespace: string;
        };

        try {
          const core = await ctx.core;
          const result = await runQueryScenario(
            core.savedObjects.client,
            scenario,
            unmappedFieldsMode,
            namespace
          );
          return res.ok({
            body: {
              scenario,
              unmappedFieldsMode,
              namespace,
              columns: result.columns,
              values: result.values,
            },
          });
        } catch (error) {
          if (isResponseError(error)) {
            logger.error(JSON.stringify(error.meta.body, null, 2));
          } else {
            logger.error(error);
          }
          throw error;
        }
      }
    );

  router.versioned
    .get({
      path: '/api/unmapped_fields_esql_example/_scenarios',
      summary: 'List available ES|QL query scenarios',
      access: 'public',
      security: {
        authz: AuthzDisabled.fromReason('This route is an example'),
      },
    })
    .addVersion(
      {
        version: '2023-10-31',
        validate: false,
      },
      async (_ctx, _req, res) => {
        return res.ok({ body: { scenarios: QUERY_SCENARIOS } });
      }
    );
}
