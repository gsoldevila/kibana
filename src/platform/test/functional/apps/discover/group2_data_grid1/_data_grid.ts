/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  describe('discover data grid tests', function describeDiscoverDataGrid() {
    const esArchiver = getService('esArchiver');
    const { common, timePicker, unifiedFieldList } = getPageObjects([
      'common',
      'timePicker',
      'unifiedFieldList',
    ]);
    const kibanaServer = getService('kibanaServer');
    const defaultSettings = { defaultIndex: 'logstash-*' };
    const testSubjects = getService('testSubjects');
    const security = getService('security');
    const retry = getService('retry');
    const browser = getService('browser');

    before(async function () {
      await security.testUser.setRoles(['kibana_admin', 'test_logstash_reader']);
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover.json'
      );
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('discover');
      await timePicker.setDefaultAbsoluteRange();
    });

    it('can add fields to the table', async function () {
      const getTitles = async () =>
        (await testSubjects.getVisibleText('dataGridHeader')).replace(/\s|\r?\n|\r/g, ' ');

      expect(await getTitles()).to.be('@timestamp Summary');

      await unifiedFieldList.clickFieldListItemAdd('bytes');
      expect(await getTitles()).to.be('@timestamp bytes');

      await unifiedFieldList.clickFieldListItemAdd('agent');
      expect(await getTitles()).to.be('@timestamp bytes agent');

      await unifiedFieldList.clickFieldListItemRemove('bytes');
      expect(await getTitles()).to.be('@timestamp agent');

      await unifiedFieldList.clickFieldListItemRemove('agent');
      expect(await getTitles()).to.be('@timestamp Summary');
    });

    const isVisible = async (selector: string) => {
      const element = await testSubjects.find(selector);
      const { x, y, width, height } = await element.getPosition();
      return browser.execute(
        (innerSelector, innerX, innerY) => {
          let currentElement = document.elementFromPoint(innerX, innerY);
          while (currentElement) {
            if (currentElement.matches(`[data-test-subj="${innerSelector}"]`)) {
              return true;
            }
            currentElement = currentElement.parentElement;
          }
          return false;
        },
        selector,
        x + width / 2,
        y + height / 2
      );
    };

    it('should hide elements beneath the table when in full screen mode regardless of their z-index', async () => {
      await retry.try(async () => {
        expect(await isVisible('discover-dataView-switch-link')).to.be(true);
        expect(await isVisible('unifiedHistogramResizableButton')).to.be(true);
      });
      await testSubjects.click('dataGridFullScreenButton');
      await retry.try(async () => {
        expect(await isVisible('discover-dataView-switch-link')).to.be(false);
        expect(await isVisible('unifiedHistogramResizableButton')).to.be(false);
      });
      await testSubjects.click('dataGridFullScreenButton');
      await retry.try(async () => {
        expect(await isVisible('discover-dataView-switch-link')).to.be(true);
        expect(await isVisible('unifiedHistogramResizableButton')).to.be(true);
      });
    });

    it('should show the the grid toolbar', async () => {
      await testSubjects.existOrFail('unifiedDataTableToolbar');
    });
  });
}
