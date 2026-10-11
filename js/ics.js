// Calendrier iCal généré sur l'appareil (RFC 5545) : séances planifiées à 7h00,
// heure de Paris, alarme 1 h avant. UID stables : réimporter met à jour.

const TZ = 'Europe/Paris';
const VTIMEZONE_LINES = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'X-LIC-LOCATION:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

const encoder = new TextEncoder();

// Échappement des valeurs texte : backslash d'abord, puis ; , et retours ligne.
function escText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Pliage à 75 octets (UTF-8), sans couper un caractère multi-octets.
function fold(line) {
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    if (bytes + n > 75) {
      parts.push(cur);
      cur = ' ';
      bytes = 1;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n');
}

function addDaysCompact(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10).replaceAll('-', '');
}

const utcStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function buildCalendar(db) {
  const p = db.program || {};
  if (typeof p.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate)) {
    throw new Error('program.startDate invalide');
  }
  const weeks = Number(p.weeks) || 13;
  const schedule = p.schedule && typeof p.schedule === 'object' ? p.schedule : {};
  const sessions = Array.isArray(db.sessions) ? db.sessions : [];
  const phases = Array.isArray(p.phases) ? p.phases : [];
  const stamp = utcStamp(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//sport.local//Sport//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(p.name || 'Sport')}`,
    `X-WR-TIMEZONE:${TZ}`,
    ...VTIMEZONE_LINES,
  ];

  for (let w = 1; w <= weeks; w++) {
    const phase = phases.find((ph) => Array.isArray(ph.weeks) && ph.weeks.includes(w));
    const phaseName = phase ? phase.name : 'sans phase';
    for (const [sid, dowRaw] of Object.entries(schedule)) {
      const dow = Number(dowRaw);
      if (!Number.isInteger(dow) || dow < 1 || dow > 7) continue;
      const session = sessions.find((s) => s.id === sid);
      if (!session) continue;
      const day = addDaysCompact(p.startDate, (w - 1) * 7 + (dow - 1));
      lines.push(
        'BEGIN:VEVENT',
        `UID:S${w}-${sid}@sport.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${TZ}:${day}T070000`,
        `DTEND;TZID=${TZ}:${day}T080000`,
        `SUMMARY:${escText(`Séance ${sid} : ${session.name}`)}`,
        `DESCRIPTION:${escText(`Semaine ${w} sur ${weeks}, phase ${phaseName}.`)}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escText('Séance dans 1 heure')}`,
        'TRIGGER:-PT1H',
        'END:VALARM',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Propose le fichier : téléchargement classique, ou ouverture directe sur iOS
// (Safari affiche alors « Ajouter tous les événements » dans Calendrier).
export function downloadCalendar(db) {
  const blob = new Blob([buildCalendar(db)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (!isIOS()) a.download = 'sport.ics';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
