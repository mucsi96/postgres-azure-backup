import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export async function fetchJson<T>(
  http: HttpClient,
  url: string,
  options: { body?: any; method?: string } = {}
) {
  const { body, method = 'get' } = options;
  try {
    const response = await firstValueFrom(
      http.request(method, url, {
        headers: new HttpHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body,
        responseType: 'json',
      })
    );
    return response as T;
  } catch (error) {
    if (error instanceof HttpErrorResponse) {
      const serverMessage =
        error.error && typeof error.error === 'object' && error.error.message;
      if (serverMessage) {
        throw new Error(serverMessage);
      }
    }
    throw error;
  }
}
