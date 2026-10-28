import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import api from './routes.js';
import { seedIfEmpty } from './seed.js';

const app = express();
app.use(helmet());
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: clientOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api', api);
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === 'ValidationError' ? 400 : err.code === 11000 ? 409 : 500);
  res.status(status).json({ message: status === 500 ? 'Something went wrong. Please try again.' : err.message });
});

const port = Number(process.env.PORT || 5000);
if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) throw new Error('Set MONGODB_URI and JWT_SECRET in server/.env');
await mongoose.connect(process.env.MONGODB_URI);
if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO_DATA === 'true') await seedIfEmpty();
app.listen(port, () => console.log(`WMS API listening on http://localhost:${port}`));
