import { parseApiEnv } from '@invoicetap/config/env';
import { createApp } from './app.js';
import './sendnaro/jobs.js'; // registers outbox handlers for /cron/outbox

// Vercel serverless entry: an Express app is itself a (req, res) handler. No listen(), no signal handling.
export default createApp(parseApiEnv());
