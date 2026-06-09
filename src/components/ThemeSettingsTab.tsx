import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Palette, 
  Upload, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  HelpCircle, 
  Sparkles, 
  AlertTriangle, 
  Eye, 
  EyeOff,
  Files,
  FileCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, ImageTheme } from '../store';

const DOCUMENT_TYPES = [
  { id: 'thermal_receipt', label: 'Recibo Térmico' },
  { id: 'order_ticket', label: 'Cupom Pedido' },
  { id: 'labels', label: 'Etiqueta' },
  { id: 'bulk_labels', label: 'Lote de Etiquetas' },
  { id: 'customer_experience', label: 'Mensagem' },
];

const PAPER_SIZES_META = [
  { id: 'a4', label: 'A4 (210x297mm)', width: 210, height: 297 },
  { id: 'a5', label: 'A5 (148x210mm)', width: 148, height: 210 },
  { id: 'a6', label: 'A6 (105x148mm)', width: 105, height: 148 },
  { id: 'bobina80', label: 'Bobina 80mm', width: 80, height: 160 },
  { id: 'bobina58', label: 'Bobina 58mm', width: 58, height: 120 },
];

const FIT_MODES = [
  { id: 'cover', label: 'Preencher Papel (Cover)', desc: 'Preenche toda a área disponível' },
  { id: 'contain', label: 'Conter no Papel (Contain)', desc: 'Mantém a imagem inteira visível' },
  { id: 'repeat', label: 'Repetir (Pattern)', desc: 'Cria um mosaico repetido' },
  { id: 'center', label: 'Centralizar (Original Size)', desc: 'Mostra no tamanho real no centro' },
];

// High quality abstract grid background placeholders in SVG Base64 form to serve as gorgeous examples
const DEFAULT_BG_STATIONS = [
  {
    id: 'demo-papai',
    name: 'Dia dos Pais',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="60" h="60" viewBox="0 0 60 60"><path d="M10 20 L30 40 L50 20 L40 10 L30 20 L20 10 Z" fill="none" stroke="%233b82f6" stroke-width="2" stroke-opacity="0.15"/><path d="M30 40 L30 60" fill="none" stroke="%233b82f6" stroke-width="2" stroke-opacity="0.15"/></svg>',
    opacity: 15,
    position: 'center',
    fitMode: 'repeat' as const,
    active: true,
    category: 'standard' as const,
    documents: ['thermal_receipt', 'order_ticket', 'customer_experience'],
    papers: ['a5', 'a6', 'bobina80', 'bobina58'],
  },
  {
    id: 'demo-natal',
    name: 'Natal Mágico',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><polygon points="20,10 25,22 15,22" fill="none" stroke="%2310b981" stroke-width="1.5" stroke-opacity="0.2"/><polygon points="20,16 24,26 16,26" fill="none" stroke="%2310b981" stroke-width="1.5" stroke-opacity="0.2"/><line x1="20" y1="26" x2="20" y2="30" stroke="%23b45309" stroke-width="2" stroke-opacity="0.3"/></svg>',
    opacity: 20,
    position: 'center',
    fitMode: 'repeat' as const,
    active: true,
    category: 'standard' as const,
    documents: ['thermal_receipt', 'order_ticket', 'customer_experience'],
    papers: ['a4', 'a5', 'a6', 'bobina80'],
  },
  {
    id: 'demo-promo',
    name: 'Promoção Especial (Estrela)',
    backgroundImage: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><polygon points="50,15 61,38 86,38 66,54 73,79 50,64 27,79 34,54 14,38 39,38" fill="none" stroke="%23ef4444" stroke-width="2" stroke-opacity="0.15" /></svg>',
    opacity: 10,
    position: 'center',
    fitMode: 'center' as const,
    active: true,
    category: 'label' as const,
    documents: ['labels', 'bulk_labels'],
    papers: [],
    labelWidth: 50,
    labelHeight: 30
  }
];

