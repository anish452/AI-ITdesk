import cors from 'cors';
import express from 'express';
import api from './routes/api.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', api);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'The service desk could not complete that action.' });
  });
  return app;
}
