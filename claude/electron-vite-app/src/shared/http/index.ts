// Export everything from types
export * from './types';

// Export HttpClient class and default instance
export { HttpClient, httpClient } from './client';

// Export default instance for convenient usage
import httpClient from './client';
export default httpClient;