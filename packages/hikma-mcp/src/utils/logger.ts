import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let currentLevel: LogLevel = 'info';
let verbose = false;

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setVerbose(v: boolean): void {
  verbose = v;
  if (v) {
    currentLevel = 'debug';
  }
}

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= levels[currentLevel];
}

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  const prefix = verbose ? `[${timestamp}] ` : '';

  switch (level) {
    case 'debug':
      return `${prefix}${chalk.gray('[DEBUG]')} ${message}`;
    case 'info':
      return `${prefix}${chalk.blue('[INFO]')} ${message}`;
    case 'warn':
      return `${prefix}${chalk.yellow('[WARN]')} ${message}`;
    case 'error':
      return `${prefix}${chalk.red('[ERROR]')} ${message}`;
  }
}

export const logger = {
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.error(formatMessage('debug', message), ...args);
    }
  },

  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.error(formatMessage('info', message), ...args);
    }
  },

  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.error(formatMessage('warn', message), ...args);
    }
  },

  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message), ...args);
    }
  },

  // For CLI output (not logs)
  print(message: string): void {
    console.log(message);
  },

  success(message: string): void {
    console.log(chalk.green('✓'), message);
  },

  fail(message: string): void {
    console.log(chalk.red('✗'), message);
  },
};
