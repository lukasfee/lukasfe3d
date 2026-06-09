import QRCode from 'qrcode';
import { DOCUMENT_SIZES } from '../documentSizes';

export interface ThemeColors {
  badgeBg: string;
  badgeText: string;
  textAccent: string;
  borderAccent: string;
  bgAccent: string;
  totalContainer: string;
  totalText: string;
  highlightText: string;
}

export const THEME_COLOR_MAP: Record<string, ThemeColors> = {
  classic: {
    badgeBg: '#18181b',
    badgeText: '#ffffff',
    textAccent: '#18181b',
    borderAccent: '#e4e4e7',
    bgAccent: '#f4f4f5',
    totalContainer: 'border-top: 1px solid #18181b; color: #000000;',
    totalText: '#09090b',
    highlightText: '#be123c'
  },
  emerald: {
    badgeBg: '#059669',
    badgeText: '#ffffff',
    textAccent: '#047857',
    borderAccent: '#10b981',
    bgAccent: '#ecfdf5',
    totalContainer: 'border-top: 2px solid #059669; color: #065f46;',
    totalText: '#022c22',
    highlightText: '#059669'
  },
  indigo: {
    badgeBg: '#4f46e5',
    badgeText: '#ffffff',
    textAccent: '#4338ca',
    borderAccent: '#4f46e5',
    bgAccent: '#e0e7ff',
    totalContainer: 'border-top: 2px solid #4f46e5; color: #3730a3;',
    totalText: '#1e1b4b',
    highlightText: '#4f46e5'
  },
  crimson: {
    badgeBg: '#e11d48',
    badgeText: '#ffffff',
    textAccent: '#be123c',
    borderAccent: '#e11d48',
    bgAccent: '#fff1f2',
    totalContainer: 'border-top: 2px solid #e11d48; color: #9f1239;',
    totalText: '#4c0519',
    highlightText: '#rose-600'
  },
  slate: {
    badgeBg: '#475569',
    badgeText: '#ffffff',
    textAccent: '#334155',
    borderAccent: '#475569',
    bgAccent: '#f8fafc',
    totalContainer: 'border-top: 2px solid #475569; color: #334155;',
    totalText: '#0f172a',
    highlightText: '#475569'
  },
  amber: {
    badgeBg: '#f59e0b',
    badgeText: '#000000',
    textAccent: '#b45309',
    borderAccent: '#f59e0b',
    bgAccent: '#fffbeb',
    totalContainer: 'border-top: 2px solid #f59e0b; color: #451a03;',
    totalText: '#451a03',
    highlightText: '#b45309'
  },
  violet: {
    badgeBg: '#7c3aed',
    badgeText: '#ffffff',
    textAccent: '#6d28d9',
    borderAccent: '#7c3aed',
    bgAccent: '#f5f3ff',
    totalContainer: 'border-top: 2px solid #7c3aed; color: #5b21b6;',
    totalText: '#2e1065',
    highlightText: '#7c3aed'
  },
  orange: {
    badgeBg: '#ea580c',
    badgeText: '#ffffff',
    textAccent: '#c2410c',
    borderAccent: '#ea580c',
    bgAccent: '#fff7ed',
    totalContainer: 'border-top: 2px solid #ea580c; color: #9a3412;',
    totalText: '#431407',
    highlightText: '#ea580c'
  },
  teal: {
    badgeBg: '#0d9488',
    badgeText: '#ffffff',
    textAccent: '#0f766e',
    borderAccent: '#0d9488',
    bgAccent: '#f0fdfa',
    totalContainer: 'border-top: 2px solid #0d9488; color: #115e59;',
    totalText: '#042f2e',
    highlightText: '#0d9488'
  },
  fuchsia: {
    badgeBg: '#c026d3',
    badgeText: '#ffffff',
    textAccent: '#a21caf',
    borderAccent: '#c026d3',
    bgAccent: '#fdf4ff',
    totalContainer: 'border-top: 2px solid #c026d3; color: #86198f;',
    totalText: '#4a044e',
    highlightText: '#c026d3'
  }
};

