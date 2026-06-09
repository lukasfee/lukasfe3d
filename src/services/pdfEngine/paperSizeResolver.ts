export interface PaperConfig {
  widthMm: number;
  heightMm: number;
  isDynamicHeight: boolean;
  type: 'thermal' | 'label' | 'sheet';
  name: string;
}

export function resolveCanonicalPaperSize(paramSize: string, customOverrides?: any): PaperConfig {
  const size = (paramSize || '').toLowerCase();
  
  let widthMm = 80;
  let heightMm = 297;
  let isDynamicHeight = true;
  let type: 'thermal' | 'label' | 'sheet' = 'thermal';

  if (size.includes('a4')) {
    widthMm = 210;
    heightMm = 297;
    isDynamicHeight = false;
    type = 'sheet';
  } else if (size.includes('a5')) {
    widthMm = 148;
    heightMm = 210;
    isDynamicHeight = false;
    type = 'sheet';
  } else if (size.includes('a6')) {
    widthMm = 105;
    heightMm = 148;
    isDynamicHeight = false;
    type = 'sheet';
  } else if (size.includes('10x15') || size.includes('4x6')) {
    widthMm = 101.6;
    heightMm = 152.4;
    isDynamicHeight = false;
    type = 'label';
  } else if (size.includes('58mm')) {
    widthMm = 58;
    heightMm = 297;
    isDynamicHeight = true;
    type = 'thermal';
  } else if (size.includes('80mm')) {
    widthMm = 80;
    heightMm = 297;
    isDynamicHeight = true;
    type = 'thermal';
  }

  if (customOverrides?.widthMm) widthMm = Number(customOverrides.widthMm);
  if (customOverrides?.heightMm) heightMm = Number(customOverrides.heightMm);

  return {
    widthMm,
    heightMm,
    isDynamicHeight,
    type,
    name: paramSize || '80mm térmico'
  };
}
