/**
 * Extract the human message from an API Error body ({code, message}) the
 * generated client throws on non-2xx. Falls back when the shape is off
 * (network failure, HTML error page, …).
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message !== ''
  ) {
    return (error as { message: string }).message
  }
  return fallback
}
