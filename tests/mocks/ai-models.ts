export interface MockModelResponse {
  success: boolean;
  patch?: string;
  error?: string;
  testOutput?: string;
}

export function createSequentialModel(responses: MockModelResponse[]) {
  let index = 0;
  return async () => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return response;
  };
}

export function createDeterministicFailure(message: string): () => Promise<MockModelResponse> {
  return async () => ({ success: false, error: message, testOutput: message });
}

export function createFlakyModel(successOnAttempt = 2, message = 'Transient failure') {
  let attempt = 0;
  return async () => {
    attempt += 1;
    if (attempt >= successOnAttempt) {
      return { success: true, patch: '// fix applied', testOutput: 'All good' };
    }
    return { success: false, error: message, testOutput: message };
  };
}
