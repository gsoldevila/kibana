/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import nodeCrypto from '@elastic/node-crypto';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import type { SavedObjectsType } from '@kbn/core-saved-objects-server';
import { createModelVersionTestMigrator } from '@kbn/core-test-helpers-model-versions';
import { EncryptedSavedObjectsService } from '@kbn/encrypted-saved-objects-plugin/server/crypto';
import { alertMappings } from '../../common/saved_objects/rules/mappings';
import { ruleModelVersions } from './model_versions';
import { RULE_SAVED_OBJECT_TYPE, RuleAttributesIncludedInAAD, RuleAttributesToEncrypt } from '.';

const ruleType: SavedObjectsType = {
  name: RULE_SAVED_OBJECT_TYPE,
  hidden: true,
  namespaceType: 'multiple-isolated',
  mappings: alertMappings,
  modelVersions: ruleModelVersions,
};

const modelVersionNumbers = Object.keys(ruleModelVersions).map(Number);
const latestModelVersion = Math.max(...modelVersionNumbers);
const previousModelVersion = latestModelVersion - 1;

const descriptor = { type: RULE_SAVED_OBJECT_TYPE, id: 'a4a8b8c0-5f6e-4c2a-9d7b-0e1f2a3b4c5d' };
const apiKey = 'aWQ6c2VjcmV0';

const createRuleAttributes = () => ({
  name: 'ES|QL detection rule',
  enabled: true,
  consumer: 'siem',
  tags: ['detection'],
  alertTypeId: 'siem.esqlRule',
  apiKey,
  apiKeyOwner: 'elastic',
  apiKeyCreatedByUser: false,
  createdBy: 'elastic',
  updatedBy: 'elastic',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  muteAll: false,
  mutedInstanceIds: [],
  throttle: null,
  notifyWhen: null,
  revision: 0,
  running: false,
  schedule: { interval: '5m' },
  legacyId: null,
  scheduledTaskId: descriptor.id,
  snoozeSchedule: [],
  meta: { versionApiKeyLastmodified: '9.0.0' },
  actions: [],
  executionStatus: {
    status: 'ok',
    lastExecutionDate: '2026-11-24T00:00:00.000Z',
    error: null,
    warning: null,
  },
  params: {
    query: 'FROM logs-* | WHERE event.action == "logon"',
    language: 'esql',
    type: 'esql',
    from: 'now-6m',
    to: 'now',
    severity: 'low',
    riskScore: 21,
  },
  mapped_params: { risk_score: 21, severity: '20-low' },
  typeVersion: 1,
});

type RuleAttributes = ReturnType<typeof createRuleAttributes>;

const withMetaKey = (attributes: RuleAttributes) => ({
  ...attributes,
  meta: { ...attributes.meta, undeclaredKey: 'value' },
});

const withParams = (params: Record<string, unknown>) => (attributes: RuleAttributes) => ({
  ...attributes,
  params: { ...attributes.params, ...params },
});

describe('rule API key decryption across model versions', () => {
  let encryptedSavedObjectsService: EncryptedSavedObjectsService;

  beforeEach(() => {
    encryptedSavedObjectsService = new EncryptedSavedObjectsService({
      primaryCrypto: nodeCrypto({ encryptionKey: 'rule-downgrade-test-encryption-key' }),
      logger: loggingSystemMock.createLogger(),
    });
    encryptedSavedObjectsService.registerType({
      type: RULE_SAVED_OBJECT_TYPE,
      enforceRandomId: false,
      attributesToEncrypt: new Set(RuleAttributesToEncrypt),
      attributesToIncludeInAAD: new Set(RuleAttributesIncludedInAAD),
    });
  });

  const writeWithLatestAndReadWith = async (
    readerModelVersion: number,
    attributes: Record<string, unknown>
  ) => {
    const encrypted = await encryptedSavedObjectsService.encryptAttributes(descriptor, attributes);
    const { attributes: readAttributes } = createModelVersionTestMigrator({
      type: ruleType,
    }).migrate<Record<string, unknown>, Record<string, unknown>>({
      document: { ...descriptor, attributes: encrypted, references: [] },
      fromVersion: latestModelVersion,
      toVersion: readerModelVersion,
    });

    return encryptedSavedObjectsService.decryptAttributes(descriptor, readAttributes);
  };

  const cases: Array<[string, (attributes: RuleAttributes) => Record<string, unknown>]> = [
    ['only keys declared by the previous model version', (attributes) => attributes],
    ['a nested key the previous model version does not declare', withMetaKey],
    ['an object with numeric keys in params', withParams({ codes: { '0': 'a', '1': 'b' } })],
    ['a params key containing a backslash', withParams({ fieldMap: { 'C:\\Windows': true } })],
  ];

  describe('when a Kibana on the latest model version reads the rule', () => {
    it.each(cases)('decrypts the API key of a rule with %s', async (_, buildAttributes) => {
      await expect(
        writeWithLatestAndReadWith(latestModelVersion, buildAttributes(createRuleAttributes()))
      ).resolves.toMatchObject({ apiKey });
    });
  });

  describe('when a Kibana on the previous model version reads the rule', () => {
    it.each(cases)('decrypts the API key of a rule with %s', async (_, buildAttributes) => {
      await expect(
        writeWithLatestAndReadWith(previousModelVersion, buildAttributes(createRuleAttributes()))
      ).resolves.toMatchObject({ apiKey });
    });
  });
});
