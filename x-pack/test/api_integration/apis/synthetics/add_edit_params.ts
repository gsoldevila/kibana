/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { pick } from 'lodash';
import { SYNTHETICS_API_URLS } from '@kbn/synthetics-plugin/common/constants';
import expect from '@kbn/expect';
import { syntheticsParamType } from '@kbn/synthetics-plugin/common/types/saved_objects';
import { SyntheticsMonitorTestService } from './services/synthetics_monitor_test_service';
import { FtrProviderContext } from '../../ftr_provider_context';
import { PrivateLocationTestService } from './services/private_location_test_service';

function assertHas(actual: unknown, expected: object) {
  expect(pick(actual, Object.keys(expected))).eql(expected);
}

export default function ({ getService }: FtrProviderContext) {
  describe('AddEditParams', function () {
    this.tags('skipCloud');
    const supertestAPI = getService('supertest');
    const supertestWithoutAuth = getService('supertestWithoutAuth');

    const kServer = getService('kibanaServer');
    const testParam = {
      key: 'test',
      value: 'test',
    };
    const testPrivateLocations = new PrivateLocationTestService(getService);
    const monitorTestService = new SyntheticsMonitorTestService(getService);

    before(async () => {
      await testPrivateLocations.installSyntheticsPackage();

      await kServer.savedObjects.clean({ types: [syntheticsParamType] });
    });

    it('adds a test param', async () => {
      await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);

      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);

      assertHas(getResponse.body[0], testParam);
    });

    it('handles tags and description', async () => {
      const tagsAndDescription = {
        tags: ['a tag'],
        description: 'test description',
      };
      const testParam2 = {
        ...testParam,
        ...tagsAndDescription,
      };
      await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .send(testParam2)
        .expect(200);

      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);

      assertHas(getResponse.body[0], testParam2);
    });

    it('handles editing a param', async () => {
      const expectedUpdatedParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };

      await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);

      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const param = getResponse.body[0];
      assertHas(param, testParam);

      await supertestAPI
        .put(SYNTHETICS_API_URLS.PARAMS + '/' + param.id)
        .set('kbn-xsrf', 'true')
        .send({})
        .expect(400);

      await supertestAPI
        .put(SYNTHETICS_API_URLS.PARAMS + '/' + param.id)
        .set('kbn-xsrf', 'true')
        .send(expectedUpdatedParam)
        .expect(200);

      const updatedGetResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const actualUpdatedParam = updatedGetResponse.body[0];
      assertHas(actualUpdatedParam, expectedUpdatedParam);
    });

    it('handles partial editing a param', async () => {
      const newParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };

      const response = await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .send(newParam)
        .expect(200);
      const paramId = response.body.id;

      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS + '/' + paramId)
        .set('kbn-xsrf', 'true')
        .expect(200);
      assertHas(getResponse.body, newParam);

      await supertestAPI
        .put(SYNTHETICS_API_URLS.PARAMS + '/' + paramId)
        .set('kbn-xsrf', 'true')
        .send({
          key: 'testUpdated',
        })
        .expect(200);

      await supertestAPI
        .put(SYNTHETICS_API_URLS.PARAMS + '/' + paramId)
        .set('kbn-xsrf', 'true')
        .send({
          key: 'testUpdatedAgain',
          value: 'testUpdatedAgain',
        })
        .expect(200);

      const updatedGetResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS + '/' + paramId)
        .set('kbn-xsrf', 'true')
        .expect(200);
      assertHas(updatedGetResponse.body, {
        ...newParam,
        key: 'testUpdatedAgain',
        value: 'testUpdatedAgain',
      });
    });

    it('handles spaces', async () => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;

      await kServer.spaces.create({ id: SPACE_ID, name: SPACE_NAME });

      await supertestAPI
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);

      const getResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);

      expect(getResponse.body[0].namespaces).eql([SPACE_ID]);
      assertHas(getResponse.body[0], testParam);
    });

    it('handles editing a param in spaces', async () => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;

      await kServer.spaces.create({ id: SPACE_ID, name: SPACE_NAME });

      const expectedUpdatedParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };

      await supertestAPI
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);

      const getResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const param = getResponse.body[0];
      assertHas(param, testParam);

      await supertestAPI
        .put(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}/${param.id}`)
        .set('kbn-xsrf', 'true')
        .send(expectedUpdatedParam)
        .expect(200);

      const updatedGetResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const actualUpdatedParam = updatedGetResponse.body[0];
      assertHas(actualUpdatedParam, expectedUpdatedParam);
    });

    it('does not allow editing a param in created in one space in a different space', async () => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;
      const SPACE_ID_TWO = `test-space-${uuidv4()}-two`;
      const SPACE_NAME_TWO = `test-space-name ${uuidv4()} 2`;

      await kServer.spaces.create({ id: SPACE_ID, name: SPACE_NAME });
      await kServer.spaces.create({ id: SPACE_ID_TWO, name: SPACE_NAME_TWO });

      const updatedParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };

      await supertestAPI
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);

      const getResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const param = getResponse.body[0];
      assertHas(param, testParam);

      // space does exist so get request should be 200
      await supertestAPI
        .get(`/s/${SPACE_ID_TWO}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);

      await supertestAPI
        .put(`/s/${SPACE_ID_TWO}${SYNTHETICS_API_URLS.PARAMS}/${param.id}}`)
        .set('kbn-xsrf', 'true')
        .send(updatedParam)
        .expect(404);

      const updatedGetResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const actualUpdatedParam = updatedGetResponse.body[0];
      assertHas(actualUpdatedParam, testParam);
    });

    it('handles invalid spaces', async () => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;

      await kServer.spaces.create({ id: SPACE_ID, name: SPACE_NAME });

      await supertestAPI
        .post(`/s/doesnotexist${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(404);
    });

    it('handles editing with invalid spaces', async () => {
      const updatedParam = {
        key: 'testUpdated',
        value: 'testUpdated',
        tags: ['a tag'],
        description: 'test description',
      };

      await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .send(testParam)
        .expect(200);
      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);
      const param = getResponse.body[0];
      assertHas(param, testParam);

      await supertestAPI
        .put(`/s/doesnotexist${SYNTHETICS_API_URLS.PARAMS}/${param.id}}`)
        .set('kbn-xsrf', 'true')
        .send(updatedParam)
        .expect(404);
    });

    it('handles share across spaces', async () => {
      const SPACE_ID = `test-space-${uuidv4()}`;
      const SPACE_NAME = `test-space-name ${uuidv4()}`;

      await kServer.spaces.create({ id: SPACE_ID, name: SPACE_NAME });

      await supertestAPI
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .send({ ...testParam, share_across_spaces: true })
        .expect(200);

      const getResponse = await supertestAPI
        .get(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.PARAMS}`)
        .set('kbn-xsrf', 'true')
        .expect(200);

      expect(getResponse.body[0].namespaces).eql(['*']);
      assertHas(getResponse.body[0], testParam);
    });

    it('should not return values for non admin user', async () => {
      const { username, password } = await monitorTestService.addsNewSpace();
      const resp = await supertestWithoutAuth
        .get(`${SYNTHETICS_API_URLS.PARAMS}`)
        .auth(username, password)
        .set('kbn-xsrf', 'true')
        .send()
        .expect(200);

      const params = resp.body;
      expect(params.length).to.eql(6);
      params.forEach((param: any) => {
        expect(param.value).to.eql(undefined);
        expect(param.key).to.not.empty();
      });
    });

    it('should handle bulk deleting params', async () => {
      await kServer.savedObjects.clean({ types: [syntheticsParamType] });

      const params = [
        { key: 'param1', value: 'value1' },
        { key: 'param2', value: 'value2' },
        { key: 'param3', value: 'value3' },
      ];

      for (const param of params) {
        await supertestAPI
          .post(SYNTHETICS_API_URLS.PARAMS)
          .set('kbn-xsrf', 'true')
          .send(param)
          .expect(200);
      }

      const getResponse = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);

      expect(getResponse.body.length).to.eql(3);

      const ids = getResponse.body.map((param: any) => param.id);

      await supertestAPI
        .post(SYNTHETICS_API_URLS.PARAMS + '/_bulk_delete')
        .set('kbn-xsrf', 'true')
        .send({ ids })
        .expect(200);

      const getResponseAfterDelete = await supertestAPI
        .get(SYNTHETICS_API_URLS.PARAMS)
        .set('kbn-xsrf', 'true')
        .expect(200);

      expect(getResponseAfterDelete.body.length).to.eql(0);
    });
  });
}