export function getThemeColors(theme: string = 'classic', customColor?: string): ThemeColors {
  if (theme === 'custom' && customColor) {
    return {
      badgeBg: customColor,
      badgeText: '#ffffff',
      textAccent: customColor,
      borderAccent: customColor,
      bgAccent: `${customColor}1a`, // Roughly 10% opacity
      totalContainer: `border-top: 2px solid ${customColor}; color: ${customColor};`,
      totalText: customColor,
      highlightText: customColor
    };
  }
  return THEME_COLOR_MAP[theme] || THEME_COLOR_MAP.classic;
}

export function getSafeCssUrl(bgImage: string): string {
  if (!bgImage) return '';
  if (bgImage.startsWith('data:image/svg+xml;utf8,')) {
    const rawSvg = bgImage.substring('data:image/svg+xml;utf8,'.length);
    const encoded = encodeURIComponent(rawSvg)
      .replace(/'/g, '%27')
      .replace(/"/g, '%22');
    return `url('data:image/svg+xml;charset=utf-8,${encoded}')`;
  }
  const escaped = bgImage.replace(/'/g, "\\'");
  return `url('${escaped}')`;
}

export function buildWatermarkHtml(config: any, themeObj: any, forLabel: boolean = false): string {
  if (!themeObj || themeObj.active === false || !themeObj.backgroundImage) return '';

  const isLabelDoc = config?.customFields?.labelWidth !== undefined || config?.customFields?.labelHeight !== undefined || themeObj.category === 'label';

  // Strict Enforcements: Labels only use Label category, Standard documents only use Standard category
  if (forLabel && themeObj.category !== 'label') return '';
  if (!forLabel && themeObj.category === 'label') return '';

  // STRICT GLOBAL RULE: For label themes or label documents, the background has to be on the individual label itself, not the paper sheet!
  if (isLabelDoc && !forLabel) return '';

  let bgSize = 'auto';
  let bgRepeat = 'no-repeat';
  let bgPosition = 'center';

  const fitModeToUse = forLabel ? (themeObj.fitMode || 'contain') : (themeObj.fitMode || 'center');

  if (fitModeToUse === 'cover') {
    bgSize = 'cover';
    bgRepeat = 'no-repeat';
  } else if (fitModeToUse === 'contain') {
    bgSize = 'contain';
    bgRepeat = 'no-repeat';
  } else if (fitModeToUse === 'repeat') {
    bgSize = 'auto';
    bgRepeat = 'repeat';
  } else if (fitModeToUse === 'center') {
    bgSize = 'auto';
    bgRepeat = 'no-repeat';
  }

  const opacityValue = (themeObj.opacity ?? 20) / 100;

  return `
    <div class="print-background-watermark" data-theme-id="${themeObj.id}" style="
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      overflow: hidden;
      border-radius: inherit;
      background-image: ${getSafeCssUrl(themeObj.backgroundImage)};
      background-size: ${bgSize};
      background-repeat: ${bgRepeat};
      background-position: ${bgPosition};
      opacity: ${opacityValue};
      z-index: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    "></div>
  `;
}

export async function generateQrCodeSvg(value: string): Promise<string> {
  try {
    const rawSvg = await QRCode.toString(value || 'No-Value', {
      type: 'svg',
      margin: 0,
    });
    // Remove absolute width/height declarations to let it scale fluidly with CSS
    return rawSvg
      .replace(/width="[^"]+"/, 'width="100%"')
      .replace(/height="[^"]+"/, 'height="100%"');
  } catch (err) {
    console.error('Failed to generate QR Code SVG:', err);
    return `<svg width="100%" height="100%" viewBox="0 0 100 100">
      <rect width="100" height="100" fill="#f4f4f5"/>
      <text x="50" y="55" font-size="10" font-family="monospace" text-anchor="middle" fill="#dc2626">ERROR</text>
    </svg>`;
  }
}
