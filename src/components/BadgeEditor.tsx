import React from "react";
import {
  Printer,
  Download,
  ImageIcon,
  Layout,
  Settings2,
  RefreshCw,
  QrCode as QrCodeIcon,
  Scissors,
  Palette,
  User,
  Eye,
  Trash2,
  Sliders,
  CheckCircle2,
  Search,
  ChevronDown,
  Sparkles,
  Type,
  Copy,
  Plus,
  Upload,
} from "lucide-react";
import { useStore } from "../store";
import { cn } from "../lib/utils";
import { isDesktop } from "../lib/environment";
import Badge from "./Badge";
import { getPaperConfig, getPaperSpecsDisplay } from "../lib/paperSizes";
import { generateCanonicalPdfBlob, downloadOrSharePdf } from "../services/pdfEngine/pdfGenerator";

const ColorPicker = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (val: string) => void;
}) => {
  const swatches = [
    "#ffffff", // Branco
    "#000000", // Preto
    "#3b82f6", // Azul
    "#10b981", // Verde
    "#ef4444", // Vermelho
    "#f59e0b", // Amarelo
    "#8b5cf6", // Roxo
    "#ec4899", // Rosa
    "#e2e8f0", // Cinza Claro
    "#1e293b", // Cinza Escuro
  ];

  return (
    <div className="space-y-1 bg-black/20 p-2 rounded-xl border border-white/5">
      <label className="text-[9px] font-black text-white/50 uppercase tracking-widest px-1 block mb-1">
        {label}
      </label>
      <div className="flex items-center gap-2">
        {/* Main color indicator + Spectrum picker trigger */}
        <div
          className="w-7 h-7 rounded-full border border-white/20 shrink-0 cursor-pointer relative shadow-inner overflow-hidden transition-all hover:scale-105 active:scale-95 flex items-center justify-center bg-zinc-800"
          style={{ backgroundColor: value }}
          title="Clique para abrir paleta completa de cores"
        >
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full scale-150"
          />
          {/* Subtle icon/indicator telling the user they can pick custom colors */}
          <span className="text-[8px] font-black text-white mix-blend-difference pointer-events-none">
            +
          </span>
        </div>
        
        {/* Interactive Swatches Grid */}
        <div className="flex flex-wrap gap-1 items-center max-w-[130px]">
          {swatches.map((sw) => {
            const isSelected = value?.toLowerCase() === sw.toLowerCase();
            return (
              <button
                key={sw}
                type="button"
                onClick={() => onChange(sw)}
                className={cn(
                  "w-3.5 h-3.5 rounded-full border border-white/10 transition-all hover:scale-125 focus:outline-none cursor-pointer relative",
                  isSelected ? "ring-1 ring-cyan-400 scale-110 border-transparent shadow shadow-cyan-400" : ""
                )}
                style={{ backgroundColor: sw }}
                title={sw}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

const COLOR_PRESETS = [
  {
    name: "Industrial",
    primary: "#059669",
    secondary: "#064e3b",
    accent: "#10b981",
    text: "#ffffff",
    back: "#064e3b",
  },
  {
    name: "Safe Blue",
    primary: "#2563eb",
    secondary: "#1e3a8a",
    accent: "#60a5fa",
    text: "#ffffff",
    back: "#1e3a8a",
  },
  {
    name: "Danger",
    primary: "#ef4444",
    secondary: "#7f1d1d",
    accent: "#fecaca",
    text: "#ffffff",
    back: "#7f1d1d",
  },
  {
    name: "Deep Night",
    primary: "#111827",
    secondary: "#000000",
    accent: "#fbbf24",
    text: "#ffffff",
    back: "#000000",
  },
  {
    name: "Minimalist",
    primary: "#f8fafc",
    secondary: "#ffffff",
    accent: "#0f172a",
    text: "#000000",
    back: "#ffffff",
  },
  {
    name: "Amber Gold",
    primary: "#d97706",
    secondary: "#451a03",
    accent: "#fbbf24",
    text: "#ffffff",
    back: "#451a03",
  },
  {
    name: "Royal Purple",
    primary: "#7c3aed",
    secondary: "#2e1065",
    accent: "#a78bfa",
    text: "#ffffff",
    back: "#2e1065",
  },
  {
    name: "Burgundy Vinho",
    primary: "#991b1b",
    secondary: "#450a0a",
    accent: "#fca5a5",
    text: "#ffffff",
    back: "#450a0a",
  },
  {
    name: "Modern Teal",
    primary: "#0d9488",
    secondary: "#115e59",
    accent: "#2dd4bf",
    text: "#ffffff",
    back: "#115e59",
  },
  {
    name: "Classic Charcoal",
    primary: "#374151",
    secondary: "#111827",
    accent: "#f59e0b",
    text: "#ffffff",
    back: "#111827",
  },
  {
    name: "High-Vis Security",
    primary: "#ea580c",
    secondary: "#431407",
    accent: "#fdba74",
    text: "#ffffff",
    back: "#431407",
  },
];

const QUICK_THEMES = [
  {
    name: "Corporativo Dark",
    config: {
      primaryColor: "#0f172a",
      secondaryColor: "#1e293b",
      accentColor: "#38bdf8",
      textColor: "#ffffff",
      backColor: "#0f172a",
      borderColor: "#334155",
      gradient: true,
      bgPatternType: "carbon",
      borderStyleType: "minimalist",
      cardShadow: "lg"
    }
  },
  {
    name: "Neon Tech",
    config: {
      primaryColor: "#120b22",
      secondaryColor: "#07020d",
      accentColor: "#00f0ff",
      textColor: "#ffffff",
      backColor: "#120b22",
      borderColor: "#30135c",
      gradient: true,
      bgPatternType: "circuits",
      borderStyleType: "neon",
      cardShadow: "neon",
      glowIntensity: 60
    }
  },
  {
    name: "Industrial WMS",
    config: {
      primaryColor: "#ea580c",
      secondaryColor: "#1c1917",
      accentColor: "#f97316",
      textColor: "#ffffff",
      backColor: "#1c1917",
      borderColor: "#44403c",
      gradient: true,
      bgPatternType: "industrial",
      borderStyleType: "solid",
      cardShadow: "md"
    }
  },
  {
    name: "Segurança Máxima",
    config: {
      primaryColor: "#1e1b4b",
      secondaryColor: "#dc2626",
      accentColor: "#fca5a5",
      textColor: "#ffffff",
      backColor: "#1e1b4b",
      borderColor: "#ef4444",
      gradient: true,
      bgPatternType: "hexagons",
      borderStyleType: "double",
      cardShadow: "glow"
    }
  },
  {
    name: "Ecológico Orgânico",
    config: {
      primaryColor: "#15803d",
      secondaryColor: "#14532d",
      accentColor: "#22c55e",
      textColor: "#f0fdf4",
      backColor: "#14532d",
      borderColor: "#166534",
      gradient: true,
      bgPatternType: "none",
      borderStyleType: "solid",
      cardShadow: "sm"
    }
  },
  {
    name: "Aço Escovado",
    config: {
      primaryColor: "#475569",
      secondaryColor: "#1e293b",
      accentColor: "#cbd5e1",
      textColor: "#ffffff",
      backColor: "#1e293b",
      borderColor: "#94a3b8",
      gradient: true,
      bgPatternType: "industrial",
      borderStyleType: "metallic",
      cardShadow: "md"
    }
  },
  {
    name: "Gold VIP",
    config: {
      primaryColor: "#1a1200",
      secondaryColor: "#050505",
      accentColor: "#fbbf24",
      textColor: "#ffffff",
      backColor: "#1a1200",
      borderColor: "#d97706",
      gradient: true,
      bgPatternType: "hexagons",
      borderStyleType: "metallic",
      cardShadow: "glow"
    }
  },
  {
    name: "Clássico Retrô",
    config: {
      primaryColor: "#78350f",
      secondaryColor: "#451a03",
      accentColor: "#f59e0b",
      textColor: "#fef3c7",
      backColor: "#451a03",
      borderColor: "#b45309",
      gradient: true,
      bgPatternType: "none",
      borderStyleType: "double",
      cardShadow: "none"
    }
  },
  {
    name: "Cyberpunk",
    config: {
      primaryColor: "#000000",
      secondaryColor: "#f000ff",
      accentColor: "#f3ef00",
      textColor: "#ffffff",
      backColor: "#000000",
      borderColor: "#00f0ff",
      gradient: true,
      bgPatternType: "circuits",
      borderStyleType: "neon",
      cardShadow: "neon"
    }
  },
  {
    name: "Vidro Fosco/Glassmorphism",
    config: {
      primaryColor: "rgba(255, 255, 255, 0.4)",
      secondaryColor: "rgba(255, 255, 255, 0.1)",
      accentColor: "#ffffff",
      textColor: "#1e293b",
      backColor: "rgba(255, 255, 255, 0.2)",
      borderColor: "rgba(255, 255, 255, 0.5)",
      gradient: false,
      bgPatternType: "glass",
      borderStyleType: "minimalist",
      cardShadow: "glow"
    }
  },
  {
    name: "Brisa Oceânica",
    config: {
      primaryColor: "#0284c7",
      secondaryColor: "#0f172a",
      accentColor: "#06b6d4",
      textColor: "#ffffff",
      backColor: "#0f172a",
      borderColor: "#0ea5e9",
      gradient: true,
      bgPatternType: "glass",
      borderStyleType: "minimalist",
      cardShadow: "lg"
    }
  },
  {
    name: "Entardecer Vibrante",
    config: {
      primaryColor: "#f97316",
      secondaryColor: "#701a75",
      accentColor: "#f43f5e",
      textColor: "#ffffff",
      backColor: "#701a75",
      borderColor: "#ec4899",
      gradient: true,
      bgPatternType: "none",
      borderStyleType: "solid",
      cardShadow: "glow"
    }
  },
  {
    name: "Menta Ártica",
    config: {
      primaryColor: "#0f766e",
      secondaryColor: "#f0fdf4",
      accentColor: "#2dd4bf",
      textColor: "#134e4a",
      backColor: "#f0fdf4",
      borderColor: "#99f6e4",
      gradient: true,
      bgPatternType: "glass",
      borderStyleType: "minimalist",
      cardShadow: "md"
    }
  },
  {
    name: "Ametista Imperial",
    config: {
      primaryColor: "#6b21a8",
      secondaryColor: "#1e1b4b",
      accentColor: "#d946ef",
      textColor: "#ffffff",
      backColor: "#1e1b4b",
      borderColor: "#a21caf",
      gradient: true,
      bgPatternType: "hexagons",
      borderStyleType: "neon",
      cardShadow: "glow"
    }
  },
  {
    name: "Sakura Pastel",
    config: {
      primaryColor: "#fbcfe8",
      secondaryColor: "#fdf2f8",
      accentColor: "#ec4899",
      textColor: "#4c0519",
      backColor: "#fdf2f8",
      borderColor: "#fbcfe8",
      gradient: true,
      bgPatternType: "none",
      borderStyleType: "solid",
      cardShadow: "sm"
    }
  },
  {
    name: "Carbono Vermelho",
    config: {
      primaryColor: "#dc2626",
      secondaryColor: "#171717",
      accentColor: "#ef4444",
      textColor: "#ffffff",
      backColor: "#171717",
      borderColor: "#262626",
      gradient: true,
      bgPatternType: "carbon",
      borderStyleType: "solid",
      cardShadow: "glow"
    }
  },
  {
    name: "Café Minimalista",
    config: {
      primaryColor: "#7c2d12",
      secondaryColor: "#fffbeb",
      accentColor: "#b45309",
      textColor: "#451a03",
      backColor: "#fffbeb",
      borderColor: "#fed7aa",
      gradient: false,
      bgPatternType: "none",
      borderStyleType: "minimalist",
      cardShadow: "sm"
    }
  },
  {
    name: "Aurora Cósmica",
    config: {
      primaryColor: "#050b14",
      secondaryColor: "#042f1a",
      accentColor: "#22c55e",
      textColor: "#e8f5e9",
      backColor: "#050b14",
      borderColor: "#10b981",
      gradient: true,
      bgPatternType: "circuits",
      borderStyleType: "neon",
      cardShadow: "neon"
    }
  },
  {
    name: "Alto Contraste Mono",
    config: {
      primaryColor: "#000000",
      secondaryColor: "#ffffff",
      accentColor: "#000000",
      textColor: "#000000",
      backColor: "#ffffff",
      borderColor: "#000000",
      gradient: false,
      bgPatternType: "none",
      borderStyleType: "solid",
      cardShadow: "md"
    }
  },
  {
    name: "Fênix de Fogo",
    config: {
      primaryColor: "#1c0c02",
      secondaryColor: "#ea580c",
      accentColor: "#f97316",
      textColor: "#ffffff",
      backColor: "#1c0c02",
      borderColor: "#f97316",
      gradient: true,
      bgPatternType: "industrial",
      borderStyleType: "neon",
      cardShadow: "glow"
    }
  }
];

const AdvancedSection = ({ title, icon: Icon, isOpen, onToggle, children }: any) => {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-200">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-white/[0.02] focus:outline-none focus:ring-0 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {Icon && (
            <div className="p-1 bg-cyan-500/15 rounded-lg text-cyan-400">
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
          <h3 className="text-[10.5px] font-black text-white uppercase tracking-wider">
            {title}
          </h3>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-white/50 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="p-3 pt-0 border-t border-white/5 space-y-3 animate-in fade-in slide-in-from-top-1">
          {children}
        </div>
      )}
    </div>
  );
};

export default function BadgeEditor() {
  const badgeConfig = useStore((state) => state.badgeConfig);
  const updateBadgeConfig = useStore((state) => state.updateBadgeConfig);
  const logAction = useStore((state) => state.logAction);
  const currentUser = useStore((state) => state.currentUser);
  const badgeSelectedUserId = useStore((state) => state.badgeSelectedUserId);
  const setBadgeSelectedUserId = useStore((state) => state.setBadgeSelectedUserId);

  // Advanced components custom states
  const badgeSavedTemplates = useStore((state) => state.badgeSavedTemplates) || [];
  const addBadgeTemplate = useStore((state) => state.addBadgeTemplate);
  const deleteBadgeTemplate = useStore((state) => state.deleteBadgeTemplate);

  const [activeAccordion, setActiveAccordion] = React.useState<string | null>(null);
  const [newTemplateName, setNewTemplateName] = React.useState("");
  const [importJsonText, setImportJsonText] = React.useState("");
  const [showImportArea, setShowImportArea] = React.useState(false);
  const [zoomScale, setZoomScale] = React.useState(1.0);

  // Selected collaborator selector
  const users = useStore((state) => state.users) || [];
  const userRoles = useStore((state) => state.userRoles) || [];

  const [selectedUserId, setSelectedUserId] = React.useState<string>(() => {
    return currentUser?.id || "colab-sample-999";
  });

  React.useEffect(() => {
    if (badgeSelectedUserId) {
      setSelectedUserId(badgeSelectedUserId);
      setBadgeSelectedUserId(null); // release
    }
  }, [badgeSelectedUserId, setBadgeSelectedUserId]);

  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = React.useState<boolean>(false);

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (u) =>
          (u.fullName || "").toLowerCase().includes(query) ||
          (u.matricula || "").toLowerCase().includes(query) ||
          (u.login || "").toLowerCase().includes(query)
    );
  }, [users, searchQuery]);

  const currentUserObj = React.useMemo(() => {
    const found = users.find((u) => u.id === selectedUserId);
    if (found) return found;
    return {
      id: "colab-sample-999",
      fullName: "JOÃO DE SOUZA SILVA",
      login: "joao.silva",
      matricula: "admin",
      isAdmin: true,
      status: "ativo" as const,
      qrCodeToken: "admin",
      image:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&auto=format&fit=crop",
      roleId: "admin",
      primaryFunction: "COORDENADOR DE EXPEDIÇÃO",
      loja: "FILIAL SÃO PAULO",
      setor: "EXPEDIÇÃO",
    };
  }, [users, selectedUserId]);

  const userRole = React.useMemo(() => {
    if (currentUserObj.id === "colab-sample-999") {
      return "COORDENADOR DE EXPEDIÇÃO";
    }
    
    // Check if user is an Administrator / System Owner / Master Admin
    if (
      currentUserObj.id === "admin" ||
      currentUserObj.isAdmin ||
      currentUserObj.isMasterAdmin ||
      currentUserObj.isOwner ||
      currentUserObj.roleId === "administrador" ||
      currentUserObj.login?.toLowerCase() === "adm"
    ) {
      return "ADMINISTRADOR";
    }

    // Lookup custom role name from user roles
    const roleObj = userRoles.find((r) => r.id === currentUserObj.roleId);
    if (roleObj) {
      return roleObj.name.toUpperCase();
    }

    // Substring checking fallback for supervisor
    if (
      currentUserObj.roleId?.toLowerCase().includes("supervisor") ||
      currentUserObj.primaryFunction?.toLowerCase().includes("supervisor")
    ) {
      return "SUPERVISOR";
    }

    // Substring checking fallback for manager
    if (currentUserObj.roleId?.toLowerCase().includes("gerente")) {
      return "GERENTE";
    }

    return "OPERADOR";
  }, [userRoles, currentUserObj]);

  const company = useStore((state) => state.company);
  const [isGenerating, setIsGenerating] = React.useState(false);

  const handleGenerateBadgePDF = async () => {
    if (currentUserObj.id === "colab-sample-999") {
      alert("Ação Bloqueada: Não é permitido gerar PDF ou exportar crachá para o Colaborador de Modelo (PRÉ-VISUALIZAÇÃO). Selecione um colaborador real.");
      return;
    }
    try {
      setIsGenerating(true);
      const isHorizontal = badgeConfig.badgeWidth > badgeConfig.badgeHeight;
      const blob = await generateCanonicalPdfBlob(
        'cracha',
        {
          user: currentUserObj,
          role: userRole,
          config: badgeConfig,
          viewType: 'ambos'
        },
        'A6',
        {
          orientation: isHorizontal ? 'portrait' : 'landscape',
          marginMm: 0,
          scale: 1,
          safeMode: true,
          company,
          isExportPdf: true
        }
      );
      await downloadOrSharePdf(blob, `cracha_${currentUserObj.login || currentUserObj.matricula || 'colaborador'}`);
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao gerar PDF: ${err.message || err}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePhysicalPrintBadge = async () => {
    if (currentUserObj.id === "colab-sample-999") {
      alert("Ação Bloqueada: Não é permitido imprimir crachá para o Colaborador de Modelo (PRÉ-VISUALIZAÇÃO). Selecione um colaborador real.");
      return;
    }
    try {
      const activePaperSize = 'A6';
      const isHorizontal = badgeConfig.badgeWidth > badgeConfig.badgeHeight;
      const compiled = {
        user: currentUserObj,
        role: userRole,
        config: badgeConfig,
        viewType: 'ambos' as const
      };

      let bindings = useStore.getState().documentPrintConfigs || [];
      let activePrintConfig = bindings.find(c => (c.documentId as string) === 'cracha');
      const printersList = useStore.getState().printers || [];
      let targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;

      if (isDesktop() && (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || !targetPrinter)) {
        const physicalPrinters = printersList.filter(p => p.id !== 'pdf-manual');
        if (physicalPrinters.length > 0) {
          const optionsText = physicalPrinters.map((p, idx) => `${idx + 1}: ${p.name}`).join('\n');
          const userChoice = prompt(
            `Nenhuma impressora está vinculada ao Crachá de Acesso no momento.\n\n` +
            `Escolha uma das opções abaixo digitando o número correspondente para vincular agora e imprimir:\n` +
            `0: Abrir Central de Impressoras para configuração manual\n` +
            `${optionsText}\n\n` +
            `Ou clique em "Cancelar" para gerar apenas o PDF.`,
            "1"
          );
          
          if (userChoice === "0") {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
          
          if (userChoice !== null) {
            const chosenIndex = parseInt(userChoice, 10) - 1;
            if (chosenIndex >= 0 && chosenIndex < physicalPrinters.length) {
              const selectedPrinter = physicalPrinters[chosenIndex];
              const { saveDocumentPrintConfig } = useStore.getState();
              saveDocumentPrintConfig({
                documentId: 'cracha',
                documentName: 'Crachá',
                printerId: selectedPrinter.id,
                paperErpId: 'A6',
                driverPaperName: 'A6',
                pdfManualActive: false,
              });
              alert(`Impressora "${selectedPrinter.name}" vinculada com sucesso! Recomeçando processo...`);
              bindings = useStore.getState().documentPrintConfigs || [];
              activePrintConfig = bindings.find(c => (c.documentId as string) === 'cracha');
              targetPrinter = activePrintConfig ? printersList.find(p => p.id === activePrintConfig.printerId) : undefined;
            }
          }
        } else {
          const registerChoice = confirm(
            `Nenhuma impressora física foi cadastrada no sistema.\n\n` +
            `Deseja registrar uma impressora padrão do sistema (como "Impressora Padrão do SO") agora para enviar à fila de impressão?\n\n` +
            `Clique em "OK" para cadastrar automaticamente a Impressora Padrão do SO e usá-la.\n` +
            `Clique em "Cancelar" para ir para a Central de Impressoras.`
          );
          
          if (registerChoice) {
            const { addPrinter, saveDocumentPrintConfig } = useStore.getState();
            const defaultId = 'printer-default';
            addPrinter({
              id: defaultId,
              name: 'Impressora Padrão do SO',
              type: 'termica',
              origin: 'os',
              status: 'ativa',
              compatibilities: ['thermal_receipt', 'order_ticket', 'customer_experience', 'labels', 'bulk_labels', 'cracha'],
              manufacturer: 'System Default'
            });
            saveDocumentPrintConfig({
              documentId: 'cracha',
              documentName: 'Crachá',
              printerId: defaultId,
              paperErpId: 'A6',
              driverPaperName: 'A6',
              pdfManualActive: false,
            });
            alert('Impressora cadastrada e vinculada! Recomeçando...');
            bindings = useStore.getState().documentPrintConfigs || [];
            activePrintConfig = bindings.find(c => (c.documentId as string) === 'cracha');
            targetPrinter = useStore.getState().printers.find(p => p.id === defaultId);
          } else {
            const triggerBtn = document.querySelector('[data-menu-link="printers_hub"]') as HTMLElement;
            if (triggerBtn) triggerBtn.click();
            return;
          }
        }
      }

      if (!activePrintConfig || activePrintConfig.printerId === 'pdf-manual' || printersList.length === 0 || !targetPrinter) {
        await handleGenerateBadgePDF();
        return;
      }

      const allMappings = useStore.getState().paperDriverMappings || [];
      const matchedMapping = allMappings.find(
        m => m.printerId === targetPrinter.id && m.paperErpId === activePaperSize
      );

      let finalDriverPaperName = activePrintConfig.driverPaperName || 'A6';
      let finalOrientation: 'portrait' | 'landscape' = isHorizontal ? 'landscape' : 'portrait';
      let finalMarginMm = activePrintConfig.marginMm || 0;
      let finalScale = activePrintConfig.scale || 1.0;
      let finalSafeMode = activePrintConfig.safeModeActive || false;

      if (matchedMapping) {
        finalDriverPaperName = matchedMapping.driverPaperName;
        finalOrientation = matchedMapping.orientation;
        finalMarginMm = matchedMapping.marginMm;
        finalScale = matchedMapping.scale;
        finalSafeMode = matchedMapping.safeMode;
      }

      // Force portrait or landscape orientation on A6 so both front and back fit on a single sheet, matching PDF generation
      if (activePaperSize === 'A6') {
        finalOrientation = isHorizontal ? 'portrait' : 'landscape';
      }

      const { addPrintJob } = useStore.getState();
      addPrintJob({
        documentId: 'cracha' as any,
        documentName: `Crachá de Acesso - ${currentUserObj.fullName}`,
        printerId: targetPrinter.id,
        printerName: targetPrinter.name,
        paperErpId: activePaperSize,
        driverPaperName: finalDriverPaperName,
        orientation: finalOrientation,
        marginMm: finalMarginMm,
        scale: finalScale,
        safeMode: finalSafeMode,
        payload: compiled
      });

      alert('Incluído com sucesso na fila de impressão do crachá do ERP!');
    } catch (err: any) {
      console.error(err);
      alert(`Falha ao imprimir crachá: ${err.message}`);
    }
  };

  const userName = currentUserObj.fullName;

  const paperConfig = React.useMemo(
    () =>
      getPaperConfig(
        badgeConfig.paperSize,
        badgeConfig.orientation,
        badgeConfig.customWidth,
        badgeConfig.customHeight,
      ),
    [
      badgeConfig.paperSize,
      badgeConfig.orientation,
      badgeConfig.customWidth,
      badgeConfig.customHeight,
    ],
  );

  const specs = React.useMemo(
    () => getPaperSpecsDisplay(paperConfig),
    [paperConfig],
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-1 grow overflow-y-auto lg:overflow-hidden animate-in fade-in duration-500 h-auto lg:h-[calc(100vh-120px)]">
      {/* Configuration Section - Refactored to 1 column on lg, 2 columns on md */}
      <div className="w-full lg:w-[450px] flex flex-col md:flex-row lg:flex-col gap-3 lg:overflow-y-auto custom-scrollbar pr-1 shrink-0 content-start">
        {/* Left Column Settings */}
        <div className="flex-1 space-y-3">
          {/* Card 1: Badge Dimensions */}
          <AdvancedSection
            title="Dimensões do Crachá"
            icon={Settings2}
            isOpen={activeAccordion === "dimensions"}
            onToggle={() => setActiveAccordion(activeAccordion === "dimensions" ? null : "dimensions")}
          >
            <div className="space-y-3 text-left">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Largura do crachá (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="10"
                    max="300"
                    value={badgeConfig.badgeWidth || ""}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === "") {
                        updateBadgeConfig({ badgeWidth: 0 });
                      } else {
                        const parsed = parseFloat(valStr);
                        if (!isNaN(parsed) && parsed > 0) {
                          updateBadgeConfig({ badgeWidth: parsed });
                        }
                      }
                    }}
                    onBlur={() => {
                      if (
                        !badgeConfig.badgeWidth ||
                        badgeConfig.badgeWidth < 10
                      ) {
                        updateBadgeConfig({ badgeWidth: 85.6 });
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-blue-400 font-mono font-bold focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Altura do crachá (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="10"
                    max="300"
                    value={badgeConfig.badgeHeight || ""}
                    onChange={(e) => {
                      const valStr = e.target.value;
                      if (valStr === "") {
                        updateBadgeConfig({ badgeHeight: 0 });
                      } else {
                        const parsed = parseFloat(valStr);
                        if (!isNaN(parsed) && parsed > 0) {
                          updateBadgeConfig({ badgeHeight: parsed });
                        }
                      }
                    }}
                    onBlur={() => {
                      if (
                        !badgeConfig.badgeHeight ||
                        badgeConfig.badgeHeight < 10
                      ) {
                        updateBadgeConfig({ badgeHeight: 54 });
                      }
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-blue-400 font-mono font-bold focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              {/* Default Dimensions Preset Toggles */}
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    updateBadgeConfig({
                      badgeWidth: 85.6,
                      badgeHeight: 54,
                      orientation: "portrait",
                    });
                  }}
                  className={cn(
                    "py-1.5 px-3 rounded-xl border text-center font-black text-[8px] uppercase tracking-wider transition-all",
                    badgeConfig.badgeWidth === 85.6 &&
                      badgeConfig.badgeHeight === 54 &&
                      badgeConfig.orientation === "portrait"
                      ? "bg-blue-600 border-transparent text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10",
                  )}
                >
                  Padrão Cartão Crédito/Crachá (85.6 × 54.0 mm)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    updateBadgeConfig({
                      badgeWidth: 54,
                      badgeHeight: 85.6,
                      orientation: "portrait",
                    });
                  }}
                  className={cn(
                    "py-1.5 px-3 rounded-xl border text-center font-black text-[8px] uppercase tracking-wider transition-all",
                    badgeConfig.badgeWidth === 54 &&
                      badgeConfig.badgeHeight === 85.6
                      ? "bg-blue-600 border-transparent text-white shadow-lg shadow-blue-500/20"
                      : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10",
                  )}
                >
                  Crachá Vertical (54.0 × 85.6 mm)
                </button>
              </div>
            </div>
          </AdvancedSection>

          {/* Card 3: Visual Style */}
          <AdvancedSection
            title="Estilo Visual"
            icon={Palette}
            isOpen={activeAccordion === "visual_style"}
            onToggle={() => setActiveAccordion(activeAccordion === "visual_style" ? null : "visual_style")}
          >
            <div className="space-y-3 text-left">
              <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">
                  Gradiente
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateBadgeConfig({ gradient: !badgeConfig.gradient })
                  }
                  className={cn(
                    "px-2 py-1 text-[7px] font-black uppercase transition-all rounded-lg border cursor-pointer",
                    badgeConfig.gradient
                      ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
                      : "bg-white/5 border-white/10 text-white/20",
                  )}
                >
                  {badgeConfig.gradient ? "ON" : "OFF"}
                </button>
              </div>

              <div className="flex flex-col gap-1.5 p-2 bg-black/20 rounded-xl">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">
                  Versão dos Cantos (Formato)
                </span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => updateBadgeConfig({ cornerStyle: 'v1' })}
                    className={cn(
                      "py-1 px-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer text-center",
                      badgeConfig.cornerStyle !== 'v2'
                        ? "bg-purple-600 border-transparent text-white shadow-lg shadow-purple-500/20"
                        : "bg-[#121212] border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    Versão 1 (Arredondado)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateBadgeConfig({ cornerStyle: 'v2' })}
                    className={cn(
                      "py-1 px-1.5 text-[8px] font-black uppercase tracking-wider rounded-lg border transition-all cursor-pointer text-center",
                      badgeConfig.cornerStyle === 'v2'
                        ? "bg-purple-600 border-transparent text-white shadow-lg shadow-purple-500/20"
                        : "bg-[#121212] border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    Versão 2 (Reto)
                  </button>
                </div>
              </div>

              {/* Palette & Custom Color Pickers */}
              <div className="pt-2 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none shrink-0">
                    Paleta Rápida
                  </span>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[190px]">
                    {COLOR_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() =>
                          updateBadgeConfig({
                            primaryColor: preset.primary,
                            secondaryColor: preset.secondary,
                            accentColor: preset.accent,
                            textColor: preset.text,
                            backColor: preset.back,
                            roleColor: undefined,
                            sectorColor: undefined,
                          })
                        }
                        title={preset.name}
                        className="w-3.5 h-3.5 rounded-full border border-white/20 hover:scale-125 transition-transform cursor-pointer"
                        style={{ backgroundColor: preset.primary }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <ColorPicker
                    label="Primária"
                    value={badgeConfig.primaryColor}
                    onChange={(val) => updateBadgeConfig({ primaryColor: val })}
                  />
                  <ColorPicker
                    label="Verso/Fundo"
                    value={badgeConfig.backColor}
                    onChange={(val) => updateBadgeConfig({ backColor: val })}
                  />
                  <ColorPicker
                    label="Destaque"
                    value={badgeConfig.accentColor}
                    onChange={(val) => updateBadgeConfig({ accentColor: val })}
                  />
                </div>
              </div>
            </div>
          </AdvancedSection>

          {/* Advanced Sections: Backgrounds, Borders, Typography */}
          <AdvancedSection
            title="Fundo Avançado & Texturas"
            icon={Palette}
            isOpen={activeAccordion === "backgrounds"}
            onToggle={() => setActiveAccordion(activeAccordion === "backgrounds" ? null : "backgrounds")}
          >
            <div className="space-y-3.5 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                  Textura de Fundo
                </label>
                <select
                  value={badgeConfig.bgPatternType || "none"}
                  onChange={(e) => updateBadgeConfig({ bgPatternType: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                >
                  <option value="none" className="bg-zinc-950 text-white">Sólido / Sem Textura</option>
                  <option value="carbon" className="bg-zinc-950 text-white">Carbon Fiber (Dark Tech)</option>
                  <option value="hexagons" className="bg-zinc-950 text-white">Grid de Colmeias (Colaborador Futuro)</option>
                  <option value="industrial" className="bg-zinc-950 text-white">Linhas Industriais (Logística / WMS)</option>
                  <option value="circuits" className="bg-zinc-950 text-white">Malhas Digitais (Circuitos Eletrônicos)</option>
                  <option value="glass" className="bg-zinc-950 text-white">Vidro Fosco (Glassmorphism)</option>
                  <option value="gradient" className="bg-zinc-950 text-white">Gradiente Suave (Duotônico)</option>
                </select>
              </div>

              {badgeConfig.bgPatternType && badgeConfig.bgPatternType !== "none" && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                    <span>Opacidade da Textura</span>
                    <span className="text-white/80 font-mono">
                      {badgeConfig.backOpacity !== undefined ? badgeConfig.backOpacity : 40} %
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={badgeConfig.backOpacity !== undefined ? badgeConfig.backOpacity : 40}
                    onChange={(e) =>
                      updateBadgeConfig({ backOpacity: parseInt(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              )}
            </div>
          </AdvancedSection>

          <AdvancedSection
            title="Estilos de Borda & Efeitos"
            icon={Scissors}
            isOpen={activeAccordion === "borders"}
            onToggle={() => setActiveAccordion(activeAccordion === "borders" ? null : "borders")}
          >
            <div className="space-y-3.5 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                  Tipo de Borda do Crachá
                </label>
                <select
                  value={badgeConfig.borderStyleType || "solid"}
                  onChange={(e) => updateBadgeConfig({ borderStyleType: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                >
                  <option value="solid" className="bg-zinc-950 text-white">Sólida Clássica</option>
                  <option value="glow" className="bg-zinc-950 text-white">Outer Glow (Brilho Radiante)</option>
                  <option value="double" className="bg-zinc-950 text-white">Dupla Linha Nobre</option>
                  <option value="neon" className="bg-zinc-950 text-white">Neon Sci-Fi (Borda Pulsante)</option>
                  <option value="minimalist" className="bg-zinc-950 text-white">Minimalista Invisível</option>
                  <option value="metallic" className="bg-zinc-950 text-white">Metal Escovado Premium</option>
                  <option value="dashed" className="bg-zinc-950 text-white">Tracejado / Serrilhado</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                  <span>Espessura da Borda</span>
                  <span className="text-white/80 font-mono">
                    {badgeConfig.borderWidthPx !== undefined ? badgeConfig.borderWidthPx : 1} px
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  value={badgeConfig.borderWidthPx !== undefined ? badgeConfig.borderWidthPx : 1}
                  onChange={(e) =>
                    updateBadgeConfig({ borderWidthPx: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div className="pt-1.5">
                <ColorPicker
                  label="Cor da Borda do Crachá"
                  value={badgeConfig.borderColor || badgeConfig.primaryColor || "#334155"}
                  onChange={(val) => updateBadgeConfig({ borderColor: val })}
                />
              </div>

              {(badgeConfig.borderStyleType === "glow" || badgeConfig.borderStyleType === "neon") && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                    <span>Intensidade do Brilho</span>
                    <span className="text-white/80 font-mono">
                      {badgeConfig.glowIntensity !== undefined ? badgeConfig.glowIntensity : 50} %
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={badgeConfig.glowIntensity !== undefined ? badgeConfig.glowIntensity : 50}
                    onChange={(e) =>
                      updateBadgeConfig({ glowIntensity: parseInt(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              )}
            </div>
          </AdvancedSection>

          <AdvancedSection
            title="Tipografia Avançada"
            icon={Type}
            isOpen={activeAccordion === "typography"}
            onToggle={() => setActiveAccordion(activeAccordion === "typography" ? null : "typography")}
          >
            <div className="space-y-3.5 text-left">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                  <span>Tamanho do Nome</span>
                  <span className="text-white/80 font-mono">
                    {badgeConfig.nameFontSize || 11} px
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="24"
                  step="0.5"
                  value={badgeConfig.nameFontSize || 11}
                  onChange={(e) =>
                    updateBadgeConfig({ nameFontSize: parseFloat(e.target.value) })
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Peso da Fonte
                  </label>
                  <select
                    value={badgeConfig.nameFontWeight || "black"}
                    onChange={(e) => updateBadgeConfig({ nameFontWeight: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="normal" className="bg-zinc-950 text-white">Regular</option>
                    <option value="semibold" className="bg-zinc-950 text-white">Semibold</option>
                    <option value="bold" className="bg-zinc-950 text-white">Bold (Firme)</option>
                    <option value="black" className="bg-zinc-950 text-white">Black (Blackout)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Alinhamento
                  </label>
                  <select
                    value={badgeConfig.nameAlignment || "center"}
                    onChange={(e) => updateBadgeConfig({ nameAlignment: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="left" className="bg-zinc-950 text-white">Esquerda</option>
                    <option value="center" className="bg-zinc-950 text-white">Centralizado</option>
                    <option value="right" className="bg-zinc-950 text-white">Direita</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest leading-none">
                  Nome em Caixa Alta
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateBadgeConfig({ nameUppercase: badgeConfig.nameUppercase === false ? true : false })
                  }
                  className={cn(
                    "px-2 py-0.5 text-[8px] font-black uppercase transition-all rounded-lg border",
                    badgeConfig.nameUppercase !== false
                      ? "bg-cyan-500/10 border-cyan-500/20 text-cyan-400"
                      : "bg-white/5 border-white/10 text-white/20",
                  )}
                >
                  {badgeConfig.nameUppercase !== false ? "ATIVADO" : "DESATIVADO"}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-black text-white/40 uppercase px-1">
                    <span>Tam. Cargo</span>
                    <span className="text-white/80 font-mono">
                      {badgeConfig.roleFontSize || 8} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="15"
                    step="0.5"
                    value={badgeConfig.roleFontSize || 8}
                    onChange={(e) =>
                      updateBadgeConfig({ roleFontSize: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-black text-white/40 uppercase px-1">
                    <span>Tam. Matrícula</span>
                    <span className="text-white/80 font-mono">
                      {badgeConfig.matriculaFontSize || 8} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="15"
                    step="0.5"
                    value={badgeConfig.matriculaFontSize || 8}
                    onChange={(e) =>
                      updateBadgeConfig({ matriculaFontSize: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              <div className="border-t border-white/5 pt-3.5 space-y-3">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 block">
                  Cores do Texto & Legendas
                </span>
                
                <div className="grid grid-cols-2 gap-2">
                  <ColorPicker
                    label="Cor do Nome"
                    value={badgeConfig.textColor || "#ffffff"}
                    onChange={(val) => updateBadgeConfig({ textColor: val })}
                  />
                  <ColorPicker
                    label="Cor do Cargo"
                    value={badgeConfig.roleColor || badgeConfig.textColor || "#ffffff"}
                    onChange={(val) => updateBadgeConfig({ roleColor: val })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <ColorPicker
                    label="Cor do Setor / Loja / Código"
                    value={badgeConfig.sectorColor || badgeConfig.textColor || "#ffffff"}
                    onChange={(val) => updateBadgeConfig({ sectorColor: val })}
                  />
                </div>
              </div>
            </div>
          </AdvancedSection>
        </div>

        {/* Right Column Settings */}
        <div className="flex-1 space-y-3">
          {/* Card 2: Field Data (Dados Exibidos) */}
          <AdvancedSection
            title="Dados Exibidos"
            icon={Sliders}
            isOpen={activeAccordion === "displayed_data"}
            onToggle={() => setActiveAccordion(activeAccordion === "displayed_data" ? null : "displayed_data")}
          >
            <div className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                  Selecionar Colaborador
                </label>
                
                <div className="relative">
                  {/* Custom Dropdown Trigger */}
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full flex items-center justify-between bg-black/40 border border-white/10 hover:border-cyan-500/30 rounded-xl px-3 py-2 text-xs text-white uppercase font-sans font-bold focus:outline-none transition-all cursor-pointer h-10"
                  >
                    <div className="flex items-center gap-2 text-left truncate">
                      {currentUserObj.id === "colab-sample-999" ? (
                        <div className="w-2 h-2 rounded-full bg-zinc-500 shrink-0" />
                      ) : currentUserObj.isAdmin ? (
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-pulse" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      )}
                      <span className="truncate">
                        {currentUserObj.fullName} ({currentUserObj.matricula || currentUserObj.login})
                      </span>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-white/50 shrink-0 ml-1" />
                  </button>

                  {/* Dropdown Menu Overlay */}
                  {isDropdownOpen && (
                    <>
                      {/* Transparent backdrop for clicks outside */}
                      <div 
                        className="fixed inset-0 z-30 cursor-default" 
                        onClick={() => setIsDropdownOpen(false)} 
                      />
                      
                      {/* Dropdown Card */}
                      <div className="absolute left-0 right-0 mt-1.5 bg-zinc-950 border border-white/10 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-40 flex flex-col max-h-[280px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Search Input block */}
                        <div className="p-2 border-b border-white/5 flex items-center gap-2 bg-white/[0.02]">
                          <Search className="w-3.5 h-3.5 text-white/30 shrink-0 ml-1.5" />
                          <input
                            type="text"
                            placeholder="Buscar colaborador..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent border-none text-xs text-white font-sans placeholder-white/20 focus:outline-none focus:ring-0 py-1"
                            autoFocus
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onClick={() => setSearchQuery("")}
                              className="text-[9px] font-black text-white/30 hover:text-white uppercase px-1.5 py-0.5 rounded-md hover:bg-white/5"
                            >
                              Limpar
                            </button>
                          )}
                        </div>

                        {/* scrollable items list */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                          {/* Fallback Sample User */}
                          {("exemplo joao de souza silva".includes(searchQuery.toLowerCase()) || searchQuery === "") && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedUserId("colab-sample-999");
                                setIsDropdownOpen(false);
                                setSearchQuery("");
                              }}
                              className={cn(
                                "w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all uppercase cursor-pointer",
                                selectedUserId === "colab-sample-999"
                                  ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                  : "text-white/60 hover:bg-white/5 border border-transparent"
                              )}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-mono shrink-0">
                                  S
                                </div>
                                <div className="truncate">
                                  <div className="font-bold truncate text-[11px]">JOÃO DE SOUZA SILVA</div>
                                  <div className="text-[8px] text-white/30 font-mono tracking-wider">EXEMPLO • admin</div>
                                </div>
                              </div>
                              {selectedUserId === "colab-sample-999" && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />
                              )}
                            </button>
                          )}

                          {/* Map actual system users */}
                          {filteredUsers.length > 0 ? (
                            filteredUsers.map((u) => {
                              const isSelected = selectedUserId === u.id;
                              const initials = u.fullName ? u.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "U";
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedUserId(u.id);
                                    setIsDropdownOpen(false);
                                    setSearchQuery("");
                                  }}
                                  className={cn(
                                    "w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold transition-all uppercase cursor-pointer",
                                    isSelected
                                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                      : "text-white/60 hover:bg-white/5 border border-transparent"
                                  )}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    {u.image ? (
                                      <img 
                                        src={u.image} 
                                        alt="" 
                                        className="w-5 h-5 rounded-md object-cover shrink-0 border border-white/10"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : (
                                      <div className={cn(
                                        "w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0",
                                        u.id === 'admin' ? "bg-cyan-500/20 text-cyan-400" : "bg-neutral-800 text-white/60"
                                      )}>
                                        {initials}
                                      </div>
                                    )}
                                    <div className="truncate">
                                      <div className="font-bold truncate text-[11px] flex items-center gap-1.5">
                                        {u.fullName}
                                        {u.id === 'admin' && (
                                          <span className="text-[7px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1 py-0.2 rounded font-mono font-black scale-90">ADM</span>
                                        )}
                                      </div>
                                      <div className="text-[8px] text-white/30 font-mono tracking-wider">
                                        {u.matricula || u.login} • {u.isAdmin ? 'ADMINISTRADOR' : 'COLABORADOR'}
                                      </div>
                                    </div>
                                  </div>
                                  {isSelected && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-2" />
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            // Empty state
                            filteredUsers.length === 0 && !("exemplo joao de souza silva".includes(searchQuery.toLowerCase()) || searchQuery === "") && (
                              <div className="p-4 text-center text-[9px] font-black text-white/20 uppercase tracking-widest">
                                Nenhum colaborador encontrado
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Config list of checkboxes */}
              <div className="pt-2 border-t border-white/5 space-y-1.5 text-[8.5px]">
                {[
                  { label: "Mostrar Foto do Colaborador", key: "showPhoto" },
                  { label: "Mostrar Nome do Colaborador", key: "showName" },
                  { label: "Mostrar Cargo (Grupo)", key: "showRole" },
                  { label: "Mostrar Função Específica", key: "showFunction" },
                  { label: "Mostrar Loja / Filial", key: "showStore" },
                  { label: "Mostrar Setor / Departamento", key: "showSector" },
                  { label: "Mostrar Matrícula (Código)", key: "showMatricula" },
                  { label: "Mostrar Logotipo (Frente)", key: "showLogo" },
                  { label: "Mostrar QR Code no Verso", key: "showQRCode" },
                ].map(({ label, key }) => {
                  const isActive = (badgeConfig as any)[key] !== false;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between text-white/60"
                    >
                      <span className="flex items-center gap-1.5 text-white/50">
                        <CheckCircle2
                          className={cn(
                            "w-3 h-3 shrink-0",
                            isActive ? "text-cyan-400" : "text-white/20",
                          )}
                        />{" "}
                        {label}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateBadgeConfig({ [key]: !isActive })}
                        className={cn(
                          "text-[7px] font-bold px-1.5 py-0.5 rounded transition-all active:scale-95 cursor-pointer",
                          isActive
                            ? "text-cyan-400 bg-cyan-500/10"
                            : "text-white/30 bg-white/5",
                        )}
                      >
                        {isActive ? "✓ EXIBIR" : "✕ OCULTAR"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </AdvancedSection>

          {/* Card 4: Unified QR Code settings */}
          <AdvancedSection
            title="Configuração & Estilo do QR Code"
            icon={QrCodeIcon}
            isOpen={activeAccordion === "qrcode"}
            onToggle={() => setActiveAccordion(activeAccordion === "qrcode" ? null : "qrcode")}
          >
            <div className="space-y-3.5 text-left">
              {/* Basic dimensions */}
              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black text-white/40 uppercase px-1">
                  <span>Tamanho do Logotipo (Frente)</span>
                  <span className="text-white/80 font-mono">
                    {badgeConfig.logoSize || 60} px
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="150"
                  value={badgeConfig.logoSize || 60}
                  onChange={(e) =>
                    updateBadgeConfig({
                      logoSize: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[8px] font-black text-white/40 uppercase px-1">
                  <span>Tamanho QR VERSO</span>
                  <span className="text-white/80 font-mono">
                    {badgeConfig.qrCodeSizeBack || 60} px
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="130"
                  value={badgeConfig.qrCodeSizeBack || 60}
                  onChange={(e) =>
                    updateBadgeConfig({
                      qrCodeSizeBack: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              {/* QR Code Colors */}
              <div className="pt-2 border-t border-white/5 space-y-3">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest px-1 block">
                  Cores do QR Code
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <ColorPicker
                    label="Cor Linhas QR"
                    value={badgeConfig.qrColor || "#18181b"}
                    onChange={(val) => updateBadgeConfig({ qrColor: val })}
                  />
                  <ColorPicker
                    label="Fundo QR"
                    value={badgeConfig.qrContainerColor || "#ffffff"}
                    onChange={(val) => updateBadgeConfig({ qrContainerColor: val })}
                  />
                </div>
              </div>

              {/* Advanced buttons & Visibility */}
              <div className="pt-2 border-t border-white/5 space-y-2.5">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest px-1 block">
                  Aparência & Exibição
                </span>
                
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => updateBadgeConfig({ qrTransparent: !badgeConfig.qrTransparent })}
                    className={cn(
                      "py-1.5 font-black text-[7.5px] uppercase tracking-wider rounded-xl border text-center transition-all cursor-pointer",
                      badgeConfig.qrTransparent
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                        : "bg-white/3 border-white/5 text-white/50 hover:bg-white/10"
                    )}
                  >
                    Fundo Transp.
                  </button>

                  <button
                    type="button"
                    onClick={() => updateBadgeConfig({ qrRounded: !badgeConfig.qrRounded })}
                    className={cn(
                      "py-1.5 font-black text-[7.5px] uppercase tracking-wider rounded-xl border text-center transition-all cursor-pointer",
                      badgeConfig.qrRounded
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                        : "bg-white/3 border-white/5 text-white/50 hover:bg-white/10"
                    )}
                  >
                    QR Redondo
                  </button>

                  <button
                    type="button"
                    onClick={() => updateBadgeConfig({ qrBorder: !badgeConfig.qrBorder })}
                    className={cn(
                      "py-1.5 font-black text-[7.5px] uppercase tracking-wider rounded-xl border text-center transition-all cursor-pointer",
                      badgeConfig.qrBorder
                        ? "bg-cyan-500/15 border-cyan-500/30 text-cyan-400"
                        : "bg-white/3 border-white/5 text-white/50 hover:bg-white/10"
                    )}
                  >
                    Borda do QR
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl">
                  <span className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none">
                    Visibilidade Geral
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateBadgeConfig({ showQRCode: !badgeConfig.showQRCode })
                    }
                    className={cn(
                      "px-2.5 py-1 text-[8px] font-black uppercase transition-all rounded-lg border",
                      badgeConfig.showQRCode
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : "bg-white/5 border-white/10 text-white/20",
                    )}
                  >
                    {badgeConfig.showQRCode ? "VISÍVEL" : "OCULTO"}
                  </button>
                </div>
              </div>
            </div>
          </AdvancedSection>

          {/* Right Column Advanced Accordions: Templates, Photo Style, QR Code Advanced, Visual Guides */}
          <AdvancedSection
            title="Temas Rápidos & Templates"
            icon={Sparkles}
            isOpen={activeAccordion === "templates"}
            onToggle={() => setActiveAccordion(activeAccordion === "templates" ? null : "templates")}
          >
            <div className="space-y-4 text-left">
              {/* Presets Grid */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 block">
                  Presets Rápidos de Fábrica
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {QUICK_THEMES.map((theme) => (
                    <button
                      key={theme.name}
                      type="button"
                      onClick={() => {
                        updateBadgeConfig({
                          ...theme.config,
                          roleColor: undefined,
                          sectorColor: undefined,
                        } as any);
                      }}
                      className="py-1.5 px-2 bg-white/3 border border-white/5 rounded-xl text-left font-black text-[9px] text-white/80 hover:bg-white/10 hover:border-cyan-500/40 transition-all select-none truncate flex items-center gap-1.5 cursor-pointer"
                    >
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: theme.config.accentColor }} />
                      <span className="truncate">{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Layout block */}
              <div className="border-t border-white/5 pt-3.5 space-y-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 block">
                  Salvar modelo atual
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nome do Modelo (ex: VIP Guard)"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newTemplateName.trim()) {
                        alert("Digite um nome para o modelo!");
                        return;
                      }
                      addBadgeTemplate(newTemplateName, badgeConfig);
                      setNewTemplateName("");
                    }}
                    className="px-3 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/35 text-cyan-400 text-[10px] font-black uppercase rounded-xl flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Salvar
                  </button>
                </div>
              </div>

              {/* Saved templates list */}
              {badgeSavedTemplates.length > 0 && (
                <div className="border-t border-white/5 pt-3 space-y-2">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1 block">
                    Modelos Personalizados Salvos ({badgeSavedTemplates.length})
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                    {badgeSavedTemplates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        className="flex items-center justify-between p-2 bg-black/20 rounded-xl border border-white/5"
                      >
                        <span className="text-xs text-zinc-300 truncate font-semibold max-w-[120px]">
                          {tmpl.name}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Carregar"
                            onClick={() => {
                              updateBadgeConfig(tmpl.config);
                            }}
                            className="p-1 text-[8px] font-black uppercase text-emerald-400 hover:bg-emerald-500/10 rounded-lg cursor-pointer transition-colors"
                          >
                            Carregar
                          </button>
                          <button
                            type="button"
                            title="Duplicar"
                            onClick={() => {
                              addBadgeTemplate(`${tmpl.name} (Cópia)`, tmpl.config);
                            }}
                            className="p-1 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Exportar"
                            onClick={() => {
                              const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tmpl.config));
                              const dlAnchorElem = document.createElement('a');
                              dlAnchorElem.setAttribute("href",     dataStr     );
                              dlAnchorElem.setAttribute("download", `erp-cracha-${tmpl.name.toLowerCase().replace(/\s+/g, '-')}.json`);
                              dlAnchorElem.click();
                            }}
                            className="p-1 text-sky-400 hover:text-sky-300 rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Excluir"
                            onClick={() => {
                              deleteBadgeTemplate(tmpl.id);
                            }}
                            className="p-1 text-red-400 hover:text-red-300 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Area toggle */}
              <div className="border-t border-white/5 pt-3.5">
                <button
                  type="button"
                  onClick={() => setShowImportArea(!showImportArea)}
                  className="w-full text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest block hover:underline cursor-pointer"
                >
                  {showImportArea ? "✕ Fechar Importador" : "↧ Importar Modelo Externo"}
                </button>
                {showImportArea && (
                  <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1">
                    <textarea
                      placeholder="Cole aqui o JSON exportado do modelo..."
                      value={importJsonText}
                      onChange={(e) => setImportJsonText(e.target.value)}
                      className="w-full h-16 bg-black/50 border border-white/10 rounded-xl p-2 text-[10px] text-zinc-300 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const parsed = JSON.parse(importJsonText);
                          if (parsed && typeof parsed === "object") {
                            updateBadgeConfig(parsed);
                            setImportJsonText("");
                            setShowImportArea(false);
                          } else {
                            alert("JSON inválido!");
                          }
                        } catch (err: any) {
                          alert(`Erro ao carregar JSON: ${err.message}`);
                        }
                      }}
                      className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      Importar Design
                    </button>
                  </div>
                )}
              </div>
            </div>
          </AdvancedSection>

          <AdvancedSection
            title="Design da Foto de Perfil"
            icon={ImageIcon}
            isOpen={activeAccordion === "photo"}
            onToggle={() => setActiveAccordion(activeAccordion === "photo" ? null : "photo")}
          >
            <div className="space-y-3.5 text-left">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Formato da Foto
                  </label>
                  <select
                    value={badgeConfig.photoShape || "squircle"}
                    onChange={(e) => updateBadgeConfig({ photoShape: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="round" className="bg-zinc-950 text-white">Circular (Arredondado)</option>
                    <option value="square" className="bg-zinc-950 text-white">Retangular 1:1</option>
                    <option value="squircle" className="bg-zinc-950 text-white">Curvas Suaves (Squircle)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Sombra da Foto
                  </label>
                  <select
                    value={badgeConfig.photoShadow || "md"}
                    onChange={(e) => updateBadgeConfig({ photoShadow: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="none" className="bg-zinc-950 text-white">Sem Sombra</option>
                    <option value="sm" className="bg-zinc-950 text-white">Sombra Leve</option>
                    <option value="md" className="bg-zinc-950 text-white">Sombra Média</option>
                    <option value="glow" className="bg-zinc-950 text-white">Brilho Sombreado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                    <span>Proporção</span>
                    <span className="text-white/80 font-mono">
                      x {badgeConfig.photoSizeMultiplier !== undefined ? badgeConfig.photoSizeMultiplier : 1.0}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.6"
                    max="1.4"
                    step="0.05"
                    value={badgeConfig.photoSizeMultiplier !== undefined ? badgeConfig.photoSizeMultiplier : 1.0}
                    onChange={(e) =>
                      updateBadgeConfig({ photoSizeMultiplier: parseFloat(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                    <span>Contorno</span>
                    <span className="text-white/80 font-mono">
                      {badgeConfig.photoBorderWidthPx !== undefined ? badgeConfig.photoBorderWidthPx : 2} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="6"
                    step="1"
                    value={badgeConfig.photoBorderWidthPx !== undefined ? badgeConfig.photoBorderWidthPx : 2}
                    onChange={(e) =>
                      updateBadgeConfig({ photoBorderWidthPx: parseInt(e.target.value) })
                    }
                    className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest px-1">
                    Alinhamento Foto
                  </label>
                  <select
                    value={badgeConfig.photoPosition || "center"}
                    onChange={(e) => updateBadgeConfig({ photoPosition: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500/50 cursor-pointer"
                  >
                    <option value="center" className="bg-zinc-950 text-white">Centro</option>
                    <option value="top" className="bg-zinc-950 text-white">Ao Topo</option>
                    <option value="bottom" className="bg-zinc-950 text-white">Abaixo (Base)</option>
                    <option value="left" className="bg-zinc-950 text-white">Esquerda</option>
                    <option value="right" className="bg-zinc-950 text-white">Direita</option>
                  </select>
                </div>

                <ColorPicker
                  label="Cor Contorno Foto"
                  value={badgeConfig.photoBorderColor || "#ffffff"}
                  onChange={(val) => updateBadgeConfig({ photoBorderColor: val })}
                />
              </div>
            </div>
          </AdvancedSection>

          <AdvancedSection
            title="Guia Visual & Preview Real"
            icon={Eye}
            isOpen={activeAccordion === "guides"}
            onToggle={() => setActiveAccordion(activeAccordion === "guides" ? null : "guides")}
          >
            <div className="space-y-3.5 text-left">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] font-black text-white/40 uppercase px-1">
                  <span>Zoom do Preview Virtual</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setZoomScale(1.0)}
                      className="text-[8px] font-black text-cyan-400 hover:underline hover:text-cyan-300"
                    >
                      Reset (100%)
                    </button>
                    <span className="text-white/80 font-mono">
                      {Math.round(zoomScale * 100)} %
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={zoomScale}
                  onChange={(e) => setZoomScale(parseFloat(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>

              <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl text-left">
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-wider leading-none">
                    Área Segura (Safe Zone)
                  </span>
                  <span className="text-[7.5px] font-black text-white/30 uppercase tracking-widest mt-0.5 max-w-[150px]">
                    Visualiza bordas críticas de corte (PDF 300 DPI)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBadgeConfig({ showSafeMargin: !badgeConfig.showSafeMargin })
                  }
                  className={cn(
                    "px-2 py-0.5 text-[8px] font-black uppercase transition-all rounded-lg border cursor-pointer",
                    badgeConfig.showSafeMargin
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : "bg-white/5 border-white/10 text-white/20",
                  )}
                >
                  {badgeConfig.showSafeMargin ? "FRENTE" : "OCULTO"}
                </button>
              </div>

              <div className="flex items-center justify-between p-2 bg-black/20 rounded-xl border border-white/5 text-left">
                <div className="flex flex-col text-left max-w-[170px]">
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-wider leading-none">
                    Cores por Cargo (Auto)
                  </span>
                  <span className="text-[7.5px] font-black text-white/30 uppercase tracking-widest mt-0.5">
                    Modifica tema do crachá conforme cargo (ADM/WMS/Faturamento)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBadgeConfig({ autoRoleStyleEnabled: !badgeConfig.autoRoleStyleEnabled })
                  }
                  className={cn(
                    "px-2 py-0.5 text-[8px] font-black uppercase transition-all rounded-lg border cursor-pointer",
                    badgeConfig.autoRoleStyleEnabled
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-white/5 border-white/10 text-white/20",
                  )}
                >
                  {badgeConfig.autoRoleStyleEnabled ? "AUTOMÁTICO" : "MANUAL"}
                </button>
              </div>
            </div>
          </AdvancedSection>

          {/* Card 3: Módulo de Saída (Ações de Geração) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-500/15 rounded-lg text-emerald-400">
                <Printer className="w-3.5 h-3.5" />
              </div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Módulo de Saída
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
              <button
                type="button"
                onClick={handleGenerateBadgePDF}
                disabled={isGenerating}
                className="py-3 px-4 bg-zinc-900 border border-white/10 hover:border-emerald-500/30 hover:bg-zinc-850 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-155 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Download className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
                {isGenerating ? "Gerando..." : "Gerar PDF"}
              </button>

              <button
                type="button"
                onClick={handlePhysicalPrintBadge}
                className="py-3 px-4 bg-zinc-900 border border-white/10 hover:border-cyan-500/30 hover:bg-zinc-850 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-155 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
              >
                <Printer className="w-4 h-4 text-cyan-400 shrink-0" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Section - Refactored to focus on the Badge Visual, not the Paper */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-visible lg:overflow-hidden relative bg-black/20 rounded-[2.5rem] border border-white/5">
        {currentUserObj.id === "colab-sample-999" && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-3 flex items-center justify-center gap-2 relative z-20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-450 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest text-center">
              PRÉ-VISUALIZAÇÃO — COLABORADOR MODELO (APENAS PARA VISUALIZAR DESIGN)
            </span>
          </div>
        )}
        {/* Background Decoration */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/[0.02] blur-[150px] rounded-full" />
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-purple-500/[0.02] blur-[100px] rounded-full" />
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 sm:p-8 min-h-0 overflow-visible lg:overflow-y-auto custom-scrollbar">
          <div className="flex flex-col xl:flex-row gap-8 xl:gap-14 items-stretch justify-center py-4">
            {/* Frontend Preview */}
            <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-8 duration-500">
              <div className="flex items-center gap-3 bg-white/5 px-4 py-1 rounded-full border border-white/5">
                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">
                  Frente do Crachá
                </span>
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              </div>
              <div className={cn(
                "shadow-[0_25px_60px_rgba(0,0,0,0.55)] overflow-hidden transition-all duration-300",
                badgeConfig.cornerStyle === 'v2' ? 'rounded-none' : 'rounded-[1.5rem]'
              )}
              style={{ transform: `scale(${zoomScale})`, transformOrigin: "center center" }}
              >
                <Badge
                  user={currentUserObj}
                  role={userRole}
                  config={badgeConfig}
                  viewType="frente"
                  preview={true}
                  ignorePaper={true}
                  id="badge-preview-frente"
                />
              </div>

            </div>

            {/* Divider for XL */}
            <div className="hidden xl:flex flex-col items-center justify-center gap-4 py-6">
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
              <div className="w-6 h-6 rounded-full bg-white/2 border border-white/5 flex items-center justify-center">
                <RefreshCw className="w-2.5 h-2.5 text-white/10" />
              </div>
              <div className="w-px flex-1 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
            </div>

            {/* Backend Preview */}
            <div className="flex flex-col items-center gap-4 animate-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center gap-3 bg-white/5 px-4 py-1 rounded-full border border-white/5">
                <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">
                  Verso do Crachá
                </span>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div className={cn(
                "shadow-[0_25px_60px_rgba(0,0,0,0.55)] overflow-hidden transition-all duration-300",
                badgeConfig.cornerStyle === 'v2' ? 'rounded-none' : 'rounded-[1.5rem]'
              )}
              style={{ transform: `scale(${zoomScale})`, transformOrigin: "center center" }}
              >
                <Badge
                  user={currentUserObj}
                  role={userRole}
                  config={badgeConfig}
                  viewType="verso"
                  preview={true}
                  ignorePaper={true}
                  id="badge-preview-verso"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar - Compact */}
        <div className="relative z-10 flex items-center justify-between px-8 py-3 bg-white/2 border-t border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">
                Preview Live Modo Real
              </span>
            </div>
            <div className="h-3 w-px bg-white/5" />
            <div className="flex items-center gap-2.5">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-widest leading-none">
                DPI: <span className="text-white/80">300 (High)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em]">
              LUKASFE INDUSTRIAL SYSTEM v1.2.0
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
