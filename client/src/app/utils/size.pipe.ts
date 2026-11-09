import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'size',
  standalone: true,
})
export class SizePipe implements PipeTransform {
  transform(size: number): string {
    const units = ['B', 'kB', 'MB', 'GB'];
    let unitIndex = 0;

    while (Math.abs(size) >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
