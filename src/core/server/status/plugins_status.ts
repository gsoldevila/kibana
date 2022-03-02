/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
/* eslint-disable no-console */
import { Observable, ReplaySubject, Subject, Subscription } from 'rxjs';
import {
  map,
  distinctUntilChanged,
  pluck,
  filter,
  tap,
  debounceTime,
  bufferTime,
} from 'rxjs/operators';

import { PluginName } from '../plugins';
import { ServiceStatus, CoreStatus, ServiceStatusLevels } from './types';
import { getSummaryStatus } from './get_summary_status';

const STATUS_TIMEOUT_MS = 30 * 1000; // 30 seconds

const defaultStatus: ServiceStatus = {
  level: ServiceStatusLevels.unavailable,
  summary: 'Unknown status',
};
interface Deps {
  core$: Observable<CoreStatus>;
  pluginDependencies: ReadonlyMap<PluginName, PluginName[]>;
}

interface PluginData {
  [name: PluginName]: {
    dependencies: PluginName[];
    reverseDependencies: PluginName[];
    reportedStatus?: ServiceStatus;
    derivedStatus: ServiceStatus;
  };
}

interface UpdatedPlugins {
  [name: PluginName]: boolean;
}

interface PluginStatus {
  [name: PluginName]: ServiceStatus;
}

interface PluginReportedStatus {
  [name: PluginName]: Subscription;
}

export class PluginsStatusService {
  private coreStatus: CoreStatus = { elasticsearch: defaultStatus, savedObjects: defaultStatus };
  private pluginData: PluginData;
  private pluginData$ = new ReplaySubject<PluginData>(1);
  private pluginStatus: PluginStatus;
  private pluginStatus$ = new ReplaySubject<PluginStatus>(1);
  private pluginReportedStatus: PluginReportedStatus = {};
  private updateRecursiveDependencies = new Subject<PluginName>();
  private newRegistrationsAllowed = true;

  constructor(private readonly deps: Deps) {
    this.pluginData = this.initPluginData(deps.pluginDependencies);
    const rootPlugins = this.getRootPlugins();
    this.pluginStatus = {};

    this.updateRecursiveDependencies
      .asObservable()
      .pipe(
        bufferTime(100),
        filter((plugins) => plugins.length > 0)
      )
      .subscribe((plugins) => {
        console.log(`[PluginsStatusService] 🌳 Updating dependency tree for ${plugins.join(',')}`);
        const updatedPlugins = {};

        plugins.forEach((plugin) => {
          this.updateStatusRecursive(
            updatedPlugins,
            this.pluginData[plugin].reverseDependencies,
            plugin
          );
        });

        this.pluginData$.next(this.pluginData);
        this.pluginStatus$.next(this.pluginStatus);
      });

    this.deps.core$.pipe(debounceTime(100)).subscribe((coreStatus) => {
      console.log(
        `[PluginsStatusService] 🔷 Core plugins changed: elastic=${coreStatus.elasticsearch.level}, so=${coreStatus.savedObjects.level}`
      );
      this.coreStatus = coreStatus;
      const derivedStatus = getSummaryStatus(Object.entries(coreStatus), {
        allAvailableSummary: `All dependencies are available`,
      });

      rootPlugins.forEach((plugin) => {
        this.pluginData[plugin].derivedStatus = derivedStatus;
        if (!this.pluginData[plugin].reportedStatus) {
          // this root plugin has NOT reported any status yet. Thus, its status is derived from core
          this.pluginStatus[plugin] = derivedStatus;
        }

        this.updateRecursiveDependencies.next(plugin);
      });
    });
  }

  public set(plugin: PluginName, status$: Observable<ServiceStatus>) {
    console.log(`[PluginsStatusService] 🔷 Define custom status observable for ${plugin}`);

    if (!this.newRegistrationsAllowed) {
      throw new Error(
        `Custom statuses cannot be registered after setup, plugin [${plugin}] attempted`
      );
    }

    const subscription = this.pluginReportedStatus[plugin];
    if (subscription) subscription.unsubscribe();

    this.pluginReportedStatus[plugin] = status$.subscribe((status) => {
      this.pluginData[plugin].reportedStatus = status;
      this.pluginStatus[plugin] = status;

      if (status.level !== this.pluginData[plugin].reportedStatus?.level) {
        console.log(`[PluginsStatusService] 🔷 Plugin ${plugin} reported status ${status.level}`);
        this.updateRecursiveDependencies.next(plugin);
      }
    });
  }

