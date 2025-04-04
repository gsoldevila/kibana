/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EntityAnalyticsPrivileges } from '../../api/entity_analytics';
import { getMissingRiskEnginePrivileges } from './privileges';

describe('getMissingRiskEnginePrivileges', () => {
  it('returns the missing cluster privileges', () => {
    const noClusterPrivileges: EntityAnalyticsPrivileges['privileges'] = {
      elasticsearch: {
        cluster: {
          manage_index_templates: false,
          manage_transform: false,
          manage_ingest_pipelines: false,
        },
        index: {
          'risk-score.risk-score-*': {
            read: true,
            write: true,
          },
        },
      },
    };

    const missingPrivileges = getMissingRiskEnginePrivileges(noClusterPrivileges);

    expect(missingPrivileges).toEqual({
      clusterPrivileges: ['manage_index_templates', 'manage_transform', 'manage_ingest_pipelines'],
      indexPrivileges: [],
    });
  });

  it('returns the missing index privileges', () => {
    const noIndexPrivileges: EntityAnalyticsPrivileges['privileges'] = {
      elasticsearch: {
        cluster: {
          manage_index_templates: true,
          manage_transform: true,
          manage_ingest_pipelines: true,
        },
        index: {
          'risk-score.risk-score-*': {
            read: false,
            write: false,
          },
        },
      },
    };

    const missingPrivileges = getMissingRiskEnginePrivileges(noIndexPrivileges);

    expect(missingPrivileges).toEqual({
      clusterPrivileges: [],
      indexPrivileges: [['risk-score.risk-score-*', ['read', 'write']]],
    });
  });
});
