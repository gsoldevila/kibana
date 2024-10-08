/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';
import { i18n, Translation } from '@kbn/i18n';
import type { Logger } from '@kbn/logging';
import type { IConfigService } from '@kbn/config';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type {
  InternalHttpServicePreboot,
  InternalHttpServiceSetup,
} from '@kbn/core-http-server-internal';
import type { I18nServiceSetup } from '@kbn/core-i18n-server';
import { config as i18nConfigDef, I18nConfigType } from './i18n_config';
import { getKibanaTranslationFiles } from './get_kibana_translation_files';
import { initTranslations } from './init_translations';
import { registerRoutes } from './routes';

export interface PrebootDeps {
  http: InternalHttpServicePreboot;
  pluginPaths: string[];
}

export interface SetupDeps {
  http: InternalHttpServiceSetup;
  pluginPaths: string[];
}

export interface InternalI18nServicePreboot {
  getTranslationHash(): string;
}

export class I18nService {
  private readonly log: Logger;
  private readonly configService: IConfigService;

  constructor(private readonly coreContext: CoreContext) {
    this.log = coreContext.logger.get('i18n');
    this.configService = coreContext.configService;
  }

  public async preboot({ pluginPaths, http }: PrebootDeps): Promise<InternalI18nServicePreboot> {
    const { locale, translationHash } = await this.initTranslations(pluginPaths);
    const { dist: isDist } = this.coreContext.env.packageInfo;
    http.registerRoutes('', (router) =>
      registerRoutes({ router, locale, isDist, translationHash })
    );

    return {
      getTranslationHash: () => translationHash,
    };
  }

  public async setup({ pluginPaths, http }: SetupDeps): Promise<I18nServiceSetup> {
    const { locale, translationFiles, translationHash } = await this.initTranslations(pluginPaths);

    const router = http.createRouter('');
    const { dist: isDist } = this.coreContext.env.packageInfo;
    registerRoutes({ router, locale, isDist, translationHash });

    return {
      getLocale: () => locale,
      getTranslationFiles: () => translationFiles,
      getTranslationHash: () => translationHash,
    };
  }

  private async initTranslations(pluginPaths: string[]) {
    const i18nConfig = await firstValueFrom(
      this.configService.atPath<I18nConfigType>(i18nConfigDef.path)
    );

    const locale = i18nConfig.locale;
    this.log.debug(`Using locale: ${locale}`);

    const translationFiles = await getKibanaTranslationFiles(locale, pluginPaths);

    this.log.debug(`Using translation files: [${translationFiles.join(', ')}]`);
    await initTranslations(locale, translationFiles);

    const translationHash = getTranslationHash(i18n.getTranslation());

    return { locale, translationFiles, translationHash };
  }
}

const getTranslationHash = (translations: Translation) => {
  const serialized = JSON.stringify(translations);
  return createHash('sha256').update(serialized).digest('hex').slice(0, 12);
};
