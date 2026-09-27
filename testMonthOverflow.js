const initialDateStr = '2026-01-31';
const dueDayOfMonth = 31;
const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

for (let i = 1; i <= 4; i++) {
  const newDate = new Date(initialDateStr);
  newDate.setDate(1);
  newDate.setMonth(newDate.getMonth() + (i - 1));
  newDate.setDate(Math.min(dueDayOfMonth, daysInMonth(newDate)));
  const dueDateStr = new Date(newDate.getTime() - (newDate.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  console.log(`Instalment ${i}: ${dueDateStr}`);
}
