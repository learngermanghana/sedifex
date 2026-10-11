type Row = Record<string, any>
function first(...values: unknown[]) { return values.find(value => typeof value === 'string' && value.trim()) as string | undefined }
export function bookingSchedule(data: Row) {
  return { date: (first(data.bookingDate, data.booking_date, data.date, data.booking?.preferredDate, data.booking?.preferred_date, data.booking?.date) || '').trim(), time: (first(data.bookingTime, data.booking_time, data.time, data.booking?.preferredTime, data.booking?.preferred_time, data.booking?.time) || '').trim() }
}
export function hasAttendanceConfirmation(data: Row) {
  const saved = data.customerAttendanceConfirmation
  const schedule = bookingSchedule(data)
  return Boolean(saved?.confirmedAt && schedule.date && saved.date === schedule.date && saved.time === schedule.time)
}
export function canConfirmAttendance(data: Row) {
  const status = String(data.bookingStatus ?? data.booking_status ?? data.status ?? data.booking?.status ?? '').trim().toLowerCase()
  return ['confirmed', 'rescheduled'].includes(status) && Boolean(bookingSchedule(data).date) && data.customerPortalRequest?.status !== 'pending'
}
