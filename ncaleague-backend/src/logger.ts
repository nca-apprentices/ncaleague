import pino from 'pino';

// JSON lines on stdout, one object per event, for the cluster's log
// collector.
export const logger = pino();
