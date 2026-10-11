import pino from 'pino';

/**
 * Structured logger with redaction for anything that could leak a secret,
 * token or password into log aggregation. Never add fields to the redact
 * list conditionally — always redact, even in development, so habits don't
 * change between environments.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.apiKey',
      '*.secretKey',
      '*.encryptedSecretKey',
      '*.totpCode',
      '*.authorization',
      '*.cardNumber',
      '*.cvv',
    ],
    censor: '[REDACTED]',
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
});