  public blockNewRegistrations() {
    this.newRegistrationsAllowed = false;
  }

  public getAll$(): Observable<Record<PluginName, ServiceStatus>> {
    console.log('[PluginsStatusService] ⭕ called getAll$()');
    return this.pluginStatus$.asObservable().pipe(
      tap((all) => {
        // TODO Remove this tap, only for debugging purposes
        const ready = Object.keys(all).filter(
          (key) => all[key].level === ServiceStatusLevels.available
        );

        console.log(`[PluginsStatusService] ☝ Number of ready plugins: ${ready.length}`);
      })
    );
  }

  public getDependenciesStatus$(plugin: PluginName): Observable<Record<PluginName, ServiceStatus>> {
    console.log(`[PluginsStatusService] ⭕ called getDependenciesStatus$(${plugin})`);
    const directDependencies = this.pluginData[plugin].dependencies;

    return this.pluginStatus$.asObservable().pipe(
      map((allStatus) =>
        Object.keys(allStatus)
          .filter((dep) => directDependencies.includes(dep))
          .reduce((acc: PluginStatus, key: PluginName) => {
            acc[key] = allStatus[key];
            return acc;
          }, {})
      ),
      distinctUntilChanged(),
      tap((depsStatus) =>
        console.log(`[PluginsStatusService] ❗ ${plugin} dependencies have changed:`, depsStatus)
      )
    );
  }

  public getDerivedStatus$(plugin: PluginName): Observable<ServiceStatus> {
    console.log(`[PluginsStatusService] ⭕ called getDerivedStatus$(${plugin})`);
    return this.pluginData$.asObservable().pipe(
      pluck(plugin, 'derivedStatus'),
      filter((status: ServiceStatus | undefined): status is ServiceStatus => !!status),
      distinctUntilChanged()
    );
  }

  private initPluginData(pluginDependencies: ReadonlyMap<PluginName, PluginName[]>): PluginData {
    const pluginData: PluginData = {};

    if (pluginDependencies) {
      pluginDependencies.forEach((dependencies, plugin) => {
        pluginData[plugin] = {
          dependencies,
          reverseDependencies: [],
          derivedStatus: defaultStatus,
        };
      });

      pluginDependencies.forEach((dependencies, plugin) => {
        dependencies.forEach((dependency) => {
          pluginData[dependency].reverseDependencies.push(plugin);
        });
      });
    }

    return pluginData;
  }

  private getRootPlugins(): PluginName[] {
    return Object.keys(this.pluginData).filter(
      (plugin) => this.pluginData[plugin].dependencies.length === 0
    );
  }

  private updateStatusRecursive(
    updatedPlugins: UpdatedPlugins,
    reverseDependencies: PluginName[],
    plugin: PluginName,
    depth: number = 0
  ): void {
    if (updatedPlugins[plugin]) return;
    updatedPlugins[plugin] = true;
    if (!reverseDependencies.length) return;

    /* console.log(
      `[PluginsStatusService] 🌳 updateStatusRecursive[d=${depth}] ${plugin} <= ${reverseDependencies.join(
        ','
      )}`
    ); */

    reverseDependencies.forEach((revDep) => {
      const newStatus = this.determinePluginStatus(revDep);
      const pluginData = this.pluginData[revDep];

      pluginData.derivedStatus = newStatus;

      if (!pluginData.reportedStatus) {
        // this plugin has NOT reported any status yet. Thus, its status is derived from its dependencies + core
        pluginData.reportedStatus = newStatus;
      }

      this.updateStatusRecursive(updatedPlugins, pluginData.reverseDependencies, revDep, depth + 1);
    });
  }

  private determinePluginStatus(plugin: PluginName): ServiceStatus {
    const coreStatus: Array<[PluginName, ServiceStatus]> = Object.entries(this.coreStatus);
    const depsStatus: Array<[PluginName, ServiceStatus]> = this.pluginData[plugin].dependencies.map(
      (dependency) => [
        dependency,
        this.pluginData[dependency].reportedStatus || this.pluginData[dependency].derivedStatus,
      ]
    );

    return getSummaryStatus([...coreStatus, ...depsStatus], {
      allAvailableSummary: `All dependencies are available`,
    });
  }
}
