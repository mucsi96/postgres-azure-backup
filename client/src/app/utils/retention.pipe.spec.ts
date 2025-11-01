import { describe, it, expect, beforeEach } from 'vitest';
import { RetentionPipe } from './retention.pipe';

describe('RetentionPipe', () => {
  let pipe: RetentionPipe;

  beforeEach(() => {
    pipe = new RetentionPipe();
  });

  it('create an instance', () => {
    expect(pipe).toBeTruthy();
  });

  it('returns empty string for 0', () => {
    expect(pipe.transform(0)).toBe('');
  });

  it('returns empty string for null/undefined', () => {
    expect(pipe.transform(null as any)).toBe('');
    expect(pipe.transform(undefined as any)).toBe('');
  });

  it('returns singular "day" for 1', () => {
    expect(pipe.transform(1)).toBe('1 day');
  });

  it('returns plural "days" for 2', () => {
    expect(pipe.transform(2)).toBe('2 days');
  });

  it('returns plural "days" for multiple values', () => {
    expect(pipe.transform(7)).toBe('7 days');
    expect(pipe.transform(30)).toBe('30 days');
    expect(pipe.transform(365)).toBe('365 days');
  });
});
