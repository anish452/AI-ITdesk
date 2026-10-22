import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

export const config = {
  port: Number(process.env.PORT ?? 4080),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6380',
  jwtSecret: process.env.JWT_SECRET ?? 'comp903-northline-desk-dev-secret',
  llmBaseUrl: (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY ?? '',
  llmModel: process.env.LLM_MODEL ?? 'gpt-4o-mini',
};

export const llmEnabled = (): boolean => config.llmApiKey.trim().length > 0;
