/**
 * Helper central monetário reutilizável
 * Garante arredondamento matemático consistente de ponto flutuante (IEEE 754) para 2 casas decimais.
 */

export function roundMoney(value: any): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function safeAdd(...values: any[]): number {
  let sum = 0;
  for (const v of values) {
    sum += roundMoney(v);
  }
  return roundMoney(sum);
}

export function safeSubtract(base: any, ...deductions: any[]): number {
  const baseNum = roundMoney(base);
  let deductionsSum = 0;
  for (const v of deductions) {
    deductionsSum += roundMoney(v);
  }
  return roundMoney(baseNum - deductionsSum);
}

export function safeMultiply(a: any, b: any): number {
  const numA = roundMoney(a);
  const numB = roundMoney(b);
  return roundMoney(numA * numB);
}

export function safeDivide(a: any, b: any): number {
  const numA = roundMoney(a);
  const numB = roundMoney(b);
  if (numB === 0) return 0;
  return roundMoney(numA / numB);
}

export function safePercent(value: any, percentage: any): number {
  const numVal = roundMoney(value);
  const numPct = roundMoney(percentage);
  return roundMoney((numVal * numPct) / 100);
}
