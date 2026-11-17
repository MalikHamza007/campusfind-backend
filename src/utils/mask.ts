/** Mask long digit runs (ID numbers) leaving the last 3 digits: GSU-2023-CS-041 stays readable, 35202-1234567-1 is masked. */
export function maskIdNumbers(text: string | undefined | null): string | undefined {
  if (!text) return text ?? undefined;
  return text.replace(/\d[\d\- ]{6,}\d/g, (m) => {
    const digits = m.replace(/\D/g, '');
    if (digits.length < 7) return m;
    return '•'.repeat(Math.max(0, m.length - 3)) + m.slice(-3);
  });
}
