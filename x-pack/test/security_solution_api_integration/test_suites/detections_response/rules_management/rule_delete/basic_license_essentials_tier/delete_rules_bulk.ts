/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import { DETECTION_ENGINE_RULES_BULK_DELETE } from '@kbn/security-solution-plugin/common/constants';
import { FtrProviderContext } from '../../../../../ftr_provider_context';
import {
  getSimpleRule,
  getSimpleRuleOutput,
  getSimpleRuleOutputWithoutRuleId,
  getSimpleRuleWithoutRuleId,
  removeServerGeneratedProperties,
  removeServerGeneratedPropertiesIncludingRuleId,
  updateUsername,
} from '../../../utils';
import {
  createRule,
  createAlertsIndex,
  deleteAllRules,
  deleteAllAlerts,
} from '../../../../../../common/utils/security_solution';

export default ({ getService }: FtrProviderContext): void => {
  const supertest = getService('supertest');
  const securitySolutionApi = getService('securitySolutionApi');
  const log = getService('log');
  const es = getService('es');
  const utils = getService('securitySolutionUtils');

  // TODO: https://github.com/elastic/kibana/issues/193184 Unskip and rewrite using the _bulk_action API endpoint
  describe.skip('@ess @serverless @skipInServerlessMKI delete_rules_bulk', () => {
    describe('deleting rules bulk using DELETE', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      it('should delete a single rule with a rule_id', async () => {
        await createRule(supertest, log, getSimpleRule());

        // delete the rule in bulk
        const { body } = await securitySolutionApi
          .bulkDeleteRules({ body: [{ rule_id: 'rule-1' }] })
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(body[0]);
        const expectedRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated rule_id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

        // delete that rule by its rule_id
        const { body } = await securitySolutionApi
          .bulkDeleteRules({ body: [{ rule_id: bodyWithCreatedRule.rule_id }] })
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRule());

        // delete that rule by its id
        const { body } = await securitySolutionApi
          .bulkDeleteRules({ body: [{ id: bodyWithCreatedRule.id }] })
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should return an error if the ruled_id does not exist when trying to delete a rule_id', async () => {
        const { body } = await securitySolutionApi
          .bulkDeleteRules({ body: [{ rule_id: 'fake_id' }] })
          .expect(200);

        expect(body).to.eql([
          {
            error: {
              message: 'rule_id: "fake_id" not found',
              status_code: 404,
            },
            rule_id: 'fake_id',
          },
        ]);
      });

      it('should return an error if the id does not exist when trying to delete an id', async () => {
        const { body } = await securitySolutionApi
          .bulkDeleteRules({ body: [{ id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612' }] })
          .expect(200);

        expect(body).to.eql([
          {
            error: {
              message: 'id: "c4e80a0d-e20f-4efc-84c1-08112da5a612" not found',
              status_code: 404,
            },
            id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612',
          },
        ]);
      });

      it('should delete a single rule using an auto generated rule_id but give an error if the second rule does not exist', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

        const { body } = await securitySolutionApi
          .bulkDeleteRules({
            body: [{ id: bodyWithCreatedRule.id }, { id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612' }],
          })
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect([bodyToCompare, body[1]]).to.eql([
          expectedRule,
          {
            id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612',
            error: {
              status_code: 404,
              message: 'id: "c4e80a0d-e20f-4efc-84c1-08112da5a612" not found',
            },
          },
        ]);
      });
    });

    // This is a repeat of the tests above but just using POST instead of DELETE
    describe('deleting rules bulk using POST', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
      });

      it('should delete a single rule with a rule_id', async () => {
        await createRule(supertest, log, getSimpleRule());

        // delete the rule in bulk
        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ rule_id: 'rule-1' }])
          .expect(200);

        const bodyToCompare = removeServerGeneratedProperties(body[0]);
        const expectedRule = updateUsername(getSimpleRuleOutput(), await utils.getUsername());

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated rule_id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

        // delete that rule by its rule_id
        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ rule_id: bodyWithCreatedRule.rule_id }])
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should delete a single rule using an auto generated id', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRule());

        // delete that rule by its id
        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ id: bodyWithCreatedRule.id }])
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect(bodyToCompare).to.eql(expectedRule);
      });

      it('should return an error if the ruled_id does not exist when trying to delete a rule_id', async () => {
        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ rule_id: 'fake_id' }])
          .expect(200);

        expect(body).to.eql([
          {
            error: {
              message: 'rule_id: "fake_id" not found',
              status_code: 404,
            },
            rule_id: 'fake_id',
          },
        ]);
      });

      it('should return an error if the id does not exist when trying to delete an id', async () => {
        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612' }])
          .expect(200);

        expect(body).to.eql([
          {
            error: {
              message: 'id: "c4e80a0d-e20f-4efc-84c1-08112da5a612" not found',
              status_code: 404,
            },
            id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612',
          },
        ]);
      });

      it('should delete a single rule using an auto generated rule_id but give an error if the second rule does not exist', async () => {
        const bodyWithCreatedRule = await createRule(supertest, log, getSimpleRuleWithoutRuleId());

        const { body } = await supertest
          .post(DETECTION_ENGINE_RULES_BULK_DELETE)
          .set('kbn-xsrf', 'true')
          .set('elastic-api-version', '2023-10-31')
          .send([{ id: bodyWithCreatedRule.id }, { id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612' }])
          .expect(200);

        const bodyToCompare = removeServerGeneratedPropertiesIncludingRuleId(body[0]);
        const expectedRule = updateUsername(
          getSimpleRuleOutputWithoutRuleId(),
          await utils.getUsername()
        );

        expect([bodyToCompare, body[1]]).to.eql([
          expectedRule,
          {
            id: 'c4e80a0d-e20f-4efc-84c1-08112da5a612',
            error: {
              status_code: 404,
              message: 'id: "c4e80a0d-e20f-4efc-84c1-08112da5a612" not found',
            },
          },
        ]);
      });
    });
  });
};
