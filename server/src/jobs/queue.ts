import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import { runPipeline } from '../services/pipeline.js';
import { runLearning } from '../services/learning.js';

export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  connectTimeout: 2500,
  lazyConnect: true,
});

let ready = false;
let pipelineQueue: Queue | null = null;
let learnQueue: Queue | null = null;

export function queueReady(): boolean {
  return ready;
}

export async function initQueues(): Promise<boolean> {
  try {
    if (redis.status === 'wait') await redis.connect();
    await redis.ping();
    const connection = redis;
    pipelineQueue = new Queue('ticket-pipeline', { connection });
    learnQueue = new Queue('ticket-learn', { connection });
    new Worker('ticket-pipeline', async (job: { data: { ticketId: string } }) => runPipeline(job.data.ticketId), { connection });
    new Worker('ticket-learn', async (job: { data: { ticketId: string } }) => runLearning(job.data.ticketId), { connection });
    ready = true;
    return true;
  } catch (error) {
    ready = false;
    console.warn('Redis is unavailable. Tickets will be processed in the API process.', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function enqueuePipeline(ticketId: string): Promise<void> {
  if (ready && pipelineQueue) {
    await pipelineQueue.add('process', { ticketId }, { removeOnComplete: 200, attempts: 2 });
    return;
  }
  await runPipeline(ticketId);
}

export async function enqueueLearning(ticketId: string): Promise<void> {
  if (ready && learnQueue) {
    await learnQueue.add('learn', { ticketId }, { removeOnComplete: 200, attempts: 2 });
    return;
  }
  await runLearning(ticketId);
}
