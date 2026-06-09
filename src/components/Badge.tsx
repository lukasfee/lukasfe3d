import React from "react";
import { useStore, User as SystemUser, BadgeConfig } from "../store";
import { StandardQRCode } from "./StandardQRCode";
import { cn } from "../lib/utils";
import { Shield, QrCode as QrCodeIcon, RefreshCw } from "lucide-react";

interface BadgeProps {
  user?: SystemUser;
  role: string;
  config: BadgeConfig;
  viewType: "frente" | "verso";
  preview?: boolean;
  ignorePaper?: boolean;
  id?: string;
}

export default function Badge({
  user,
  role,
  config,
  viewType,
  preview = false,
  ignorePaper = false,
  id,
}: BadgeProps) {
  const company = useStore((state) => state.company);
  const updateUserQRCode = useStore((state) => state.updateUserQRCode);
  const badges = useStore((state) => state.badges) || [];

  const linkedBadge = user?.badgeId
    ? badges.find((b) => b.id === user.badgeId)
    : null;
  const qrCodeValue = linkedBadge
    ? linkedBadge.codigoCracha
    : user?.qrCodeToken;

  const widthMm = config.badgeWidth || 54;
  const heightMm = config.badgeHeight || 85.6;
  const isHorizontal = widthMm > heightMm;

  // Keep the preview at the actual physical dimensions (1:1 scale) of a badge.
  const previewMultiplier = 1;
  const widthMmScaled = widthMm * previewMultiplier;
  const heightMmScaled = heightMm * previewMultiplier;

  // Standard proportional scaling factor
  // vertical reference is 54mm.
  const scale = (Math.min(widthMm, heightMm) / 54) * previewMultiplier;

  const template = config.template || "corporate";

  // Resolve role-based automatic theme if enabled
  const lowercaseRole = (role || "").toLowerCase();
  let primaryColorOverride = config.primaryColor;
  let secondaryColorOverride = config.secondaryColor;
  let accentColorOverride = config.accentColor;
  let backColorOverride = config.backColor;

  if (config.autoRoleStyleEnabled) {
    if (lowercaseRole.includes("admin") || lowercaseRole.includes("geren")) {
      primaryColorOverride = "#0891b2"; // ADM/Gerência: Cyan
      secondaryColorOverride = "#083344";
      accentColorOverride = "#22d3ee";
      backColorOverride = "#083344";
    } else if (lowercaseRole.includes("fat") || lowercaseRole.includes("fin") || lowercaseRole.includes("sad") || lowercaseRole.includes("bureau")) {
      primaryColorOverride = "#7c3aed"; // Faturamento/Financial: Purple
      secondaryColorOverride = "#2e1065";
      accentColorOverride = "#c084fc";
      backColorOverride = "#2e1065";
    } else if (lowercaseRole.includes("sep") || lowercaseRole.includes("conf") || lowercaseRole.includes("est") || lowercaseRole.includes("wms") || lowercaseRole.includes("operador")) {
      primaryColorOverride = "#d97706"; // WMS/Stock/Separadores: Amber
      secondaryColorOverride = "#451a03";
      accentColorOverride = "#fbbf24";
      backColorOverride = "#451a03";
    } else {
      primaryColorOverride = "#059669"; // Standard: Green
      secondaryColorOverride = "#064e3b";
      accentColorOverride = "#34d399";
      backColorOverride = "#064e3b";
    }
  }

  // Resolve colors with fallbacks based on template
  const colors = {
    primary:
      primaryColorOverride ||
      (template === "modern"
        ? "#4f46e5"
        : template === "simple"
          ? "#f8f8f8"
          : "#059669"),
    secondary:
      secondaryColorOverride ||
      (template === "modern"
        ? "#1e1b4b"
        : template === "simple"
          ? "#ffffff"
          : "#064e3b"),
    accent:
      accentColorOverride ||
      (template === "modern"
        ? "#818cf8"
        : template === "simple"
          ? "#000000"
          : "#10b981"),
    text: config.textColor || (template === "simple" ? "#000000" : "#ffffff"),
    back:
      backColorOverride ||
      (template === "modern"
        ? "#1e1b4b"
        : template === "simple"
          ? "#ffffff"
          : "#064e3b"),
    border: config.borderColor || "rgba(0,0,0,0.1)",
    qrContainer: config.qrContainerColor || "#ffffff",
  };

  const handleGenerateToken = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.id) {
      updateUserQRCode(user.id);
    }
  };

  // Helper to convert hex to RGB for alpha adjustments
  const hexToRgb = (hex: string) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (_, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '16, 185, 129';
  };

  // Proportional sizing helper functions to prevent overlapping and clipping
  const getFontSize = (basePx: number) => `${basePx * scale}px`;
  const getPadding = (basePx: number) => `${basePx * scale}px`;
  const getMargin = (basePx: number) => `${basePx * scale}px`;
  const getGap = (basePx: number) => `${basePx * scale}px`;
  const getBorderRadius = (basePx: number) => `${basePx * scale}px`;

  // Build texture overlay CSS styles
  const getTextureStyle = () => {
    let styles: React.CSSProperties = {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 1,
      opacity: (config.backOpacity !== undefined ? config.backOpacity / 100 : 0.4),
    };

    switch (config.bgPatternType) {
      case 'carbon':
        styles = {
          ...styles,
          backgroundImage: 'linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.15)), linear-gradient(45deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0.15))',
          backgroundSize: `${4 * scale}px ${4 * scale}px`,
          backgroundPosition: `0 0, ${2 * scale}px ${2 * scale}px`,
        };
        break;
      case 'hexagons':
        styles = {
          ...styles,
          backgroundImage: `radial-gradient(rgba(255,255,255,${viewType === 'verso' ? 0.08 : 0.15}) 1.2px, transparent 1.2px), radial-gradient(rgba(255,255,255,${viewType === 'verso' ? 0.08 : 0.15}) 1.2px, transparent 1.2px)`,
          backgroundSize: `${10 * scale}px ${10 * scale}px`,
          backgroundPosition: `0 0, ${5 * scale}px ${5 * scale}px`,
        };
        break;
      case 'industrial':
        styles = {
          ...styles,
          backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.03), rgba(0,0,0,0.03) 6px, transparent 6px, transparent 12px)',
        };
        break;
      case 'circuits':
        styles = {
          ...styles,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: `${14 * scale}px ${14 * scale}px`,
        };
        break;
      case 'glass':
        styles = {
          ...styles,
          backdropFilter: 'blur(10px)',
          backgroundColor: viewType === 'verso' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
        };
        break;
      case 'gradient':
        styles = {
          ...styles,
          backgroundImage: `linear-gradient(135deg, ${colors.primary}22, ${colors.accent}11)`,
        };
        break;
      default:
        return null;
    }
    return styles;
  };

  const getCardBorderStyle = () => {
    const borderStyle: React.CSSProperties = {};
    const width = config.borderWidthPx !== undefined ? config.borderWidthPx : 1;
    const color = config.borderColor || colors.primary;

    switch (config.borderStyleType) {
      case 'glow':
        borderStyle.border = `${width}px solid ${color}`;
        borderStyle.boxShadow = `0 0 ${scale * 12}px rgba(${config.accentColor ? hexToRgb(config.accentColor) : '16,185,129'}, ${config.glowIntensity !== undefined ? config.glowIntensity / 100 : 0.5})`;
        break;
      case 'double':
        borderStyle.border = `${width * 2}px double ${color}`;
        break;
      case 'neon':
        borderStyle.border = `${width}px solid ${config.accentColor || '#10b981'}`;
        borderStyle.boxShadow = `0 0 ${scale * 8}px ${config.accentColor || '#10b981'}, inset 0 0 ${scale * 4}px ${config.accentColor || '#10b981'}`;
        break;
      case 'minimalist':
        borderStyle.border = `0.5px solid rgba(0,0,0,0.08)`;
        break;
      case 'metallic':
        borderStyle.border = `${width}px solid ${color}`;
        borderStyle.backgroundImage = 'linear-gradient(135deg, #cbd5e1 0%, #cbd5e1 50%, #64748b 100%)';
        break;
      case 'dashed':
        borderStyle.border = `${width}px dashed ${color}`;
        break;
      case 'solid':
      default:
        borderStyle.border = `${width}px solid ${color}`;
        break;
    }
    return borderStyle;
  };

  // Photo styling helper
  const getPhotoStyle = () => {
    const radius = config.photoShape === 'round' ? '50%' : config.photoShape === 'square' ? '0px' : getBorderRadius(8);
    const multiplier = config.photoSizeMultiplier !== undefined ? config.photoSizeMultiplier : 1;
    const borderWeight = config.photoBorderWidthPx !== undefined ? config.photoBorderWidthPx : 2;
    const borderColor = config.photoBorderColor || colors.primary;
    
    let shadow = 'none';
    if (config.photoShadow === 'sm') shadow = '0 1px 2px rgba(0,0,0,0.05)';
    else if (config.photoShadow === 'md') shadow = '0 4px 6px rgba(0,0,0,0.1)';
    else if (config.photoShadow === 'glow') shadow = `0 0 8px rgba(${hexToRgb(borderColor)}, 0.6)`;

    return {
      borderRadius: radius,
      transform: `scale(${multiplier})`,
      border: `${borderWeight}px solid ${borderColor}`,
      boxShadow: shadow,
    };
  };

  const getPhotoAlignClass = () => {
    switch (config.photoPosition) {
      case 'top': return 'items-start pt-2';
      case 'bottom': return 'items-end pb-2';
      case 'left': return 'justify-start pl-4';
      case 'right': return 'justify-end pr-4';
      case 'center':
      default: return 'items-center justify-center';
    }
  };

  const getCardShadowStyle = () => {
    if (!preview) return {};
    let shadow = '0 20px 40px rgba(0,0,0,0.3)';
    switch (config.cardShadow) {
      case 'none': shadow = 'none'; break;
      case 'sm': shadow = '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'; break;
      case 'md': shadow = '0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -2px rgba(0,0,0,0.15)'; break;
      case 'lg': shadow = '0 25px 50px -12px rgba(0,0,0,0.5), 0 12px 24px -8px rgba(0,0,0,0.3)'; break;
      case 'glow': shadow = `0 0 ${scale * 24}px rgba(${hexToRgb(colors.primary)}, 0.45)`; break;
      case 'neon': shadow = `0 0 ${scale * 20}px ${colors.accent || '#10b981'}`; break;
    }
    return { boxShadow: shadow };
  };

  const getNameStyle = (baseSize: number) => {
    const customSize = config.nameFontSize ? config.nameFontSize : baseSize;
    let fontWeightValue = '900';
    if (config.nameFontWeight === 'normal') fontWeightValue = '400';
    else if (config.nameFontWeight === 'semibold') fontWeightValue = '600';
    else if (config.nameFontWeight === 'bold') fontWeightValue = '700';
    else if (config.nameFontWeight === 'black') fontWeightValue = '900';

    const alignmentValue = config.nameAlignment || 'center';

    return {
      fontSize: getFontSize(customSize),
      fontWeight: fontWeightValue,
      textAlign: alignmentValue as any,
    };
  };

  const formattedName = user?.fullName
    ? (config.nameUppercase !== false ? user.fullName.toUpperCase() : user.fullName)
    : "NOME DO COLABORADOR";

  // Render Front Content (Frente)
  const renderFront = () => {
    if (isHorizontal) {
      // LANDSCAPE / HORIZONTAL FRONT LAYOUT
      return (
        <div className="w-full h-full flex flex-col items-stretch overflow-hidden select-none relative z-10 bg-transparent">
          {/* Header Banner - Horizontal Style */}
          <div
            className="w-full flex items-center justify-between border-b"
            style={{
              backgroundColor: config.headerColor || colors.primary,
              borderColor: "rgba(0,0,0,0.05)",
              color: colors.text,
              height: `${scale * 9.5}mm`,
              minHeight: `${scale * 9.5}mm`,
              paddingLeft: getPadding(10),
              paddingRight: getPadding(10),
              backgroundImage: config.gradient && !config.headerColor
                ? `linear-gradient(to right, ${colors.primary}, ${colors.secondary})`
                : "none",
            }}
          >
            <h4
              className="font-black uppercase tracking-widest truncate max-w-[70%]"
              style={{ fontSize: getFontSize(9.5), color: config.roleColor || undefined }}
            >
              {config.showRole !== false ? role : "CRACHÁ DE ACESSO"}
            </h4>
            <span
              className="font-black uppercase tracking-[0.12em] border rounded-full px-1.5 py-0.5 whitespace-nowrap"
              style={{
                fontSize: getFontSize(6.5),
                borderColor: `${colors.text}33`,
                opacity: 0.85,
              }}
            >
              Colaborador
            </span>
          </div>

          {/* Body Content Details - Horizontal Split */}
          <div className="flex-1 flex flex-row items-stretch min-h-0 bg-transparent relative z-10">
            {/* Left Column: Frame Photo */}
            {config.showPhoto !== false && (
              <div
                className="flex items-center justify-center shrink-0 border-r"
                style={{
                  width: `${scale * 28}mm`,
                  borderColor: "rgba(0,0,0,0.05)",
                  padding: getPadding(6),
                }}
              >
                <div
                  className={cn(
                    "bg-white flex items-center justify-center relative group",
                    preview && "shadow-inner shadow-black/10",
                  )}
                  style={{
                    width: `${scale * 20}mm`,
                    height: `${scale * 26}mm`,
                    backgroundColor: "#ffffff",
                    padding: `${scale * 1}mm`,
                    zIndex: 2,
                    ...getPhotoStyle() as any
                  }}
                >
                  {user?.image ? (
                    <div
                      className="w-full h-full"
                      style={{
                        borderRadius: config.photoShape === 'round' ? '50%' : config.photoShape === 'square' ? '0px' : getBorderRadius(6),
                        backgroundImage: `url(${user.image})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                        imageRendering: "auto",
                        transform: "translateZ(0)",
                        backfaceVisibility: "hidden",
                      }}
                      role="img"
                      aria-label={`Foto de ${user.fullName || "User"}`}
                    />
                  ) : (
                    <div
                      className="flex flex-col items-center text-black"
                      style={{ opacity: preview ? 0.2 : 0.8, gap: getGap(3) }}
                    >
                      <Shield
                        style={{
                          width: `${scale * 22}px`,
                          height: `${scale * 22}px`,
                        }}
                      />
                      <span
                        className="font-black uppercase tracking-widest text-center"
                        style={{ fontSize: getFontSize(5.5) }}
                      >
                        Sem Foto
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Right Column: Text Metadata & QR */}
            <div
              className="flex-1 flex flex-col justify-between min-w-0 bg-transparent relative z-10"
              style={{ padding: getPadding(8) }}
            >
              <div
                className="flex-1 flex flex-col justify-center text-left min-w-0"
                style={{ gap: getGap(2) }}
              >
                <span
                  className="font-black uppercase tracking-widest block w-fit"
                  style={{
                    fontSize: getFontSize(6),
                    padding: `${scale * 1}px ${scale * 6}px`,
                    marginBottom: `${scale * 1}px`,
                    borderRadius: getBorderRadius(50),
                    backgroundColor: `${colors.primary}1A`,
                    color: template === "simple" ? "#000000" : colors.primary,
                  }}
                >
                  Identificação
                </span>
                {config.showName !== false && (
                  <h3
                    className="font-black uppercase tracking-tight text-gray-900 leading-tight block w-full truncate"
                    style={{ ...getNameStyle(11.5) as any, color: config.textColor || undefined }}
                  >
                    {formattedName}
                  </h3>
                )}
                {config.showFunction !== false && user?.primaryFunction && (
                  <div
                    className="font-bold uppercase text-gray-500 truncate w-full"
                    style={{
                      fontSize: getFontSize(config.roleFontSize || 8),
                      color: config.roleColor || undefined,
                      marginTop: `${scale * 1}px`,
                    }}
                  >
                    {user.primaryFunction}
                  </div>
                )}
              </div>

              {/* Bottom Row inside horizontal details */}
              <div
                className="flex items-center justify-between border-t border-black/5 w-full shrink-0 min-w-0"
                style={{ paddingTop: getPadding(5) }}
              >
                <div
                  className="flex flex-row flex-wrap items-center gap-y-0.5 max-w-[70%] min-w-0"
                  style={{ gap: getGap(8) }}
                >
                  {config.showMatricula !== false && (
                    <div className="text-left min-w-0">
                      <span
                        className="font-black text-gray-400 uppercase tracking-widest block"
                        style={{ fontSize: getFontSize(5.5) }}
                      >
                        Matrícula
                      </span>
                      <span
                        className="font-bold uppercase leading-none text-gray-700 block truncate max-w-[55px]"
                        style={{ fontSize: getFontSize(config.matriculaFontSize || 8) }}
                      >
                        {user?.matricula || user?.login || "---"}
                      </span>
                    </div>
                  )}
                  {config.showStore !== false && user?.loja && (
                    <div className="text-left min-w-0">
                      <span
                        className="font-black text-gray-400 uppercase tracking-widest block"
                        style={{ fontSize: getFontSize(5.5) }}
                      >
                        Loja
                      </span>
                      <span
                        className="font-bold uppercase leading-none text-gray-700 block truncate max-w-[60px]"
                        style={{ fontSize: getFontSize(8) }}
                      >
                        {user.loja}
                      </span>
                    </div>
                  )}
                  {config.showSector !== false && user?.setor && (
                    <div className="text-left min-w-0">
                      <span
                        className="font-black text-gray-400 uppercase tracking-widest block"
                        style={{ fontSize: getFontSize(5.5), color: config.sectorColor || undefined }}
                      >
                        Setor
                      </span>
                      <span
                        className="font-bold uppercase leading-none text-gray-700 block truncate max-w-[60px]"
                        style={{ fontSize: getFontSize(8) }}
                      >
                        {user.setor}
                      </span>
                    </div>
                  )}
                </div>

                {/* Company Logo in place of QR Code */}
                {config.showLogo !== false && (
                  company.logo ? (
                    <img
                      src={company.logo}
                      alt={company.name}
                      referrerPolicy="no-referrer"
                      className="object-contain shrink-0"
                      style={{
                        width: `${(config.logoSize || 60) * 0.45 * scale}px`,
                        maxHeight: `${(config.logoSize || 60) * 0.45 * scale}px`,
                      }}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center font-black rounded border border-dashed select-none shrink-0"
                      style={{
                        width: `${(config.logoSize || 60) * 0.45 * scale}px`,
                        height: `${(config.logoSize || 60) * 0.3 * scale}px`,
                        fontSize: getFontSize(5.5),
                        borderColor: template === "simple" ? "rgba(0,0,0,0.15)" : `${colors.accent}33`,
                        backgroundColor: template === "simple" ? "rgba(0,0,0,0.03)" : `${colors.primary}1A`,
                        color: template === "simple" ? "rgba(0,0,0,0.4)" : colors.accent,
                      }}
                    >
                      LOGO
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      // PORTRAIT / VERTICAL FRONT LAYOUT
      return (
        <div className="w-full h-full flex flex-col items-center justify-between overflow-hidden select-none relative z-10 bg-transparent">
          {config.showRole !== false ? (
            <div
              className="w-full text-center flex flex-col items-center justify-center shrink-0"
              style={{
                backgroundColor: config.headerColor || colors.primary,
                color: colors.text,
                height: `${scale * 12}mm`,
                paddingLeft: getPadding(6),
                paddingRight: getPadding(6),
                backgroundImage: config.gradient && !config.headerColor
                  ? `linear-gradient(to right, ${colors.primary}, ${colors.secondary})`
                  : "none",
              }}
            >
              <span
                className="font-black uppercase tracking-[0.2em] block"
                style={{
                  fontSize: getFontSize(6.5),
                  opacity: preview ? 0.6 : 1,
                  marginBottom: `${scale * 1}px`,
                }}
              >
                Colaborador
              </span>
              <h4
                className="font-black uppercase tracking-widest leading-none truncate w-full"
                style={{ fontSize: getFontSize(10), color: config.roleColor || undefined }}
              >
                {role}
              </h4>
            </div>
          ) : (
            <div
              className="w-full text-center flex flex-col items-center justify-center shrink-0"
              style={{
                backgroundColor: config.headerColor || colors.primary,
                color: colors.text,
                height: `${scale * 7}mm`,
                paddingLeft: getPadding(6),
                paddingRight: getPadding(6),
                backgroundImage: config.gradient && !config.headerColor
                  ? `linear-gradient(to right, ${colors.primary}, ${colors.secondary})`
                  : "none",
              }}
            >
              <span
                className="font-black uppercase tracking-[0.15em] block"
                style={{ fontSize: getFontSize(7), opacity: preview ? 0.6 : 1 }}
              >
                CRACHÁ DE ACESSO
              </span>
            </div>
          )}

          {template !== "simple" && (
            <div
              className="absolute top-0 left-0 w-full -skew-y-6 pointer-events-none"
              style={{
                backgroundColor: colors.primary,
                opacity: 0.05,
                top: `${scale * 48}px`,
                height: `${scale * 28}px`,
              }}
            />
          )}

          {config.showPhoto !== false && (
            <div
              className={cn("flex-1 flex items-center justify-center z-10 w-full min-h-0", getPhotoAlignClass())}
              style={{ padding: `${scale * 3}px` }}
            >
              <div
                className={cn(
                  "bg-white flex items-center justify-center relative group shrink-0",
                  preview && "shadow-inner shadow-black/10",
                )}
                style={{
                  width: `${scale * 22}mm`,
                  height: `${scale * 29}mm`,
                  backgroundColor: "#ffffff",
                  padding: `${scale * 1.2}mm`,
                  zIndex: 2,
                  ...getPhotoStyle() as any
                }}
              >
                {user?.image ? (
                  <div
                    className="w-full h-full"
                    style={{
                      borderRadius: config.photoShape === 'round' ? '50%' : config.photoShape === 'square' ? '0px' : getBorderRadius(6),
                      backgroundImage: `url(${user.image})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundRepeat: "no-repeat",
                      imageRendering: "auto",
                      transform: "translateZ(0)",
                      backfaceVisibility: "hidden",
                    }}
                    role="img"
                    aria-label={`Foto de ${user.fullName || "User"}`}
                  />
                ) : (
                  <div
                    className="flex flex-col items-center text-black"
                    style={{ opacity: preview ? 0.2 : 0.8, gap: getGap(4) }}
                  >
                    <Shield
                      style={{
                        width: `${scale * 24}px`,
                        height: `${scale * 24}px`,
                      }}
                    />
                    <span
                      className="font-black uppercase tracking-widest text-center"
                      style={{ fontSize: getFontSize(6.5) }}
                    >
                      Sem Foto
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className="w-full text-center bg-white border-t border-black/5 z-10 flex flex-col items-center shrink-0"
            style={{ padding: getPadding(8) }}
          >
            <div
              style={{ marginBottom: getMargin(4) }}
              className="flex flex-col items-center w-full"
            >
              <span
                className="font-black uppercase tracking-widest block font-sans"
                style={{
                  fontSize: getFontSize(6.5),
                  padding: `${scale * 1}px ${scale * 6}px`,
                  marginBottom: getMargin(2),
                  borderRadius: getBorderRadius(50),
                  backgroundColor: `${colors.primary}1A`,
                  color: template === "simple" ? "#000000" : colors.primary,
                }}
              >
                Identificação
              </span>
              {config.showName !== false && (
                <h3
                  className="font-black uppercase tracking-tight text-gray-900 leading-tight truncate w-full"
                  style={{ ...getNameStyle(10.5) as any, color: config.textColor || undefined }}
                >
                  {formattedName}
                </h3>
              )}
              {config.showFunction !== false && user?.primaryFunction && (
                <span
                  className="font-bold text-gray-500 uppercase tracking-wide block truncate w-full mt-0.5"
                  style={{ 
                    fontSize: getFontSize(config.roleFontSize || 7.5),
                    color: config.roleColor || undefined,
                  }}
                >
                  {user.primaryFunction}
                </span>
              )}
            </div>

            {config.showLogo !== false && (
              company.logo ? (
                <img
                  src={company.logo}
                  alt={company.name}
                  referrerPolicy="no-referrer"
                  className="object-contain mb-2 shrink-0"
                  style={{
                    width: `${(config.logoSize || 60) * 0.7 * scale}px`,
                    maxHeight: `${(config.logoSize || 60) * 0.7 * scale}px`,
                  }}
                />
              ) : (
                <div
                  className="flex items-center justify-center font-black rounded-lg border border-dashed select-none mb-2 shadow-inner shrink-0"
                  style={{
                    width: `${(config.logoSize || 60) * 0.75 * scale}px`,
                    height: `${(config.logoSize || 60) * 0.5 * scale}px`,
                    fontSize: getFontSize(6.5),
                    borderColor: template === "simple" ? "rgba(0,0,0,0.15)" : `${colors.accent}33`,
                    backgroundColor: template === "simple" ? "rgba(0,0,0,0.03)" : `${colors.primary}1A`,
                    color: template === "simple" ? "rgba(0,0,0,0.4)" : colors.accent,
                  }}
                >
                  LOGO DA EMPRESA
                </div>
              )
            )}

            <div
              className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-black/5 w-full"
              style={{ paddingTop: getPadding(6) }}
            >
              {config.showMatricula !== false && (
                <div className="text-center">
                  <span
                    className="font-black text-gray-300 uppercase tracking-widest block"
                    style={{ fontSize: getFontSize(6) }}
                  >
                    Matrícula
                  </span>
                  <span
                    className="font-bold uppercase leading-none text-gray-700"
                    style={{ fontSize: getFontSize(config.matriculaFontSize || 8) }}
                  >
                    {user?.matricula || user?.login || "---"}
                  </span>
                </div>
              )}
              {config.showStore !== false && user?.loja && (
                <div className="text-center">
                  <span
                    className="font-black text-gray-300 uppercase tracking-widest block"
                    style={{ fontSize: getFontSize(6) }}
                  >
                    Loja
                  </span>
                  <span
                    className="font-bold uppercase leading-none text-gray-700"
                    style={{ fontSize: getFontSize(8) }}
                  >
                    {user.loja}
                  </span>
                </div>
              )}
              {config.showSector !== false && user?.setor && (
                <div className="text-center">
                  <span
                    className="font-black text-gray-300 uppercase tracking-widest block font-sans"
                    style={{ fontSize: getFontSize(6), color: config.sectorColor || undefined }}
                  >
                    Setor
                  </span>
                  <span
                    className="font-bold uppercase leading-none text-gray-700"
                    style={{ fontSize: getFontSize(8) }}
                  >
                    {user.setor}
                  </span>
                </div>
              )}
              <div className="text-center">
                <span
                  className="font-black text-gray-300 uppercase tracking-widest block"
                  style={{ fontSize: getFontSize(6) }}
                >
                  Acesso
                </span>
                <span
                  className="font-bold uppercase leading-none text-gray-700"
                  style={{ fontSize: getFontSize(8) }}
                >
                  {user?.isAdmin ? "ADMIN" : "USER"}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  // Render Back Content (Verso)
  const renderBack = () => {
    if (isHorizontal) {
      // LANDSCAPE / HORIZONTAL BACK LAYOUT
      return (
        <div
          className="w-full h-full flex flex-row items-stretch select-none overflow-hidden"
          style={{ color: colors.text }}
        >
          {/* Left Column: QR Code & Access Badge */}
          <div
            className="flex flex-col items-center justify-center shrink-0 border-r"
            style={{
              width: `${scale * 28}mm`,
              backgroundColor: "rgba(0,0,0,0.12)",
              borderColor: "rgba(255,255,255,0.05)",
              padding: getPadding(8),
              gap: getGap(4),
            }}
          >
            {config.showQRCode ? (
              qrCodeValue ? (
                <StandardQRCode
                  value={qrCodeValue}
                  size={
                    (config.qrCodeSizeBack ? config.qrCodeSizeBack * 0.42 : 42) *
                    scale
                  }
                  fgColor={config.qrColor || "#18181B"}
                  bgColor={config.qrContainerColor || "#FFFFFF"}
                  qrTransparent={config.qrTransparent}
                  qrRounded={config.qrRounded}
                  style={config.qrBorder ? { border: `1px solid ${colors.primary}` } : undefined}
                />
              ) : (
                <button
                  onClick={handleGenerateToken}
                  className="bg-amber-500/10 rounded-xl flex flex-col items-center justify-center border border-dashed border-amber-500/30 hover:bg-amber-500/20 transition-all"
                  style={{
                    width: `${scale * 20}mm`,
                    height: `${scale * 20}mm`,
                  }}
                >
                  <RefreshCw
                    className="text-amber-500"
                    style={{
                      width: `${scale * 16}px`,
                      height: `${scale * 16}px`,
                    }}
                  />
                </button>
              )
            ) : (
              <div
                className="bg-emerald-50/10 rounded-xl flex flex-col items-center justify-center border border-dashed border-emerald-100/20"
                style={{
                  width: `${scale * 20}mm`,
                  height: `${scale * 20}mm`,
                }}
              >
                <QrCodeIcon
                  className="text-emerald-100"
                  style={{
                    width: `${scale * 16}px`,
                    height: `${scale * 16}px`,
                  }}
                />
              </div>
            )}

            <span
              className="font-extrabold uppercase tracking-widest block text-center truncate max-w-full"
              style={{ fontSize: getFontSize(5.5), color: colors.accent }}
            >
              Acesso Digital
            </span>
          </div>

          {/* Right Column: Policies & Metadata Info */}
          <div
            className="flex-1 flex flex-col justify-between min-w-0"
            style={{ padding: getPadding(8) }}
          >
            {/* Slogan details and restricted warnings */}
            <div className="text-left flex flex-col min-w-0" style={{ gap: getGap(2) }}>
              <div
                className="border-b min-w-0"
                style={{
                  borderColor: "rgba(255,255,255,0.08)",
                  paddingBottom: getPadding(3),
                }}
              >
                <h4
                  className="font-black uppercase tracking-[0.15em] truncate max-w-full"
                  style={{
                    fontSize: getFontSize(7),
                    color: colors.accent,
                    opacity: preview ? 0.75 : 1,
                  }}
                >
                  {company.name}
                </h4>
                <h4
                  className="font-black uppercase tracking-widest truncate max-w-full"
                  style={{ fontSize: getFontSize(9.5), color: colors.text }}
                >
                  Identificação Digital
                </h4>
              </div>

              <p
                className="font-medium uppercase leading-tight text-left text-zinc-300"
                style={{
                  fontSize: getFontSize(6.2),
                  opacity: 0.8,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                O uso deste crachá é obrigatório em todas as dependências da
                empresa. Se encontrado, devolva ao RH da {company.name}.
              </p>
            </div>

            {/* Restricted Area Pill */}
            <span
              className="font-black uppercase tracking-widest block w-fit"
              style={{
                fontSize: getFontSize(5.8),
                color: "#ffffff",
                backgroundColor: "rgba(239, 68, 68, 0.4)",
                padding: `${scale * 1}px ${scale * 5}px`,
                borderRadius: getBorderRadius(3),
                marginTop: `${scale * 1}px`,
              }}
            >
              Acesso Restrito
            </span>

            {/* Bottom Panel Emissão/Matrícula */}
            <div
              className="flex items-center justify-between border-t min-w-0"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                paddingTop: getPadding(4),
              }}
            >
              <div className="text-left min-w-0">
                <span
                  className="font-black uppercase tracking-widest block"
                  style={{ fontSize: getFontSize(5.5), color: colors.accent }}
                >
                  Matrícula
                </span>
                <span
                  className="font-bold uppercase text-zinc-200 block truncate max-w-[80px]"
                  style={{ fontSize: getFontSize(7.5) }}
                >
                  {user?.matricula || user?.login || "---"}
                </span>
              </div>
              <div className="text-right min-w-0">
                <span
                  className="font-black uppercase tracking-widest block"
                  style={{ fontSize: getFontSize(5.5), color: colors.accent }}
                >
                  Emissão
                </span>
                <span
                  className="font-bold uppercase text-zinc-200 block truncate max-w-[80px]"
                  style={{ fontSize: getFontSize(7.5) }}
                >
                  {new Date().toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    } else {
      // PORTRAIT / VERTICAL BACK LAYOUT
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-between select-none"
          style={{ color: colors.text }}
        >
          {/* Verso Content */}
          <div
            className="w-full text-center border-b shrink-0 flex flex-col items-center justify-center text-current"
            style={{
              backgroundColor: colors.secondary,
              height: `${scale * 12}mm`,
              borderBottomColor: "rgba(255,255,255,0.1)",
              paddingLeft: getPadding(6),
              paddingRight: getPadding(6),
              backgroundImage: config.gradient
                ? `linear-gradient(to bottom, ${colors.secondary}, rgba(0,0,0,0.2))`
                : "none",
            }}
          >
            <h4
              className="font-black uppercase tracking-[0.2em] mb-0.5"
              style={{
                fontSize: getFontSize(7.5),
                color: colors.accent,
                opacity: preview ? 0.6 : 1,
              }}
            >
              {company.name}
            </h4>
            <h4
              className="font-black uppercase tracking-widest leading-none"
              style={{ fontSize: getFontSize(10), color: colors.text }}
            >
              Identificação Digital
            </h4>
          </div>

          <div
            className="flex-1 flex flex-col items-center justify-center z-10 w-full"
            style={{ padding: getPadding(8), gap: getGap(6) }}
          >
            {config.showQRCode ? (
              qrCodeValue ? (
                <StandardQRCode
                  value={qrCodeValue}
                  size={(config.qrCodeSizeBack || 75) * scale * 0.85}
                  className="shrink-0"
                  fgColor={config.qrColor || "#18181B"}
                  bgColor={config.qrContainerColor || "#FFFFFF"}
                  qrTransparent={config.qrTransparent}
                  qrRounded={config.qrRounded}
                  style={config.qrBorder ? { border: `1px solid ${colors.primary}` } : undefined}
                />
              ) : (
                <button
                  onClick={handleGenerateToken}
                  className="bg-amber-500/10 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-amber-500/30 hover:bg-amber-500/20 transition-all group shrink-0"
                  style={{
                    width: `${scale * 24}mm`,
                    height: `${scale * 24}mm`,
                  }}
                >
                  <RefreshCw
                    className="text-amber-500/40 group-hover:rotate-180 transition-transform duration-500 mb-1"
                    style={{
                      width: `${scale * 20}px`,
                      height: `${scale * 20}px`,
                    }}
                  />
                  <span
                    className="font-black text-amber-500 uppercase leading-none"
                    style={{ fontSize: getFontSize(6.5) }}
                  >
                    Gerar Token QR
                  </span>
                </button>
              )
            ) : (
              <div
                className="bg-emerald-50/30 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-emerald-100 shrink-0"
                style={{
                  width: `${scale * 24}mm`,
                  height: `${scale * 24}mm`,
                }}
              >
                <QrCodeIcon
                  className="text-emerald-100 mb-1"
                  style={{
                    width: `${scale * 20}px`,
                    height: `${scale * 20}px`,
                  }}
                />
                <span
                  className="font-black text-emerald-200 uppercase leading-none"
                  style={{ fontSize: getFontSize(6.5) }}
                >
                  QR Code Oculto
                </span>
              </div>
            )}

            <div
              className="text-center"
              style={{
                paddingLeft: getPadding(6),
                paddingRight: getPadding(6),
              }}
            >
              <span
                className="font-black uppercase tracking-widest block"
                style={{
                  fontSize: getFontSize(8),
                  color: colors.accent,
                  marginBottom: `${scale * 2}px`,
                }}
              >
                Acesso Restrito
              </span>
              <p
                className="font-medium uppercase leading-tight"
                style={{
                  fontSize: getFontSize(6.8),
                  opacity: preview ? 0.6 : 1,
                }}
              >
                O uso deste crachá é obrigatório em todas as dependências da
                empresa. Se encontrado, favor devolver ao RH da {company.name}.
              </p>
            </div>
          </div>

          <div
            className="w-full z-10 border-t shrink-0"
            style={{
              backgroundColor: "rgba(0,0,0,0.1)",
              borderTopColor: "rgba(255,255,255,0.05)",
              padding: getPadding(8),
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="font-black uppercase tracking-widest block"
                  style={{ fontSize: getFontSize(6.5), color: colors.accent }}
                >
                  Matrícula
                </span>
                <span
                  className="font-bold uppercase"
                  style={{ fontSize: getFontSize(8) }}
                >
                  {user?.matricula || user?.login || "---"}
                </span>
              </div>
              <div className="text-right">
                <span
                  className="font-black uppercase tracking-widest block"
                  style={{ fontSize: getFontSize(6.5), color: colors.accent }}
                >
                  Emissão
                </span>
                <span
                  className="font-bold uppercase"
                  style={{ fontSize: getFontSize(8) }}
                >
                  {new Date().toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
  };

  const content = (
    <div
      className={cn(
        "badge-content relative flex flex-col items-center overflow-hidden w-full h-full",
        !preview && "shadow-none",
      )}
      style={{
        backgroundColor: viewType === "verso" ? colors.back : "#ffffff",
        color: viewType === "verso" ? colors.text : "#000000",
        borderRadius: config.cornerStyle === "v2" ? "0px" : "6mm",
        ...getCardBorderStyle(),
      }}
    >
      {/* Background Texture Overlay */}
      {config.bgPatternType && config.bgPatternType !== 'none' && (
        <div style={getTextureStyle() as any} />
      )}

      {/* Visual Guide Border overlay if safe mode is clicked */}
      {preview && config.showSafeMargin && (
        <div 
          className="absolute pointer-events-none border border-dashed border-red-500/45 z-30" 
          style={{ 
            inset: `${4 * scale}px`, 
            borderRadius: config.cornerStyle === 'v2' ? '0px' : '4mm' 
          }}
        />
      )}

      {viewType === "verso" ? renderBack() : renderFront()}

      {/* Common Layout Overlays */}
      {config.showCutLines && (
        <div className="absolute inset-0 pointer-events-none print:hidden opacity-20 text-current z-30">
          <div
            className="absolute top-0 left-0 w-4 h-px bg-current"
            style={{ width: `${scale * 16}px` }}
          />
          <div
            className="absolute top-0 left-0 w-px h-4 bg-current"
            style={{ height: `${scale * 16}px` }}
          />
          <div
            className="absolute top-0 right-0 w-4 h-px bg-current"
            style={{ width: `${scale * 16}px` }}
          />
          <div
            className="absolute top-0 right-0 w-px h-4 bg-current"
            style={{ height: `${scale * 16}px` }}
          />
          <div
            className="absolute bottom-0 left-0 w-4 h-px bg-current"
            style={{ width: `${scale * 16}px` }}
          />
          <div
            className="absolute bottom-0 left-0 w-px h-4 bg-current"
            style={{ height: `${scale * 16}px` }}
          />
          <div
            className="absolute bottom-0 right-0 w-4 h-px bg-current"
            style={{ width: `${scale * 16}px` }}
          />
          <div
            className="absolute bottom-0 right-0 w-px h-4 bg-current"
            style={{ height: `${scale * 16}px` }}
          />
        </div>
      )}
    </div>
  );

  const badgeBody = (
    <div
      className={cn(
        "flex bg-white overflow-hidden shrink-0",
        (config.paperSize === "58mm" || config.paperSize === "80mm") &&
          !ignorePaper
          ? "w-full"
          : "",
      )}
      style={{
        width:
          (config.paperSize === "58mm" || config.paperSize === "80mm") &&
          !ignorePaper
            ? "100%"
            : `${widthMmScaled}mm`,
        height: `${heightMmScaled}mm`,
        marginTop: !ignorePaper ? `${config.marginTop}mm` : "0",
        boxSizing: "border-box",
        borderRadius: config.cornerStyle === "v2" ? "0px" : "6mm",
        ...getCardShadowStyle(),
      }}
    >
      {content}
    </div>
  );

  if (ignorePaper) {
    return badgeBody;
  }

  return (
    <div
      id={
        id ||
        (viewType === "frente"
          ? "badge-preview-container"
          : "badge-preview-container-verso")
      }
      className={cn("badge-renderer", !preview && "print:m-0")}
    >
      {badgeBody}
    </div>
  );
}
