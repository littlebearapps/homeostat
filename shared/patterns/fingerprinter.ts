import crypto from 'node:crypto';

export interface ErrorFingerprint {
  id: string;
  errorType: string;
  filePath: string;
  topStackFrame: string;
  messageHash: string;
  fullSignature: string;
}

export interface RawError {
  type: string;
  message: string;
  stack: string;
}

export class FailureFingerprinter {
  static normalize(error: RawError): ErrorFingerprint {
    const filePath = this.extractFilePath(error.stack);
    const topFrame = error.stack.split('\n')[0]?.trim() ?? 'unknown';
    const normalizedMessage = this.normalizeMessage(error.message);
    const messageHash = crypto
      .createHash('sha256')
      .update(normalizedMessage)
      .digest('hex')
      .slice(0, 8);

    const signature = `${error.type}:${filePath}:${messageHash}`;
    const id = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 12);

    return {
      id,
      errorType: error.type,
      filePath,
      topStackFrame: topFrame,
      messageHash,
      fullSignature: signature
    };
  }

  private static normalizeMessage(message: string): string {
    return message
      .replace(/[A-Fa-f0-9]{32}/g, 'HASH')
      .replace(/[A-Fa-f0-9-]{36}/g, 'UUID')
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
      .replace(/\d{2}:\d{2}:\d{2}/g, 'TIME')
      .replace(/\b\d+\b/g, 'N');
  }

  private static extractFilePath(stack: string): string {
    const frameMatch = stack.match(/at [^\s]+ \(([^:]+):(\d+):(\d+)\)/);
    if (frameMatch) {
      return frameMatch[1];
    }

    const altMatch = stack.match(/(\/[\w./-]+):(\d+):(\d+)/);
    if (altMatch) {
      return altMatch[1];
    }

    return 'unknown';
  }
}
