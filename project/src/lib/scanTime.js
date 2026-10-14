export function formatDuration(seconds) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (total < 60) return `${total}s`;
  if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
  return `${Math.floor(total / 3600)}h ${Math.floor((total % 3600) / 60)}m`;
}

export function formatRemainingTime(seconds) {
  if (!Number.isFinite(seconds)) return 'Calculating…';
  if (seconds <= 0) return 'Finishing scan…';
  if (seconds < 60) return 'Less than a minute';
  return `About ${formatDuration(Math.ceil(seconds / 60) * 60).replace(' 0s', '')}`;
}
