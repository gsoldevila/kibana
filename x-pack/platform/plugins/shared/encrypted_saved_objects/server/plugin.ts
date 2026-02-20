/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import nodeCrypto, { type Crypto } from '@elastic/node-crypto';
import { createHash } from 'crypto';

import type {
  CoreSetup,
  ISavedObjectTypeRegistry,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import type { SecurityPluginSetup } from '@kbn/security-plugin/server';

import type { ConfigType } from './config';
import {
  type CreateEncryptedSavedObjectsMigrationFn,
  getCreateMigration,
} from './create_migration';
import { type CreateEsoModelVersionFn, getCreateEsoModelVersion } from './create_model_version';
import type { AttributeToEncrypt, EncryptedSavedObjectTypeRegistration } from './crypto';
import {
  EncryptedSavedObjectsService,
  EncryptionError,
  EncryptionKeyRotationService,
} from './crypto';
import { defineRoutes } from './routes';
import type { ClientInstanciator } from './saved_objects';
import { SavedObjectsEncryptionExtension, setupSavedObjects } from './saved_objects';

export interface PluginsSetup {
  security?: SecurityPluginSetup;
}

export interface EncryptedSavedObjectsPluginSetup {
  /**
   * Indicates if Saved Object encryption is possible. Requires an encryption key to be explicitly set via `xpack.encryptedSavedObjects.encryptionKey`.
   */
  canEncrypt: boolean;
  registerType: (typeRegistration: EncryptedSavedObjectTypeRegistration) => void;
  createMigration: CreateEncryptedSavedObjectsMigrationFn;
  createModelVersion: CreateEsoModelVersionFn;
}

export interface EncryptedSavedObjectsPluginStart {
  isEncryptionError: (error: Error) => boolean;
  getClient: ClientInstanciator;
  /**
   * This function is exposed for Core migration testing purposes only.
   */
  __testCreateDangerousExtension: (
    typeRegistry: ISavedObjectTypeRegistry,
    typeRegistrationOverrides?: EncryptedSavedObjectTypeRegistration[]
  ) => SavedObjectsEncryptionExtension;
}

/**
 * Transforms an EncryptedSavedObjectTypeRegistration so that all attributes in
 * `attributesToEncrypt` have `dangerouslyExposeValue: true`. This is only used
 * for the test-only extension where decrypted values must be readable.
 */
const dangerouslyExposeAttributes = (
  registration: EncryptedSavedObjectTypeRegistration
): EncryptedSavedObjectTypeRegistration => {
  const exposedAttributes = new Set<string | AttributeToEncrypt>(
    [...registration.attributesToEncrypt].map((attr) => {
      const key = typeof attr === 'string' ? attr : attr.key;
      return { key, dangerouslyExposeValue: true };
    })
  );
  return {
    ...registration,
    attributesToEncrypt: exposedAttributes,
  };
};

/**
 * Represents EncryptedSavedObjects Plugin instance that will be managed by the Kibana plugin system.
 */
export class EncryptedSavedObjectsPlugin
  implements
    Plugin<EncryptedSavedObjectsPluginSetup, EncryptedSavedObjectsPluginStart, PluginsSetup>
{
  private readonly logger: Logger;
  private savedObjectsSetup!: ClientInstanciator;
  private primaryCrypto?: Crypto;
  private decryptionOnlyCryptos: Crypto[] = [];
  private typeRegistrations: EncryptedSavedObjectTypeRegistration[] = [];

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = this.initializerContext.logger.get();
  }

  public setup(core: CoreSetup, _deps: PluginsSetup): EncryptedSavedObjectsPluginSetup {
    const config = this.initializerContext.config.get<ConfigType>();
    const canEncrypt = config.encryptionKey !== undefined;
    if (!canEncrypt) {
      this.logger.warn(
        'Saved objects encryption key is not set. This will severely limit Kibana functionality. ' +
          'Please set xpack.encryptedSavedObjects.encryptionKey in the kibana.yml or use the bin/kibana-encryption-keys command.'
      );
    } else {
      const hashedEncryptionKey = createHash('sha3-256')
        .update(config.encryptionKey)
        .digest('base64');

      this.logger.info(
        `Hashed 'xpack.encryptedSavedObjects.encryptionKey' for this instance: ${hashedEncryptionKey}`
      );
    }

    const readOnlyKeys = config.keyRotation?.decryptionOnlyKeys;

    if (readOnlyKeys !== undefined && readOnlyKeys.length > 0) {
      const readOnlyKeyHashses = readOnlyKeys.map((readOnlyKey, i) =>
        createHash('sha3-256').update(readOnlyKey).digest('base64')
      );

      this.logger.info(
        `Hashed 'xpack.encryptedSavedObjects.keyRotation.decryptionOnlyKeys' for this instance: ${readOnlyKeyHashses}`
      );
    }

    const primaryCrypto = config.encryptionKey
      ? nodeCrypto({ encryptionKey: config.encryptionKey })
      : undefined;
    const decryptionOnlyCryptos = config.keyRotation.decryptionOnlyKeys.map((decryptionKey) =>
      nodeCrypto({ encryptionKey: decryptionKey })
    );

    this.primaryCrypto = primaryCrypto;
    this.decryptionOnlyCryptos = decryptionOnlyCryptos;

    const service = Object.freeze(
      new EncryptedSavedObjectsService({
        primaryCrypto,
        decryptionOnlyCryptos,
        logger: this.logger,
      })
    );

    this.savedObjectsSetup = setupSavedObjects({
      service,
      savedObjects: core.savedObjects,
      getStartServices: core.getStartServices,
      logger: this.logger,
    });

    // Expose the key rotation route for both stateful and serverless environments
    // The endpoint requires admin privileges, and is internal only in serverless
    defineRoutes({
      router: core.http.createRouter(),
      logger: this.initializerContext.logger.get('routes'),
      encryptionKeyRotationService: Object.freeze(
        new EncryptionKeyRotationService({
          logger: this.logger.get('key-rotation-service'),
          service,
          getStartServices: core.getStartServices,
        })
      ),
      config,
      buildFlavor: this.initializerContext.env.packageInfo.buildFlavor,
    });

    return {
      canEncrypt,
      registerType: (typeRegistration: EncryptedSavedObjectTypeRegistration) => {
        this.typeRegistrations.push(typeRegistration);
        service.registerType(typeRegistration);
      },
      createMigration: getCreateMigration(
        service,
        (typeRegistration: EncryptedSavedObjectTypeRegistration) => {
          const serviceForMigration = new EncryptedSavedObjectsService({
            primaryCrypto,
            decryptionOnlyCryptos,
            logger: this.logger,
          });
          serviceForMigration.registerType(typeRegistration);
          return serviceForMigration;
        }
      ),
      createModelVersion: getCreateEsoModelVersion(
        service,
        (typeRegistration: EncryptedSavedObjectTypeRegistration) => {
          const serviceForMigration = new EncryptedSavedObjectsService({
            primaryCrypto,
            decryptionOnlyCryptos,
            logger: this.logger,
          });
          serviceForMigration.registerType(typeRegistration);
          return serviceForMigration;
        }
      ),
    };
  }

  public start() {
    this.logger.debug('Starting plugin');
    return {
      isEncryptionError: (error: Error) => error instanceof EncryptionError,
      getClient: (options = {}) => this.savedObjectsSetup(options),
      __testCreateDangerousExtension: (
        typeRegistry: ISavedObjectTypeRegistry,
        typeRegistrationOverrides?: EncryptedSavedObjectTypeRegistration[]
      ): SavedObjectsEncryptionExtension => {
        const testService = new EncryptedSavedObjectsService({
          primaryCrypto: this.primaryCrypto,
          decryptionOnlyCryptos: this.decryptionOnlyCryptos,
          logger: this.logger,
        });

        const registeredTypes = new Set<string>();

        for (const typeRegistration of typeRegistrationOverrides ?? []) {
          testService.registerType(dangerouslyExposeAttributes(typeRegistration));
          registeredTypes.add(typeRegistration.type);
        }

        for (const typeRegistration of this.typeRegistrations) {
          if (!registeredTypes.has(typeRegistration.type)) {
            testService.registerType(dangerouslyExposeAttributes(typeRegistration));
          }
        }

        return new SavedObjectsEncryptionExtension({
          baseTypeRegistry: typeRegistry,
          service: testService,
          getCurrentUser: async () => undefined,
        });
      },
    };
  }

  public stop() {
    this.logger.debug('Stopping plugin');
  }
}
