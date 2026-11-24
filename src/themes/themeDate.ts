const pad = (value: number) => String(value).padStart(2, '0');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateParts(date: Date, timeZone?: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(date).map(part => [part.type, part.value]));
}

function localDateTime(date: Date, timeZone?: string): string {
  const parts = dateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatThemeTimestamp(date = new Date(), timeZone?: string): string {
  const parts = dateParts(date, timeZone);
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`;
}

function offsetFor(source: string): string | undefined {
  const named: Record<string, string> = { Z: '+00:00', UTC: '+00:00', GMT: '+00:00', PDT: '-07:00', PST: '-08:00' };
  if (named[source]) return named[source];
  const match = source.replace(/^(UTC|GMT)/, '').match(/^([+-])(\d{1,2})(?::?(\d{2}))?$/);
  return match ? `${match[1]}${pad(Number(match[2]))}:${match[3] ?? '00'}` : undefined;
}

export function formatThemeDate(value?: string, timeZone?: string): string {
  if (!value?.trim()) return '未标注';
  const source = value.trim().replace(/[\u00a0\u202f]/g, ' ');
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return source;
  const english = source.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)(?:\s+(.+))?$/);
  let date: string, hour: number, minute: string, second: string, zone: string | undefined;
  if (english) {
    date = `${english[3]}-${pad(months.indexOf(english[1]) + 1)}-${pad(Number(english[2]))}`;
    hour = Number(english[4]);
    if (hour < 1 || hour > 12) return `${date}（时间未明确）`;
    hour = hour % 12 + (english[7] === 'PM' ? 12 : 0);
    minute = english[5]; second = english[6] ?? '00'; zone = english[8];
  } else {
    const numeric = source.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
    if (!numeric) return '时间格式无法识别';
    date = numeric[1]; hour = Number(numeric[2]); minute = numeric[3]; second = numeric[4] ?? '00'; zone = numeric[5];
  }
  if (hour > 23 || Number(minute) > 59 || Number(second) > 59) return `${date}（时间未明确）`;
  const clock = `${pad(hour)}:${minute}`;
  if (!zone) return `${date} ${clock}（时区未注明）`;
  const offset = offsetFor(zone);
  if (!offset) return `${date} ${clock}（时区未注明）`;
  const instant = new Date(`${date}T${clock}:${second}${offset}`);
  return Number.isNaN(instant.getTime()) ? '时间格式无法识别' : localDateTime(instant, timeZone);
}
