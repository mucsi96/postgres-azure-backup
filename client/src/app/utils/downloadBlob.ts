import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export async function downloadBlob(
  http: HttpClient,
  url: string,
  filename: string
) {
  const blob = await firstValueFrom(
    http.get(url, {
      responseType: 'blob',
      observe: 'body',
    })
  );

  // Create blob URL and trigger download
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up blob URL
  URL.revokeObjectURL(blobUrl);
}
