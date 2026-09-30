/** "1" → "01": the frame's pill numbers are two digits. */
export const two = (n: number): string => String(n).padStart(2, '0');
