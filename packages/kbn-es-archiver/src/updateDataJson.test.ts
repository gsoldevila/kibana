/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { resolve } from 'path';
import type { Readable } from 'stream';
import { createReadStream, createWriteStream } from 'fs';
import { rename, rm } from 'fs/promises';
import {
  concatStreamProviders,
  createFilterStream,
  createMapStream,
  createPromiseFromStreams,
} from '@kbn/utils';
import { createParseArchiveStreams, isGzip, prioritizeMappings, readDirectory } from './lib';
import TYPE_REGISTRY from './types_8.8.0.json';

const ES_ARCHIVES: string[] = [
  'test/functional/fixtures/es_archiver/saved_objects_management/hidden_from_http_apis',
  'x-pack/test/functional/es_archives/action_task_params',
  'x-pack/test/functional/es_archives/actions',
  'x-pack/test/functional/es_archives/alerting/8_2_0',
  'x-pack/test/functional/es_archives/alerts',
  'x-pack/test/functional/es_archives/alerts_legacy/rules',
  'x-pack/test/functional/es_archives/alerts_legacy/tasks',
  'x-pack/test/functional/es_archives/canvas/default',
  'x-pack/test/functional/es_archives/canvas/reports',
  'x-pack/test/functional/es_archives/cases/default',
  'x-pack/test/functional/es_archives/cases/migrations/7.11.1',
  'x-pack/test/functional/es_archives/cases/migrations/7.13.2',
  'x-pack/test/functional/es_archives/cases/migrations/7.13_user_actions',
  'x-pack/test/functional/es_archives/cases/migrations/7.16.0_space',
  'x-pack/test/functional/es_archives/cases/migrations/8.8.0',
  'x-pack/test/functional/es_archives/dashboard/async_search',
  'x-pack/test/functional/es_archives/data/search_sessions',
  'x-pack/test/functional/es_archives/endpoint/telemetry/agent_only',
  'x-pack/test/functional/es_archives/endpoint/telemetry/cloned_endpoint_different_states',
  'x-pack/test/functional/es_archives/endpoint/telemetry/cloned_endpoint_installed',
  'x-pack/test/functional/es_archives/endpoint/telemetry/cloned_endpoint_uninstalled',
  'x-pack/test/functional/es_archives/endpoint/telemetry/endpoint_malware_disabled',
  'x-pack/test/functional/es_archives/endpoint/telemetry/endpoint_malware_enabled',
  'x-pack/test/functional/es_archives/endpoint/telemetry/endpoint_uninstalled',
  'x-pack/test/functional/es_archives/event_log_legacy_ids',
  'x-pack/test/functional/es_archives/event_log_multiple_indicies',
  'x-pack/test/functional/es_archives/event_log_telemetry',
  'x-pack/test/functional/es_archives/fleet/agents',
  'x-pack/test/functional/es_archives/lists',
  'x-pack/test/functional/es_archives/pre_calculated_histogram',
  'x-pack/test/functional/es_archives/rules_scheduled_task_id/rules',
  'x-pack/test/functional/es_archives/rules_scheduled_task_id/tasks',
  'x-pack/test/functional/es_archives/security_solution/import_rule_connector',
  'x-pack/test/functional/es_archives/security_solution/legacy_actions',
  'x-pack/test/functional/es_archives/security_solution/migrations',
  'x-pack/test/functional/es_archives/security_solution/resolve_read_rules/7_14',
  'x-pack/test/functional/es_archives/security_solution/timelines/7.15.0',
  'x-pack/test/functional/es_archives/security_solution/timelines/7.15.0_space',
  'x-pack/test/functional/es_archives/task_manager_removed_types',
  'x-pack/test/functional/es_archives/task_manager_tasks',
  'x-pack/test/spaces_api_integration/common/fixtures/es_archiver/saved_objects/spaces',
];

export const pipeline = (...streams: Readable[]) =>
  streams.reduce((source, dest) =>
    source.once('error', (error) => dest.destroy(error)).pipe(dest as any)
  );

const KNOWN_SAVED_OBJECT_TYPES: string[] = Object.keys(TYPE_REGISTRY);

export const isKnownSavedObjectType = (type: string) => KNOWN_SAVED_OBJECT_TYPES.includes(type);

export const filterDocument = (original: any): any => {
  return original.type.endsWith('doc') && original.value?.id !== 'space:default';
};

export const processDocument = (original: any): any => {
  const value = original.value;

  if (
    !original.type?.endsWith('doc') ||
    !value?.index?.startsWith('.kibana') ||
    !isKnownSavedObjectType(value.source?.type)
  ) {
    return original;
  }

  const { source } = value;
  const { type: originalType } = source;
  const {
    index,
    coreMigrationVersion,
    typeMigrationVersion: lastTypeMigrationVersion,
    namespaceType,
  } = (TYPE_REGISTRY as any)[originalType];

  delete value.type; // this property is incorrect; useless at this level
  value.index = index; // override index (account for .kibana split)
  const migrationVersion = source.migrationVersion?.[originalType];
  delete source.migrationVersion; // replaced by typeMigrationVersion

  if (namespaceType !== 'agnostic') {
    // update namespaces property
    source.namespaces = source.namespaces
      ? source.namespaces
      : source.namespace
      ? [source.namespace]
      : ['default'];
  }

  source.coreMigrationVersion = source.coreMigrationVersion ?? coreMigrationVersion;
  source.typeMigrationVersion =
    source.typeMigrationVersion ?? migrationVersion ?? lastTypeMigrationVersion;

  return original;
};

describe('data.json updater', () => {
  it.each(ES_ARCHIVES)('can update SO in data.json', async (esArchive) => {
    const files = prioritizeMappings(await readDirectory(esArchive));
    // a single stream that emits records from all archive files, in
    // order, so that createIndexStream can track the state of indexes
    // across archives and properly skip docs from existing indexes
    const recordStream = concatStreamProviders(
      files.map((filename) => () => {
        return pipeline(
          createReadStream(resolve(esArchive, filename)),
          ...createParseArchiveStreams({ gzip: isGzip(filename) }),
          createFilterStream((original) => filterDocument(original)),
          createMapStream((original) => {
            const processed = processDocument(original);
            return JSON.stringify(processed, null, 2) + '\n\n';
          })
        );
      }),
      { objectMode: true }
    );

    await createPromiseFromStreams([recordStream, createWriteStream(`${esArchive}/data.ndjson`)]);
    await rename(`${esArchive}/data.ndjson`, `${esArchive}/data.json`);
    try {
      await rm(`${esArchive}/mappings.json`);
    } catch(err) {
      // allow unexisting
    }

    try {
      await rm(`${esArchive}/mappings.json.gz`);
    } catch(err) {
      // allow unexisting
    }
  });
});
