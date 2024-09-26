import * as core from '@actions/core';
import { SSMClient } from '@aws-sdk/client-ssm';
import { logger } from './util';
import { SSMCommandHandler } from './handler';

const command = core.getInput('command');
const workingDir = core.getInput('working-dir');
const region = core.getInput('region');
const instanceIds = core
  .getInput('instance-ids')
  .split(',')
  .map(id => id.trim());

logger.info('Parameters', { command, workingDir, region, instanceIds });

const awsAccessKeyId = core.getInput('aws-access-key-id');
const awsSecretAccessKey = core.getInput('aws-secret-access-key');

const client = new SSMClient({
  region: region ?? process.env.AWS_REGION,
  credentials: {
    accessKeyId: awsAccessKeyId ?? process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: awsSecretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY
  }
});
const handler = SSMCommandHandler.create(client);
handler.run(command, instanceIds, workingDir);
