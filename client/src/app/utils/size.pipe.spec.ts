import { describe, it, expect, beforeEach } from 'vitest';
import { SizePipe } from './size.pipe';

describe('SizePipe', () => {
  let pipe: SizePipe;

  beforeEach(() => {
    pipe = new SizePipe();
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('formats bytes', () => {
    expect(pipe.transform(0)).toBe('0.0 B');
    expect(pipe.transform(100)).toBe('100.0 B');
    expect(pipe.transform(1023)).toBe('1023.0 B');
  });

  it('formats kilobytes', () => {
    expect(pipe.transform(1024)).toBe('1.0 kB');
    expect(pipe.transform(2048)).toBe('2.0 kB');
    expect(pipe.transform(524288)).toBe('512.0 kB');
  });

  it('formats megabytes', () => {
    expect(pipe.transform(1048576)).toBe('1.0 MB');
    expect(pipe.transform(5242880)).toBe('5.0 MB');
  });

  it('formats gigabytes', () => {
    expect(pipe.transform(1073741824)).toBe('1.0 GB');
    expect(pipe.transform(5368709120)).toBe('5.0 GB');
  });

  it('handles negative values', () => {
    expect(pipe.transform(-1024)).toBe('-1.0 kB');
    expect(pipe.transform(-1048576)).toBe('-1.0 MB');
  });
});
