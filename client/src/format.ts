export function olderThanOneDay(date: Date | null) {
  return !date || Date.now() - date.getTime() > 86400000;
}

export function relativeTime(date: Date | null) {
  if (!date) return '—';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const cutoffs = [60, 3600, 86400, 86400 * 7, 86400 * 30, 86400 * 365, Infinity];
  const units: Intl.RelativeTimeFormatUnit[] = ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'];
  const index = cutoffs.findIndex(cutoff => cutoff > Math.abs(seconds));
  return new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
    .format(-Math.floor(seconds / (index ? cutoffs[index - 1] : 1)), units[index]);
}

export function size(value: number) {
  const units = ['B', 'kB', 'MB', 'GB'];
  let index = 0;
  while (Math.abs(value) >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return `${value.toFixed(1)} ${units[index]}`;
}

export function retention(days: number) {
  return days ? `${days} ${days === 1 ? 'day' : 'days'}` : '';
}
