/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import { writeFile } from 'fs/promises';
import {
  getCurrentVersionTypeRegistry,
} from '../kibana_migrator_test_kit';
import { SavedObjectsType } from '@kbn/core-saved-objects-server';

export const logFilePath = Path.join(__dirname, 'dot_kibana_split.test.log');

describe('this test', () => {
  it('generates types_8.8.0.json file', async () => {
    const registry = await getCurrentVersionTypeRegistry({ oss: false });
    const types = registry.getAllTypes();
    const getTypeData = (type: SavedObjectsType<any>) => {
      const typeMigrationVersions = Object.keys(type.migrations || {});
      return {
        index: type.indexPattern ?? '.kibana',
        coreMigrationVersion: '8.8.0',
        ...(typeMigrationVersions.length && { typeMigrationVersion: typeMigrationVersions.pop() }), // get the last version migration
        namespaceType: type.namespaceType,
      };
    }
    await writeFile(
      './types_8.8.0.json',
      JSON.stringify(Object.fromEntries(types.map((type) => [type.name, getTypeData(type)])), null, 2)
    );
  });
});
