/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiTitle, EuiSpacer } from '@elastic/eui';
import { DistributionBar as DistributionBarComponent } from '..';

const mockStatsFindings = [
  {
    key: 'passed',
    count: 90,
    color: 'green',
    label: 'Passed',
  },
  {
    key: 'failed',
    count: 10,
    color: 'red',
    label: <>{'Failed'}</>,
  },
];

const mockStatsAlerts = [
  {
    key: 'low',
    count: 1000,
    color: 'green',
  },
  {
    key: 'medium',
    count: 800,
    color: 'gold',
  },
  {
    key: 'high',
    count: 300,
    color: 'orange',
  },
  {
    key: 'critical',
    count: 50,
    color: 'red',
  },
];

export default {
  title: 'DistributionBar',
  description: 'Distribution Bar',
};

export const DistributionBar = () => {
  return [
    <React.Fragment key={'findings'}>
      <EuiTitle size={'xs'}>
        <h4>{'Findings'}</h4>
      </EuiTitle>
      <EuiSpacer size={'s'} />
      <DistributionBarComponent stats={mockStatsFindings} />
      <EuiSpacer size={'m'} />
    </React.Fragment>,
    <React.Fragment key={'alerts'}>
      <EuiTitle size={'xs'}>
        <h4>{'Alerts'}</h4>
      </EuiTitle>
      <EuiSpacer size={'s'} />
      <DistributionBarComponent stats={mockStatsAlerts} />
      <EuiSpacer size={'m'} />
    </React.Fragment>,
    <React.Fragment key={'hideLastTooltip'}>
      <EuiTitle size={'xs'}>
        <h4>{'Hide last tooltip'}</h4>
      </EuiTitle>
      <EuiSpacer size={'s'} />
      <DistributionBarComponent stats={mockStatsAlerts} hideLastTooltip />
      <EuiSpacer size={'m'} />
    </React.Fragment>,
    <React.Fragment key={'empty'}>
      <EuiTitle size={'xs'}>
        <h4>{'Empty state'}</h4>
      </EuiTitle>
      <EuiSpacer size={'s'} />
      <DistributionBarComponent stats={[]} />
    </React.Fragment>,
  ];
};
