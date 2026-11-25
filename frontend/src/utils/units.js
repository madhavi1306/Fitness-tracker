export const kgToLbs = (kg) => Number(kg) * 2.20462;
export const lbsToKg = (lbs) => Number(lbs) / 2.20462;
export const displayWeight = (kg, unit) => unit === 'lbs' ? kgToLbs(kg) : Number(kg);
export const weightFromDisplay = (value, unit) => unit === 'lbs' ? lbsToKg(value) : Number(value);