export default function ThemeSettingsTab() {
  const imageThemes = useStore((state) => state.imageThemes);
  const addImageTheme = useStore((state) => state.addImageTheme);
  const updateImageTheme = useStore((state) => state.updateImageTheme);
  const deleteImageTheme = useStore((state) => state.deleteImageTheme);

  // Safe CSS url helper to prevent SVG markup from breaking style declarations
  const getSafeCssUrl = (bgImage: string): string => {
    if (!bgImage) return '';
    if (bgImage.startsWith('data:image/svg+xml;utf8,')) {
      const rawSvg = bgImage.substring('data:image/svg+xml;utf8,'.length);
      const encoded = encodeURIComponent(rawSvg)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
      return `url("data:image/svg+xml;charset=utf-8,${encoded}")`;
    }
    const escaped = bgImage.replace(/"/g, '\\"');
    return `url("${escaped}")`;
  };

  const [activeCategory, setActiveCategory] = useState<'standard' | 'label'>('standard');
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  
  // New/Edit Theme form state
  const [name, setName] = useState('');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [opacity, setOpacity] = useState(20);
  const position = 'center';
  const [fitMode, setFitMode] = useState<'cover' | 'contain' | 'repeat' | 'center'>('center');
  const [active, setActive] = useState(true);
  const [selectedDocs, setSelectedDocs] = useState<string[]>(['thermal_receipt', 'order_ticket', 'customer_experience']);
  const [selectedPapers, setSelectedPapers] = useState<string[]>(['a4', 'a5', 'a6', 'bobina80', 'bobina58']);
  const [labelWidth, setLabelWidth] = useState<number>(90);
  const [labelHeight, setLabelHeight] = useState<number>(35);
  const [isEditing, setIsEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize form to add empty theme
  const startNewTheme = () => {
    setName('');
    setBackgroundImage('');
    setOpacity(20);
    setFitMode('center');
    setActive(true);
    setSelectedDocs(activeCategory === 'standard' ? ['thermal_receipt', 'order_ticket', 'customer_experience'] : ['labels', 'bulk_labels']);
    setSelectedPapers(activeCategory === 'standard' ? ['a4', 'a5', 'a6', 'bobina80', 'bobina58'] : []);
    setLabelWidth(90);
    setLabelHeight(35);
    setActiveThemeId(null);
    setIsEditing(true);
    setErrorMsg('');
  };

  const loadThemeForEdit = (theme: ImageTheme) => {
    setActiveThemeId(theme.id);
    setName(theme.name);
    setBackgroundImage(theme.backgroundImage || '');
    setOpacity(theme.opacity ?? 20);
    setFitMode(theme.fitMode || 'center');
    setActive(theme.active !== false);
    setSelectedDocs(theme.documents || []);
    setSelectedPapers(theme.papers || []);
    setLabelWidth(theme.labelWidth ?? 90);
    setLabelHeight(theme.labelHeight ?? 35);
    setIsEditing(true);
    setErrorMsg('');
  };

  const compressImage = (base64Str: string, maxDim: number = 800, quality: number = 0.70): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        
        // Scale down if larger than maxDim
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('A imagem deve ter no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64, 800, 0.70);
      setBackgroundImage(compressed);
      setErrorMsg('');
    };
    reader.readAsDataURL(file);
  };

  const removeBgImage = () => {
    setBackgroundImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleDocApplicability = (docId: string) => {
    setSelectedDocs(prev => 
      prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
    );
  };

  const togglePaperApplicability = (paperId: string) => {
    setSelectedPapers(prev => 
      prev.includes(paperId) ? prev.filter(id => id !== paperId) : [...prev, paperId]
    );
  };

  const saveThemeConfig = () => {
    if (!name.trim()) {
      setErrorMsg('Por favor, informe o nome do tema.');
      return;
    }
    if (!backgroundImage) {
      setErrorMsg('Por favor, carregue uma imagem de fundo para o tema.');
      return;
    }

    const currentThemeCategory = activeThemeId
      ? (imageThemes.find(t => t.id === activeThemeId)?.category || 'standard')
      : activeCategory;

    const themePayload: ImageTheme = {
      id: activeThemeId || `theme-${Date.now()}`,
      name,
      category: currentThemeCategory,
      backgroundImage,
      opacity,
      position,
      fitMode,
      active,
      documents: currentThemeCategory === 'standard' ? selectedDocs : ['labels', 'bulk_labels'],
      papers: currentThemeCategory === 'standard' ? selectedPapers : [],
      labelWidth: currentThemeCategory === 'label' ? labelWidth : undefined,
      labelHeight: currentThemeCategory === 'label' ? labelHeight : undefined
    };

    if (activeThemeId) {
      updateImageTheme(activeThemeId, themePayload);
    } else {
      addImageTheme(themePayload);
    }

    setIsEditing(false);
    setActiveThemeId(null);
    setName('');
    setBackgroundImage('');
  };

  // Preview paper properties for demo
  const [selectedPreviewPaper, setSelectedPreviewPaper] = useState('a6');
  const previewPaperMeta = PAPER_SIZES_META.find(p => p.id === selectedPreviewPaper) || PAPER_SIZES_META[2];

  const currentThemeCategory = activeThemeId
    ? (imageThemes.find(t => t.id === activeThemeId)?.category || 'standard')
    : activeCategory;

  return (
    <div className="flex flex-col p-4 md:p-6 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* Action Header bar (no duplicated titles) */}
      {!isEditing && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-white/5">
          {/* CATEGORY SELECTOR TABS */}
          <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveCategory('standard')}
              className={cn(
                "px-3 py-1.5 md:px-5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeCategory === 'standard' ? "bg-cyan-500 text-black shadow-md font-black" : "text-white/60 hover:text-white"
              )}
            >
              <Palette className="w-3.5 h-3.5" /> Recibo / Cupom / Mensagem
            </button>
            <button
              onClick={() => setActiveCategory('label')}
              className={cn(
                "px-3 py-1.5 md:px-5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                activeCategory === 'label' ? "bg-cyan-500 text-black shadow-md font-black" : "text-white/60 hover:text-white"
              )}
            >
              <Sparkles className="w-3.5 h-3.5" /> Etiquetas
            </button>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={startNewTheme}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            >
              <Plus className="w-4 h-4 text-black stroke-[3px]" /> Novo Tema
            </button>
          </div>
        </div>
      )}

      {isEditing ? (
        /* EDIT / NEW THEME FORM SCREEN */
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1.2fr] gap-6">
          <div className="bg-white/2 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
            
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                {activeThemeId 
                  ? `Editar Tema (${currentThemeCategory === 'label' ? 'Etiquetas' : 'Recibo / Cupom / Mensagem'})` 
                  : `Cadastrar Novo Tema (${currentThemeCategory === 'label' ? 'Etiquetas' : 'Recibo / Cupom / Mensagem'})`}
              </span>
              <button 
                onClick={() => setIsEditing(false)}
                className="p-1 hover:bg-white/5 rounded-lg text-white/30 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2 text-red-400 text-[10px] uppercase font-bold tracking-wider">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Field: Nome */}
              <div className="space-y-1.5 col-span-2">
                <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">Nome do Tema</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Natal Mágico, Black Friday, Dia das Mães..."
                  className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all font-medium placeholder:text-white/20"
                />
              </div>

              {/* Field: Upload da Imagem */}
              <div className="space-y-1.5">
                <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">Imagem de Fundo (PNG, JPG, SVG)</label>
                <div className="flex items-center gap-3">
                  <div className="relative group flex-1">
                    <div className="h-9 bg-black/40 border border-white/10 rounded-xl px-3 flex items-center justify-between text-xs text-white/40 hover:border-cyan-500/30 transition-all cursor-pointer overflow-hidden">
                      <span className="truncate text-[10px] font-mono">
                        {backgroundImage ? 'Fundo carregado!' : 'Selecione uma imagem...'}
                      </span>
                      <Upload className="w-4 h-4 text-white/40 group-hover:text-cyan-400 flex-shrink-0 ml-2" />
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  {backgroundImage && (
                    <button
                      onClick={removeBgImage}
                      className="p-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-red-400 hover:text-red-300 transition-all active:scale-95 cursor-pointer"
                      title="Deletar imagem"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Field: Opacidade */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Opacidade da Imagem</label>
                  <span className="text-[10px] text-cyan-400 font-mono font-bold">{opacity}%</span>
                </div>
                <div className="flex items-center gap-2.5 h-9 px-2 bg-black/40 border border-white/10 rounded-xl">
                  <input 
                    type="range" 
                    min={2} 
                    max={100} 
                    step={1}
                    value={opacity}
                    onChange={(e) => setOpacity(parseInt(e.target.value))}
                    className="flex-1 accent-cyan-400 h-1 bg-white/10 rounded-full cursor-pointer"
                  />
                </div>
              </div>

              {/* Field: Ajuste do Tema (Fit Mode) */}
              <div className="space-y-1.5">
                <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">Ajuste / Dimensionamento</label>
                <select
                  value={fitMode}
                  onChange={(e) => setFitMode(e.target.value as 'cover' | 'contain' | 'repeat' | 'center')}
                  className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all font-medium"
                >
                  {FIT_MODES.map((option) => (
                    <option key={option.id} value={option.id} className="bg-zinc-950 text-white">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reference Dimension inputs ONLY for Labels */}
              {currentThemeCategory === 'label' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1 font-sans">Largura da Etiqueta (mm)</label>
                    <input 
                      type="number" 
                      min={10} 
                      max={200}
                      value={labelWidth}
                      onChange={(e) => setLabelWidth(Math.max(10, parseInt(e.target.value) || 40))}
                      className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1 font-sans">Altura da Etiqueta (mm)</label>
                    <input 
                      type="number" 
                      min={10} 
                      max={200}
                      value={labelHeight}
                      onChange={(e) => setLabelHeight(Math.max(10, parseInt(e.target.value) || 25))}
                      className="w-full h-9 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-cyan-500/50 transition-all font-mono"
                    />
                  </div>
                </>
              )}

              {/* Toggle Status Ativo */}
              <div className="space-y-1.5 col-span-2">
                <label className="text-[8px] text-white/30 uppercase font-bold tracking-widest px-1">Status do Tema</label>
                <button
                  type="button"
                  onClick={() => setActive(!active)}
                  className={cn(
                    "w-full h-10 px-4 rounded-xl border flex items-center justify-between text-xs transition-all active:scale-[0.99] cursor-pointer font-bold uppercase",
                    active
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                      : "bg-red-500/10 border-red-500/20 text-red-400"
                  )}
                >
                  <span className="tracking-wider">{active ? 'Tema Ativo' : 'Tema Inativo'}</span>
                  {active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {currentThemeCategory === 'standard' && (
              <>
                {/* Document applicability target checkboxes */}
                <div className="space-y-2 mt-2 animate-in fade-in">
                  <label className="text-[8px] text-white/40 uppercase font-black tracking-widest flex items-center gap-1.5">
                    <Files className="w-3.5 h-3.5 text-cyan-400" /> Aplicar Tema nos seguintes Documentos:
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {[
                      { id: 'thermal_receipt', label: 'Recibo Térmico' },
                      { id: 'order_ticket', label: 'Cupom Pedido' },
                      { id: 'customer_experience', label: 'Mensagem' },
                    ].map((doc) => {
                      const isChecked = selectedDocs.includes(doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => toggleDocApplicability(doc.id)}
                          className={cn(
                            "p-2.5 rounded-xl border flex items-center justify-between text-left cursor-pointer transition-all",
                            isChecked
                              ? "bg-cyan-500/5 border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase"
                              : "bg-black/20 border-white/5 text-white/50 text-[10px]"
                          )}
                        >
                          <span className="truncate">{doc.label}</span>
                          <div className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ml-2",
                            isChecked ? "border-cyan-400 bg-cyan-400/20 text-cyan-400" : "border-white/10"
                          )}>
                            {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Paper applicability target checkboxes */}
                <div className="space-y-2 mt-2 animate-in fade-in">
                  <label className="text-[8px] text-white/40 uppercase font-black tracking-widest flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-cyan-400" /> Aplicar nos seguintes tamanhos de Papel:
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {PAPER_SIZES_META.map((paper) => {
                      const isChecked = selectedPapers.includes(paper.id);
                      return (
                        <button
                          key={paper.id}
                          type="button"
                          onClick={() => togglePaperApplicability(paper.id)}
                          className={cn(
                            "p-2.5 rounded-xl border flex items-center justify-between text-left cursor-pointer transition-all",
                            isChecked
                              ? "bg-cyan-500/5 border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase"
                              : "bg-black/20 border-white/5 text-white/50 text-[10px]"
                          )}
                        >
                          <span className="truncate">{paper.label}</span>
                          <div className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ml-2",
                            isChecked ? "border-cyan-400 bg-cyan-400/20 text-cyan-400" : "border-white/10"
                          )}>
                            {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 border-t border-white/5 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-white/60 text-[10px] font-black uppercase tracking-wider rounded-xl transition-colors cursor-pointer active:scale-95"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveThemeConfig}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              >
                Salvar Tema
              </button>
            </div>

          </div>

          {/* SIMULATED PAPER OR LABEL PREVIEW PANEL */}
          <div className="flex flex-col gap-3">
            <div className="bg-white/2 border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-3">
              <div className="w-full flex items-center justify-between">
                <span className="text-[10px] font-black text-white/70 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  <Eye className="w-4 h-4 text-cyan-400" /> Preview {currentThemeCategory === 'label' ? 'da Etiqueta' : 'do Fundo'}
                </span>
                
                {currentThemeCategory === 'standard' && (
                  /* Switch Paper Selector */
                  <select
                    value={selectedPreviewPaper}
                    onChange={(e) => setSelectedPreviewPaper(e.target.value)}
                    className="bg-[#0c0c0c] border border-white/10 text-white text-[9px] font-black uppercase tracking-wide rounded-lg px-2 py-1 focus:outline-none"
                  >
                    {PAPER_SIZES_META.map(p => (
                      <option key={p.id} value={p.id}>{p.id.toUpperCase()}</option>
                    ))}
                  </select>
                )}
              </div>

              {currentThemeCategory === 'standard' ? (
                /* Physical scaled paper model simulated in clean 2D slate */
                <div className="w-full aspect-[3/4] max-h-[380px] bg-black/40 rounded-xl flex items-center justify-center p-4 border border-dashed border-white/5 relative overflow-hidden">
                  <div 
                    style={{
                      width: '100%',
                      height: '100%',
                      maxWidth: `${previewPaperMeta.width * 1.5}px`,
                      maxHeight: `${previewPaperMeta.height * 1.5}px`,
                      background: '#ffffff',
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: '4px',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.6)'
                    }}
                    className="transition-all duration-300"
                  >
                    {/* Dynamic background theme layer */}
                    {backgroundImage && (
                      <div 
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundImage: getSafeCssUrl(backgroundImage),
                          backgroundSize: fitMode === 'cover' ? 'cover' : fitMode === 'contain' ? 'contain' : 'auto',
                          backgroundRepeat: fitMode === 'repeat' ? 'repeat' : 'no-repeat',
                          backgroundPosition: 'center',
                          opacity: opacity / 100,
                          pointerEvents: 'none',
                          zIndex: 0
                        }}
                      />
                    )}

                    {/* Dummy visual content simulating typography */}
                    <div className="absolute inset-0 p-3 flex flex-col justify-between" style={{ zIndex: 1, pointerEvents: 'none' }}>
                      <div className="space-y-1">
                        <div className="w-1/3 h-2 bg-zinc-200 rounded" />
                        <div className="w-2/3 h-3 bg-zinc-300 rounded" />
                      </div>
                      
                      <div className="border-t border-dashed border-zinc-200 py-1 space-y-1 font-sans">
                        <div className="w-full h-1.5 bg-zinc-100 rounded" />
                        <div className="w-5/6 h-1.5 bg-zinc-100 rounded" />
                        <div className="w-4/5 h-1.5 bg-zinc-100 rounded" />
                      </div>
                      
                      <div className="flex justify-between items-center">
                        <div className="w-12 h-12 bg-zinc-100 rounded border border-zinc-200/50 flex items-center justify-center">
                          <span className="text-[6px] text-zinc-300 font-mono">[QR CODE]</span>
                        </div>
                        <div className="w-1/3 h-5 bg-zinc-200 rounded" />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Label preview model */
                <div className="w-full aspect-[4/3] max-h-[380px] bg-black/40 rounded-xl flex items-center justify-center p-4 border border-dashed border-white/5 relative overflow-hidden">
                  <div 
                    style={{
                      width: '100%',
                      height: '100%',
                      maxWidth: '220px',
                      aspectRatio: `${labelWidth} / ${labelHeight}`,
                      background: '#ffffff',
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: '6px',
                      border: '1.5px dashed rgba(239, 68, 68, 0.4)',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: '8px',
                      boxSizing: 'border-box'
                    }}
                    className="transition-all duration-300 animate-in zoom-in-95 duration-200"
                  >
                    {/* Dynamic background theme layer */}
                    {backgroundImage && (
                      <div 
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundImage: getSafeCssUrl(backgroundImage),
                          backgroundSize: fitMode === 'cover' ? 'cover' : fitMode === 'contain' ? 'contain' : 'auto',
                          backgroundRepeat: fitMode === 'repeat' ? 'repeat' : 'no-repeat',
                          backgroundPosition: 'center',
                          opacity: opacity / 100,
                          pointerEvents: 'none',
                          zIndex: 0
                        }}
                      />
                    )}

                    {/* Dummy content simulating label layout */}
                    <div className="relative z-10 w-full h-full flex flex-col justify-between text-left font-sans">
                      {/* Top line: Product Name & Category */}
                      <div className="flex justify-between items-center text-[7.5px] font-bold text-zinc-900 uppercase tracking-wide border-b border-zinc-100 pb-0.5 mb-0.5">
                        <span className="truncate max-w-[65%] font-black text-zinc-900">Pikachu Pelúcia Colores</span>
                        <span className="truncate max-w-[30%] text-right text-zinc-400 font-bold">GERAL</span>
                      </div>

                      {/* Middle row: SKU, vary, stock and QR Code */}
                      <div className="flex items-center justify-between gap-1 mt-0.5 flex-1 select-none">
                        <div className="flex flex-col justify-center space-y-0.5">
                          {/* SKU */}
                          <div className="text-[6px] font-mono leading-none text-zinc-655 flex items-center">
                            <span className="text-[5.5px] text-zinc-400 font-sans font-bold uppercase mr-1">SKU:</span>
                            <span className="font-bold">PK-001-Y</span>
                          </div>
                          
                          {/* Variation */}
                          <div className="text-[6px] leading-none text-zinc-600 flex items-center">
                            <span className="text-[5.5px] text-zinc-400 font-sans font-bold uppercase mr-1">VAR:</span>
                            <span className="font-bold font-mono font-bold">Amarelo / G</span>
                          </div>

                          {/* Stock Count */}
                          <div className="text-[6px] leading-none text-zinc-600 flex items-center">
                            <span className="text-[5.5px] text-zinc-400 font-sans font-bold uppercase mr-1">ESTOQUE:</span>
                            <span className="font-bold font-mono">15 UN</span>
                          </div>
                        </div>

                        {/* QR Code Container */}
                        <div className="bg-white border border-zinc-200 p-0.5 rounded flex-shrink-0 flex items-center justify-center overflow-hidden w-7 h-7">
                          <QRCodeSVG
                            value="PK-001-Y"
                            style={{ width: '100%', height: '100%' }}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                      </div>

                      {/* Bottom Bar: Price */}
                      <div className="flex items-end justify-between mt-0.5 pt-0.5 border-t border-zinc-150">
                        <div>
                          <div className="leading-none">
                            <span className="text-[5px] font-bold text-zinc-400 uppercase tracking-widest block font-sans">Preço</span>
                            <span className="text-[8px] font-black tracking-tight text-zinc-900 font-sans">
                              R$ 159,90
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[8px] text-white/30 uppercase text-center tracking-widest leading-normal max-w-xs mt-1">
                {currentThemeCategory === 'standard'
                  ? `Visualização provisória do papel proporcional de ${previewPaperMeta.width}mm x ${previewPaperMeta.height}mm.`
                  : `Visualização da etiqueta proporcional de ${labelWidth}mm x ${labelHeight}mm.`}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LIST SCREEN OF THEMES */
        <div className="flex flex-col gap-4">
          {imageThemes.filter(theme => (theme.category || 'standard') === activeCategory).length === 0 ? (
            <div className="bg-white/2 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-14 h-14 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-400">
                <Palette className="w-8 h-8 stroke-[1.5]" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-white text-xs font-black uppercase tracking-wider">Nenhum Tema Cadastrado</h3>
                <p className="text-white/40 text-[10px] uppercase font-bold tracking-widest max-w-sm">
                  {activeCategory === 'standard' 
                    ? 'Crie um tema visual global para aplicar imagens decorativas com opacidade no fundo dos seus recibos, cupons ou mensagens.'
                    : 'Crie um tema visual específico para etiquetas, que se adapta ao tamanho da etiqueta e não se projeta na folha.'}
                </p>
              </div>
              <button
                onClick={startNewTheme}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-cyan-400 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
              >
                Começar Cadastro
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {imageThemes
                .filter((theme) => (theme.category || 'standard') === activeCategory)
                .map((theme) => (
                  <div 
                    key={theme.id}
                    className={cn(
                      "bg-white/2 border rounded-2xl p-4 flex flex-col justify-between gap-4 group transition-all duration-300 hover:border-cyan-500/20 hover:bg-white/[0.04] relative overflow-hidden",
                      theme.active === false ? "border-white/5 opacity-60" : "border-white/10"
                    )}
                  >
                    {/* Miniature abstract background inside card */}
                    <div 
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: 12,
                        width: '60px',
                        height: theme.category === 'label' ? '40px' : '60px',
                        borderRadius: theme.category === 'label' ? '4px' : '8px',
                        border: theme.category === 'label' ? '1px dashed rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                        backgroundImage: getSafeCssUrl(theme.backgroundImage),
                        backgroundSize: 'contain',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        opacity: (theme.opacity || 20) / 100,
                        pointerEvents: 'none',
                        zIndex: 0
                      }}
                    />

                    <div className="space-y-2 relative" style={{ zIndex: 1 }}>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full",
                          theme.active !== false ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"
                        )} />
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">{theme.name}</h4>
                      </div>

                      <div className="flex flex-col gap-1.5 font-mono text-[8px] text-white/40 uppercase">
                        <div className="flex justify-between">
                          <span>Opacidade:</span>
                          <strong className="text-white/80">{theme.opacity}%</strong>
                        </div>
                        {theme.category === 'label' ? (
                          <div className="flex justify-between">
                            <span>Medida Ref:</span>
                            <strong className="text-white/80">{theme.labelWidth || 40}mm x {theme.labelHeight || 25}mm</strong>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span>Ajuste:</span>
                            <strong className="text-white/80">{theme.fitMode}</strong>
                          </div>
                        )}
                      </div>

                      {/* Metadata Badges of scope of use */}
                      {(!theme.category || theme.category === 'standard') && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-white/50 font-black tracking-wider uppercase">
                            Docs: {theme.documents?.length || 0}
                          </span>
                          <span className="px-1.5 py-0.5 bg-white/5 rounded text-[7px] text-white/50 font-black tracking-wider uppercase">
                            Papéis: {theme.papers?.length || 0}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 border-t border-white/5 pt-3 relative" style={{ zIndex: 1 }}>
                      <button
                        onClick={() => loadThemeForEdit(theme)}
                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-white/70 hover:text-white text-[9px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer active:scale-95"
                      >
                        Editar Configuração
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Tem certeza de que deseja excluir o tema "${theme.name}"?`)) {
                            deleteImageTheme(theme.id);
                            alert(`Tema "${theme.name}" excluído com sucesso!`);
                          }
                        }}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 rounded-xl transition-all cursor-pointer active:scale-95"
                        title="Deletar tema"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
