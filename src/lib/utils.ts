import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractOrderNumberFromScan(text: string): string {
  if (!text) return '';
  
  let result = text.trim();

  // 1. Check for JSON
  if (result.startsWith('{') && result.endsWith('}')) {
    try {
      const parsed = JSON.parse(result);
      // Try common keys in Portuguese and English
      const orderVal = parsed.numero_pedido || parsed.id_pedido || parsed.id_venda || parsed.pedido || parsed.order || parsed.orderNumber || parsed.order_number || parsed.saleId || parsed.id;
      if (orderVal) return String(orderVal).trim();
    } catch (e) {
      // Not valid JSON, continue
    }
  }

  // 2. Check for URLs
  try {
    if (result.toLowerCase().startsWith('http')) {
      const url = new URL(result);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1];
        // If last part is a number or looks like an ID, return it
        if (lastPart) return lastPart.trim();
      }
    }
  } catch (e) {
    // Not a valid URL, continue
  }

  // 3. Check for specific prefixes and separators
  // Matches: "Pedido: 123", "Order: 123", "#123", etc.
  // Also handles "Pedido: 123 | Cliente: Lucas"
  if (result.includes('|')) {
    const firstPart = result.split('|')[0].trim();
    // Recursive call to handle prefix in the first part
    return extractOrderNumberFromScan(firstPart);
  }

  // Regex patterns for common prefixes
  const patterns = [
    /^(?:Pedido|Order|Venda|#):\s*([A-Za-z0-9-]+)/i,
    /^([A-Za-z0-9-]+)$/ // Pure alphanumeric/hyphen string
  ];

  for (const pattern of patterns) {
    const match = result.match(pattern);
    if (match && match[1]) return match[1].trim();
  }

  // Clean "ORDER-" or "#" prefix if still there
  result = result.replace(/^(ORDER-|#)/i, '');

  // If it contains spaces, it's probably a sentence we couldn't parse correctly
  // If it's just one word now, return it
  if (!result.includes(' ')) {
    return result;
  }

  // Last resort: take first word if it looks like an ID (alphanumeric)
  const words = result.split(/\s+/);
  if (words[0] && /^[A-Za-z0-9-]+$/.test(words[0])) {
    return words[0];
  }

  return result;
}
