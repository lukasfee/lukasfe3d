import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface StandardQRCodeProps {
  id?: string;
  value: string;
  size?: number;
  className?: string;
}

export const StandardQRCode: React.FC<StandardQRCodeProps & { fgColor?: string; bgColor?: string; qrTransparent?: boolean; qrRounded?: boolean } & React.HTMLAttributes<HTMLDivElement>> = ({
  id,
  value,
  size = 120,
  className = '',
  fgColor = '#18181B',
  bgColor = '#FFFFFF',
  qrTransparent = false,
  qrRounded = false,
  ...rest
}) => {
  // Pad size slightly for the wrapper to enclose the padding nicely
  const wrapperSize = size + 16; // 8px padding on each side (p-2)
  const resolvedBgColor = qrTransparent ? "transparent" : bgColor;

  return (
    <div
      id={id}
      className={`relative inline-flex items-center justify-center p-2 border border-zinc-200/10 ${className}`}
      style={{ 
        width: wrapperSize, 
        height: wrapperSize,
        backgroundColor: resolvedBgColor,
        borderRadius: qrRounded ? '50%' : '1rem',
      }}
      {...rest}
    >
      <div 
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'transparent' }}
      >
        <QRCodeSVG
          value={value}
          size={size}
          bgColor={qrTransparent ? "transparent" : bgColor}
          fgColor={fgColor}
          level="H"
          includeMargin={false}
        />
      </div>
    </div>
  );
};
