/** Browser IANA timezone for default task-local labels. */
export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getTimezoneOptions(): { value: string; label: string }[] {
  const browserTz = getBrowserTimeZone();
  const common = [
    browserTz,
    'America/Sao_Paulo',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Phoenix',
    'UTC',
    'Europe/London',
    'Europe/Paris',
    'Europe/Zurich',
    'Europe/Berlin',
    'Australia/Sydney',
  ];

  const seen = new Set<string>();
  return common
    .filter((tz) => {
      if (seen.has(tz)) return false;
      seen.add(tz);
      return true;
    })
    .map((tz) => ({
      value: tz,
      label: tz === browserTz ? `${tz} (browser)` : tz,
    }));
}
