export class DynamicMultiagentError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DynamicMultiagentError';
    this.code = code;
    if (options.retriable !== undefined) this.retriable = Boolean(options.retriable);
    if (options.status !== undefined) this.status = options.status;
    if (options.provider !== undefined) this.provider = options.provider;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
    if (options.details !== undefined) this.details = options.details;
  }
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  try {
    return String(error);
  } catch {
    return '[unrenderable error]';
  }
}

export function asDynamicError(error, code = 'internal-error') {
  if (error instanceof DynamicMultiagentError) return error;
  return new DynamicMultiagentError(code, errorMessage(error), { cause: error });
}

