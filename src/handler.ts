import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
  GetCommandInvocationCommandInput,
  GetCommandInvocationCommandOutput
} from '@aws-sdk/client-ssm';
import * as act from '@actions/core';
import {
  sleep,
  logger,
  CommandResult,
  InstanceCommandResult,
  hasError
} from './util';

export class SSMCommandHandler {
  private client: SSMClient;

  private static readonly DEFAULT_TIMEOUT_MS = 120000; // 2 minutes
  private static readonly DEFAULT_POLL_INTERVAL_MS = 5000; // 2 seconds
  private static readonly DEFAULT_WORKING_DIR = '/tmp';
  private static readonly COMMAND_DOCUMENT_NAME = 'AWS-RunShellScript';

  private constructor(client: SSMClient) {
    this.client = client;
  }

  public static create(client: SSMClient): SSMCommandHandler {
    return new SSMCommandHandler(client);
  }

  private async poll(
    opts: GetCommandInvocationCommandInput,
    timeout: number = SSMCommandHandler.DEFAULT_TIMEOUT_MS,
    interval: number = SSMCommandHandler.DEFAULT_POLL_INTERVAL_MS
  ): Promise<CommandResult> {
    const startTime = Date.now();
    logger.debug('Polling started', { opts, timeout, interval });

    sleep(interval);

    let polling = true;

    while (polling) {
      try {
        const command = new GetCommandInvocationCommand(opts);
        const invocation: GetCommandInvocationCommandOutput =
          await this.client.send(command);
        logger.debug('Received invocation response', { invocation });

        if (!invocation.Status) {
          logger.warn('Invocation status is undefined', { opts });
        }

        if (!['Pending', 'InProgress'].includes(invocation.Status ?? '')) {
          logger.debug('Invocation status is final', {
            status: invocation.Status
          });
          polling = false;
          return invocation as CommandResult;
        }

        if (Date.now() - startTime > timeout) {
          logger.error('Polling timed out', { opts, timeout });
          polling = false;
          throw new Error('Polling timed out');
        }

        await sleep(interval);
      } catch (error) {
        this.handleError('Error during polling', error);
      }
    }
    throw new Error('Polling failed');
  }

  private async getCommandOutput(
    commandId: string,
    instanceId: string
  ): Promise<CommandResult> {
    const opts: GetCommandInvocationCommandInput = {
      CommandId: commandId,
      InstanceId: instanceId
    };
    logger.debug('Getting command output', { commandId, instanceId });

    try {
      const result = await this.poll(opts);
      logger.debug('Received command output', { result });

      if (!result.StandardOutputContent && !result.StandardOutputUrl) {
        logger.info(
          `No output found for command ID: ${commandId} on instance: ${instanceId}`
        );
      }

      if (result.StandardOutputUrl) {
        logger.warn(
          `StandardOutputUrl is present; fetching output from S3 is not implemented. ${result.StandardOutputUrl}`
        );
      }

      return result;
    } catch (error) {
      logger.error('Error getting command output', { error });
      throw error;
    }
  }

  private async sendSSMCommand(
    command: string,
    instanceIds: string[],
    workingDir: string = SSMCommandHandler.DEFAULT_WORKING_DIR
  ): Promise<string> {
    const sendCommand = new SendCommandCommand({
      DocumentName: SSMCommandHandler.COMMAND_DOCUMENT_NAME,
      InstanceIds: instanceIds,
      Parameters: {
        commands: [command],
        workingDirectory: [workingDir]
      }
    });
    logger.debug('Sending SSM command', { command, instanceIds, workingDir });

    try {
      const response = await this.client.send(sendCommand);
      logger.debug('Received send command response', { response });

      if (!response.Command?.CommandId) {
        const err = `Unable to find the command ID for the command: ${command} on instances: ${instanceIds.join(', ')}`;
        logger.error(err);
        throw new Error('Command ID not found');
      }
      return response.Command.CommandId;
    } catch (error) {
      this.handleError('Error sending command', error);
      throw error;
    }
  }

  private async runCommands(
    command: string,
    instanceIds: string[],
    workingDir?: string
  ): Promise<InstanceCommandResult> {
    logger.debug('Running commands', { command, instanceIds, workingDir });

    try {
      const commandId = await this.sendSSMCommand(
        command,
        instanceIds,
        workingDir
      );
      logger.info(`Command ID: ${commandId}`);

      const results = await Promise.all(
        instanceIds.map(async instanceId => {
          try {
            const result = await this.getCommandOutput(commandId, instanceId);
            logger.debug('Received command result', { instanceId, result });
            return { instanceId, result };
          } catch (err) {
            logger.error(
              `Error running command ${commandId} on instance ${instanceId}`,
              { error: err }
            );
            return { instanceId, result: err as Error };
          }
        })
      );

      return results.reduce<InstanceCommandResult>(
        (acc, { instanceId, result }) => {
          acc[instanceId] = result;
          return acc;
        },
        {}
      );
    } catch (error) {
      this.handleError('Error running commands', error);
      throw error;
    }
  }

  public async run(
    command: string,
    instanceIds: string[],
    workingDir?: string
  ): Promise<void> {
    logger.info(
      `Running command: ${command} on instances: ${instanceIds.join(', ')}`
    );

    if (instanceIds.length === 0) {
      const err = 'No valid instance IDs provided.';
      logger.error(err);
      act.setOutput('status', 'failure');
      act.setFailed(err);
      return;
    }

    try {
      const results = await this.runCommands(command, instanceIds, workingDir);
      const { ok, error } = hasError(results);

      if (!ok) {
        const errMessage = `Errors occurred running the command on instance IDs [${instanceIds.join(', ')}]: ${error}`;
        logger.error('Errors occurred:', { error });
        act.setOutput('status', 'failure');
        act.setOutput('error', error);
        act.setOutput('response', results);
        act.setFailed(errMessage);
        return;
      }

      logger.info('Command executed successfully on all instances.', {
        output: results
      });
      act.setOutput('status', 'success');
      act.setOutput('response', results);
    } catch (error) {
      const errMessage = `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error('Unexpected error:', { error });
      act.setOutput('status', 'failure');
      act.setOutput(
        'error',
        error instanceof Error ? error.message : 'Unknown error'
      );
      act.setFailed(errMessage);
      throw error;
    }
  }

  private handleError(context: string, error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`${context}: ${errorMessage}`, { error, stack: errorStack });
    // throw error instanceof Error ? error : new Error('Unknown error occurred');
  }
}
