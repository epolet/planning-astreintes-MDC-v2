import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import cadresRouter    from './routes/cadres.js';
import slotsRouter     from './routes/slots.js';
import periodsRouter   from './routes/periods.js';
import scoresRouter    from './routes/scores.js';
import vacationsRouter from './routes/vacations.js';
import closedDaysRouter from './routes/closedDays.js';
import configRouter    from './routes/config.js';
import wishesRouter    from './routes/wishes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(cors({ origin: 'http://localhost:5173' }));

app.use('/api/cadres',      cadresRouter);
app.use('/api/slots',       slotsRouter);
app.use('/api/periods',     periodsRouter);
app.use('/api/scores',      scoresRouter);
app.use('/api/vacations',   vacationsRouter);
app.use('/api/closed-days', closedDaysRouter);
app.use('/api/config',      configRouter);
app.use('/api/wishes',     wishesRouter);

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`API server running on port ${PORT}`));
