import { createApp } from './app.js';
import { config } from './config.js';
import { initQueues } from './jobs/queue.js';
import { warmModels } from './lib/models.js';

warmModels();
const app = createApp();

initQueues().finally(() => {
  app.listen(config.port, () => {
    console.log(`Northline Desk API listening on http://localhost:${config.port}`);
  });
});
