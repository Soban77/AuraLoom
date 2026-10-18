import './config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router } from './routes.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', router);
app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(error.status ?? 500).json({ error: error.message || 'Internal server error' });
});
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`Aura & Loom API listening on port ${port}`));
