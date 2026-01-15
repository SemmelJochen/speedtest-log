type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  service?: string;
  operation?: string;
  [key: string]: unknown;
}

const LOG_COLORS = {
  DEBUG: '\x1b[90m',  // Gray
  INFO: '\x1b[36m',   // Cyan
  WARN: '\x1b[33m',   // Yellow
  ERROR: '\x1b[31m',  // Red
  RESET: '\x1b[0m',
};

class Logger {
  private serviceName: string;

  constructor(serviceName: string = 'App') {
    this.serviceName = serviceName;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = this.formatTimestamp();
    const service = context?.service || this.serviceName;
    const color = LOG_COLORS[level];
    const reset = LOG_COLORS.RESET;

    let formatted = `${color}[${timestamp}] [${level}] [${service}]${reset} ${message}`;

    if (context) {
      const { service: _, operation, ...rest } = context;
      if (operation) {
        formatted += ` (${operation})`;
      }
      if (Object.keys(rest).length > 0) {
        formatted += ` ${JSON.stringify(rest)}`;
      }
    }

    return formatted;
  }

  debug(message: string, context?: LogContext): void {
    console.debug(this.formatMessage('DEBUG', message, context));
  }

  info(message: string, context?: LogContext): void {
    console.info(this.formatMessage('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage('WARN', message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = error ? `${message}: ${errorMessage}` : message;
    console.error(this.formatMessage('ERROR', fullMessage, context));

    if (error instanceof Error && error.stack) {
      console.error(`${LOG_COLORS.ERROR}${error.stack}${LOG_COLORS.RESET}`);
    }
  }

  /**
   * Create a timer for measuring operation duration
   */
  startTimer(operation: string): () => void {
    const start = Date.now();
    this.debug(`Started`, { operation });

    return () => {
      const duration = Date.now() - start;
      this.info(`Completed in ${duration}ms`, { operation, duration });
    };
  }

  /**
   * Create a child logger with a different service name
   */
  child(serviceName: string): Logger {
    return new Logger(serviceName);
  }
}

// Default logger instance
export const logger = new Logger();

// Export class for creating service-specific loggers
export { Logger };
