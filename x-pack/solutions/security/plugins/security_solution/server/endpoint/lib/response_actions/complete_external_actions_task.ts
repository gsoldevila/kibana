/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  TaskManagerSetupContract,
  TaskManagerStartContract,
} from '@kbn/task-manager-plugin/server';
import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import { EndpointError } from '../../../../common/endpoint/errors';
import { CompleteExternalActionsTaskRunner } from './complete_external_actions_task_runner';
import type { EndpointAppContext } from '../../types';

export const COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE =
  'endpoint:complete-external-response-actions';
export const COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_VERSION = '1.0.0';
export const COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TITLE =
  'Security Solution Complete External Response Actions';

export interface CompleteExternalResponseActionsTaskConstructorOptions {
  endpointAppContext: EndpointAppContext;
}

export interface CompleteExternalResponseActionsTaskSetupOptions {
  taskManager: TaskManagerSetupContract;
}

export interface CompleteExternalResponseActionsTaskStartOptions {
  taskManager: TaskManagerStartContract;
  esClient: ElasticsearchClient;
}

export class CompleteExternalResponseActionsTask {
  private wasSetup = false;
  private wasStarted = false;
  private log: Logger;
  private esClient: ElasticsearchClient | undefined = undefined;
  private cleanup: (() => void) | undefined;
  private taskTimeout = '5m'; // Default. Real value comes from server config
  private taskInterval = '60s'; // Default. Real value comes from server config

  constructor(protected readonly options: CompleteExternalResponseActionsTaskConstructorOptions) {
    this.log = this.options.endpointAppContext.logFactory.get(
      COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE
    );
  }

  private get taskId(): string {
    return `${COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE}-${COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_VERSION}`;
  }

  public setup({ taskManager }: CompleteExternalResponseActionsTaskSetupOptions) {
    if (this.wasSetup) {
      throw new Error(`Task has already been setup!`);
    }

    this.wasSetup = true;
    this.taskInterval =
      this.options.endpointAppContext.serverConfig.completeExternalResponseActionsTaskInterval ??
      this.taskInterval;
    this.taskTimeout =
      this.options.endpointAppContext.serverConfig.completeExternalResponseActionsTaskTimeout ??
      this.taskTimeout;

    this.log.info(
      `Registering task [${COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE}] with timeout of [${this.taskTimeout}] and run interval of [${this.taskInterval}]`
    );

    taskManager.registerTaskDefinitions({
      [COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE]: {
        title: COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TITLE,
        timeout: this.taskTimeout,
        createTaskRunner: ({ taskInstance }) => {
          if (!this.esClient) {
            throw new EndpointError(
              `esClient not defined. Was [${this.constructor.name}.start()] called?`
            );
          }

          const { id: taskId, taskType } = taskInstance;

          return new CompleteExternalActionsTaskRunner(
            this.options.endpointAppContext.service,
            this.esClient,
            this.taskInterval,
            taskId,
            taskType
          );
        },
      },
    });
  }

  public async start({ taskManager, esClient }: CompleteExternalResponseActionsTaskStartOptions) {
    if (this.wasStarted) {
      throw new Error('Task has already been started!');
    }

    this.wasStarted = true;
    this.esClient = esClient;

    try {
      await taskManager.ensureScheduled({
        id: this.taskId,
        taskType: COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE,
        scope: ['securitySolution'],
        schedule: {
          interval: this.taskInterval,
        },
        state: {},
        params: {},
      });
    } catch (e) {
      this.log.error(new EndpointError(`Error scheduling task, received: ${e.message}`, e));
    }

    this.cleanup = () => {
      this.log.info(
        `Un-registering task definition [${COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE}] (if it exists)`
      );
      taskManager.removeIfExists(COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE).catch(() => {});
      this.cleanup = undefined;
    };
  }

  public async stop() {
    this.wasSetup = false;
    this.wasStarted = false;

    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }

    this.log.debug(`Task [${COMPLETE_EXTERNAL_RESPONSE_ACTIONS_TASK_TYPE}] as been stopped`);
  }
}
