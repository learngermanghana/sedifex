# Booking Sync confirmation not sent: fix

If confirmations are not sent after Sedifex sync, check for **duplicate `parseTime_` definitions**.

In your script, `parseTime_` appears twice. In Google Apps Script, the second definition overwrites the first one.
If the active (last) version only parses strings, then Sheet-native time values (`Date` objects or numeric serial time)
return `null`, causing `combineDateTimeInTz_()` to return `null`, and `runBookingEmailFlow()` skips confirmation sending.

## Symptom chain

1. Webhook sync writes row successfully.
2. `runBookingEmailFlow()` executes.
3. `combineDateTimeInTz_(dateVal, timeVal, tz)` calls `parseTime_(timeVal)`.
4. `parseTime_()` returns `null` for non-string time cells.
5. `if (!appointment) continue;` short-circuits confirmation logic.

## Fix

Keep only one `parseTime_` function and use this version:

```javascript
function parseTime_(t) {
  if (t === null || t === undefined || t === "") return null;

  if (Object.prototype.toString.call(t) === "[object Date]" && !isNaN(t)) {
    return { h: t.getHours(), m: t.getMinutes() };
  }

  if (typeof t === "number" && !isNaN(t)) {
    const totalMinutes = Math.round(t * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return { h, m };
  }

  const s = normalizeTimeString_(String(t).trim());
  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;

  let h = Number(m[1]);
  let min = m[2] ? Number(m[2]) : 0;
  const ap = m[3] ? m[3].toLowerCase() : null;

  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (min < 0 || min > 59) return null;

  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else {
    if (h < 0 || h > 23) return null;
  }

  return { h, m: min };
}
```

## Optional hardening

- Add `Logger.log({ dateValType: typeof dateVal, timeValType: typeof timeVal, timeVal })` before parsing.
- Standardize the Sheet "Time" column format to a true time value.
- Add a debug column (e.g. `Last Error`) when `appointment` resolves to `null`.
