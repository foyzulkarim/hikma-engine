/**
 * @file Centralized logging utility for hikma-engine.
 *       Provides structured logging with different levels and output targets.
 */

import * as fs from 'fs';
import * as path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, any>;
}

/**
 * Logger class that provides structured logging capabilities.
 */
export class Logger {
  private level: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private logFilePath?: string;
  private context?: string;

  private static readonly LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(options: {
    level: LogLevel;
    enableConsole: boolean;
    enableFile: boolean;
    logFilePath?: string;
    context?: string;
  }) {
    this.level = options.level;
    this.enableConsole = options.enableConsole;
    this.enableFile = options.enableFile;
    this.logFilePath = options.logFilePath;
    this.context = options.context;

    // Ensure log directory exists if file logging is enabled
    if (this.enableFile && this.logFilePath) {
      const logDir = path.dirname(this.logFilePath);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  /**
   * Creates a child logger with additional context.
   */
  child(context: string): Logger {
    return new Logger({
      level: this.level,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      logFilePath: this.logFilePath,
      context: this.context ? `${this.context}:${context}` : context,
    });
  }

  /**
   * Checks if a log level should be output based on current configuration.
   */
  private shouldLog(level: LogLevel): boolean {
    return Logger.LOG_LEVELS[level] >= Logger.LOG_LEVELS[this.level];
  }

  /**
   * Safely stringifies an object, handling circular references.
   */
  private safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }
      return value;
    });
  }

  /**
   * Formats a log entry for output.
   */
  private formatLogEntry(entry: LogEntry): string {
    const contextStr = entry.context ? `[${entry.context}] ` : '';
    const metadataStr = entry.metadata ? ` ${this.safeStringify(entry.metadata)}` : '';
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${contextStr}${entry.message}${metadataStr}`;
  }

  /**
   * Writes a log entry to the configured outputs.
   */
  private writeLog(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata,
    };

    const formattedMessage = this.formatLogEntry(entry);

    // Console output
    if (this.enableConsole) {
      switch (level) {
        case 'debug':
          console.debug(formattedMessage);
          break;
        case 'info':
          console.info(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'error':
          console.error(formattedMessage);
          break;
      }
    }

    // File output
    if (this.enableFile && this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, formattedMessage + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  /**
   * Logs a debug message.
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.writeLog('debug', message, metadata);
  }

  /**
   * Logs an info message.
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.writeLog('info', message, metadata);
  }

  /**
   * Logs a warning message.
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.writeLog('warn', message, metadata);
  }

  /**
   * Logs an error message.
   */
  error(message: string, metadata?: Record<string, any>): void {
    this.writeLog('error', message, metadata);
  }

  /**
   * Logs the start of an operation and returns a function to log its completion.
   */
  operation(operationName: string): () => void {
    const startTime = Date.now();
    this.info(`Starting operation: ${operationName}`);
    
    return () => {
      const duration = Date.now() - startTime;
      this.info(`Completed operation: ${operationName}`, { duration: `${duration}ms` });
    };
  }

  /**
   * Logs performance metrics for an operation.
   */
  performance(operationName: string, metrics: Record<string, any>): void {
    this.info(`Performance metrics for ${operationName}`, metrics);
  }
}

/**
 * Global logger instance.
 */
let globalLogger: Logger | null = null;

/**
 * Initializes the global logger.
 */
export function initializeLogger(options: {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logFilePath?: string;
}): Logger {
  globalLogger = new Logger(options);
  return globalLogger;
}

/**
 * Gets the global logger instance.
 */
export function getLogger(context?: string): Logger {
  if (!globalLogger) {
    // Fallback to console-only logger if not initialized
    globalLogger = new Logger({
      level: 'info',
      enableConsole: true,
      enableFile: false,
    });
  }
  
  return context ? globalLogger.child(context) : globalLogger;
}
