import * as core from '@actions/core';
import { Logger } from 'tslog';

export const logger = new Logger({ type: 'pretty', name: 'ssm-command' });

export enum SSMCommandStatus {
  Pending = 'Pending',
  InProgress = 'InProgress',
  Success = 'Success',
  Cancelled = 'Cancelled',
  TimedOut = 'TimedOut',
  Failed = 'Failed',
  Cancelling = 'Cancelling'
}

export interface CommandResult {
  StandardOutputContent?: string;
  StandardOutputUrl?: string;
  StandardErrorContent?: string;
  Status?: SSMCommandStatus;
}

export interface InstanceCommandResult {
  [instanceId: string]: CommandResult | Error;
}

export const hasError = (
  results: InstanceCommandResult
): { ok: boolean; error?: Error } => {
  let ok = true;
  let error: Error | undefined;

  Object.entries(results).forEach(([_, result]) => {
    if (result instanceof Error) {
      ok = false;
      error = result;
    } else {
      if (result.Status !== SSMCommandStatus.Success) {
        ok = false;
        error = new Error(`Command failed with status: ${result.Status}`);
      }
    }
  });

  return { ok, error };
};

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
