/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getAccessibilitySettings } from './accessibility';
import { getDateFormatSettings } from './date_formats';
import { getMiscUiSettings } from './misc';
import { getNotificationsSettings } from './notifications';
import { getThemeSettings } from './theme';
import { getCoreSettings, type GetCoreSettingsOptions } from '.';
import { getStateSettings } from './state';
import { getAnnouncementsSettings } from './announcements';

const defaultOptions: GetCoreSettingsOptions = {
  isDist: true,
  isThemeSwitcherEnabled: undefined,
};

describe('getCoreSettings', () => {
  it('should not have setting overlaps', () => {
    const coreSettingsLength = Object.keys(getCoreSettings(defaultOptions)).length;
    const summedLength = [
      getAccessibilitySettings(),
      getAnnouncementsSettings(),
      getDateFormatSettings(),
      getMiscUiSettings(),
      getNotificationsSettings(),
      getThemeSettings(defaultOptions),
      getStateSettings(),
    ].reduce((sum, settings) => sum + Object.keys(settings).length, 0);

    expect(coreSettingsLength).toBe(summedLength);
  });
});
