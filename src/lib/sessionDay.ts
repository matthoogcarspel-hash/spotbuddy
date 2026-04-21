const formatDatePart = (value: number) => String(value).padStart(2, '0');

export const getLocalDateKey = (dateValue: Date) =>
  `${dateValue.getFullYear()}-${formatDatePart(dateValue.getMonth() + 1)}-${formatDatePart(dateValue.getDate())}`;

export const getTodayLocalDateKey = () => getLocalDateKey(new Date());

export const getTomorrowLocalDateKey = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getLocalDateKey(tomorrow);
};
