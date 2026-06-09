import React, { useState, useMemo, FormEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Package, 
  Search, 
  Plus, 
  Minus,
  Edit2, 
  Trash2, 
  X,
  Save,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Layers,
  MapPin,
  Tag,
  DollarSign,
  Box,
  Truck,
  Image as ImageIcon,
  Camera,
  RefreshCw,
  Info,
  ChevronRight,
  Palette,
  Printer,
  FileText,
  RotateCcw,
  Check,
  Filter,
  Upload
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Product, Category, Subcategory } from '../store';
import MasterPasswordModal from '../components/MasterPasswordModal';

// Label and PDF rendering integration (temporarily deactivated for maintenance)

const CATEGORY_COLOR_PRESETS = [
  '#f59e0b', // Amarelo/Amber
  '#ef4444', // Vermelho
  '#3b82f6', // Azul
  '#10b981', // Verde/Emerald
  '#8b5cf6', // Roxo/Violet
  '#ec4899', // Rosa/Pink
  '#06b6d4', // Ciano
  '#14b8a6', // Teal
  '#f97316', // Laranja
  '#6b7280', // Cinza
];

interface CategoryManagerProps {
  onClose: () => void;
}

const CategoryManager = ({ onClose }: CategoryManagerProps) => {
  const categories = useStore(state => state.categories);
  const subcategories = useStore(state => state.subcategories);
  const addCategory = useStore(state => state.addCategory);
  const updateCategory = useStore(state => state.updateCategory);
  const deleteCategory = useStore(state => state.deleteCategory);
  const addSubcategory = useStore(state => state.addSubcategory);
  const updateSubcategory = useStore(state => state.updateSubcategory);
  const deleteSubcategory = useStore(state => state.deleteSubcategory);

  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('#f59e0b');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  const [subName, setSubName] = useState('');
  const [subCatId, setSubCatId] = useState('');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  const handleSaveCategory = () => {
    if (!catName.trim()) return;
    if (editingCatId) {
      updateCategory(editingCatId, { name: catName, color: catColor });
      setEditingCatId(null);
    } else {
      addCategory({ name: catName, color: catColor, active: true });
    }
    setCatName('');
    setCatColor('#f59e0b');
  };

  const handleSaveSubcategory = () => {
    if (!subName.trim() || !subCatId) return;
    if (editingSubId) {
      updateSubcategory(editingSubId, { name: subName, categoryId: subCatId });
      setEditingSubId(null);
    } else {
      addSubcategory({ name: subName, categoryId: subCatId, active: true });
    }
    setSubName('');
    setEditingSubId(null);
  };

  const handleEditCategory = (cat: Category) => {
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatColor(cat.color || '#f59e0b');
  };

  const handleEditSubcategory = (sub: Subcategory) => {
    setEditingSubId(sub.id);
    setSubName(sub.name);
    setSubCatId(sub.categoryId);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        onClick={onClose} 
        className="absolute inset-0 bg-black/90 backdrop-blur-md" 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        exit={{ opacity: 0, scale: 0.95, y: 10 }} 
        className="relative w-full max-w-xl bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-6 shrink-0">
          <div>
            <h2 className="text-xl font-black text-white leading-none uppercase tracking-tighter">Gerenciar Categorias</h2>
            <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-1">Organização de Portfólio</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
          <div className="space-y-4 bg-white/[0.02] p-4 rounded-xl border border-white/5 shadow-inner">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Tag className="w-4 h-4 text-amber-500" />
              </div>
              <h3 className="text-[10px] font-black uppercase text-white/60 tracking-widest">Nova Categoria</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-8 space-y-1">
                <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Nome</label>
                <input value={catName} onChange={(e) => setCatName(e.target.value)} className="w-full bg-black/60 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-amber-500/50 outline-none placeholder:text-white/10 shadow-inner" placeholder="Ex: Eletrônicos, Vestuário..." />
              </div>
              <div className="md:col-span-4 space-y-1">
                <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Côr</label>
                <div className="flex gap-1.5 bg-white/5 border border-white/5 rounded-lg p-1.5 h-10 items-center">
                  <div
                    className="w-7 h-7 rounded-md border border-white/10 shrink-0 cursor-pointer p-0.5 transition-transform hover:scale-105"
                    style={{ backgroundColor: catColor }}
                  >
                    <input
                      type="color"
                      value={catColor}
                      onChange={(e) => setCatColor(e.target.value)}
                      className="w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <input
                    type="text"
                    value={catColor}
                    onChange={(e) => setCatColor(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-md px-2 py-1 text-[10px] text-white font-mono uppercase focus:border-amber-500/50 outline-none"
                    placeholder="#000000"
                  />
                </div>
              </div>
            </div>

            {/* Quick Presets Selection (Massa de Cores do Crachá) */}
            <div className="space-y-1">
              <span className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none block ml-1">
                Paleta Rápida (Estilo Crachá)
              </span>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {CATEGORY_COLOR_PRESETS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => setCatColor(color)}
                    className="w-5.5 h-5.5 rounded-full border border-white/20 hover:scale-125 transition-transform cursor-pointer"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>

            <button onClick={handleSaveCategory} className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-2">
              {editingCatId ? <RefreshCw className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingCatId ? 'Atualizar Categoria' : 'Salvar Categoria'}
            </button>
          </div>
          <div className="space-y-4 bg-white/[0.02] p-4 rounded-xl border border-white/5 shadow-inner">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Layers className="w-4 h-4 text-emerald-500" />
              </div>
              <h3 className="text-[10px] font-black uppercase text-white/60 tracking-widest">Nova Subcategoria</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 space-y-1">
                <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Categoria Principal</label>
                <select value={subCatId} onChange={(e) => setSubCatId(e.target.value)} className="w-full bg-black/60 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none shadow-inner">
                  <option value="">Selecionar...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-6 space-y-1">
                <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Nome da Subcategoria</label>
                <input value={subName} onChange={(e) => setSubName(e.target.value)} className="w-full bg-black/60 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-white/10 shadow-inner" placeholder="Ex: Smartphones, Camisetas..." />
              </div>
            </div>
            <button onClick={handleSaveSubcategory} disabled={!subCatId} className="w-full py-3 bg-emerald-600 enabled:hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2">
              {editingSubId ? <RefreshCw className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingSubId ? 'Atualizar Subcategoria' : 'Salvar Subcategoria'}
            </button>
          </div>
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase text-white/40 tracking-widest border-b border-white/5 pb-2">Cadastrados</h3>
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 group">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shadow-lg" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs font-bold text-white uppercase tracking-tight">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditCategory(cat)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors">
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => deleteCategory(cat.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500/40 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="pl-6 space-y-1">
                    {subcategories.filter(s => s.categoryId === cat.id).map(sub => (
                      <div key={sub.id} className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5 group/sub">
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3 h-3 text-white/20" />
                          <span className="text-[10px] text-white/60 font-medium">{sub.name}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                          <button onClick={() => handleEditSubcategory(sub)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-colors">
                            <Edit2 className="w-2.5 h-2.5" />
                          </button>
                          <button onClick={() => deleteSubcategory(sub.id)} className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-500/40 hover:text-red-500 transition-colors">
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default function InventoryModule() {
  const products = useStore(state => state.products);
  const addProduct = useStore(state => state.addProduct);
  const updateProduct = useStore(state => state.updateProduct);
  const deleteProduct = useStore(state => state.deleteProduct);
  const addActivity = useStore(state => state.addActivity);
  const categories = useStore(state => state.categories);
  const subcategories = useStore(state => state.subcategories);
  const addCategory = useStore(state => state.addCategory);
  const updateCategory = useStore(state => state.updateCategory);
  const deleteCategory = useStore(state => state.deleteCategory);
  const addSubcategory = useStore(state => state.addSubcategory);
  const updateSubcategory = useStore(state => state.updateSubcategory);
  const deleteSubcategory = useStore(state => state.deleteSubcategory);
  const sales = useStore(state => state.sales);
  const productions = useStore(state => state.productions);

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isHistoryAlertOpen, setIsHistoryAlertOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Label integration state
  const [selectedLabelProduct, setSelectedLabelProduct] = useState<Product | null>(null);
  const [labelQty, setLabelQty] = useState<number>(1);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const [isGeneratingLabelPdf, setIsGeneratingLabelPdf] = useState(false);
  const [labelSuccessMessage, setLabelSuccessMessage] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'low'>('all');
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [productToReactivate, setProductToReactivate] = useState<Product | null>(null);
  const [pendingAction, setPendingAction] = useState<{ type: 'delete' | 'update' | 'add' | 'reactivate', data?: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync modal state with global header navigation
  React.useEffect(() => {
    window.dispatchEvent(new CustomEvent('inventory-modal-state', { detail: { isOpen: isModalOpen } }));
    return () => {
      window.dispatchEvent(new CustomEvent('inventory-modal-state', { detail: { isOpen: false } }));
    };
  }, [isModalOpen]);

  React.useEffect(() => {
    const handleTriggerClose = () => {
      setIsModalOpen(false);
    };
    window.addEventListener('trigger-close-product-modal', handleTriggerClose);
    return () => {
      window.removeEventListener('trigger-close-product-modal', handleTriggerClose);
    };
  }, []);

  // Helper to load and map the global label settings
  const getLabelConfig = (): any => {
    const globalConfig = useStore.getState().labelConfig;
    const defaultConf: any = {
      paperSize: 'a6',
      orientation: 'portrait',
      cols: 2,
      rows: 4,
      colGap: 2,
      rowGap: 2,
      autoFill: false,
      printQty: 1,
      labelWidth: 46,
      labelHeight: 30,
      marginTop: 5,
      marginBottom: 5,
      marginLeft: 5,
      marginRight: 5,
      showQrCode: true,
      qrCodeSize: 12,
      showSku: true,
      showProductName: true,
      showPrice: true,
      showGuide: true,
      guideOpacity: 50,
      showBrand: true,
      showCategory: true,
      showVariation: true,
      showStock: true,
    };

    if (!globalConfig) return defaultConf;

    const paperSizeMap: Record<string, string> = {
      '58mm': 'bobina58',
      '80mm': 'bobina80',
      'A4': 'a4',
      'A5': 'a5',
      'A6': 'a6'
    };
    const pSize = (paperSizeMap[globalConfig.paperSize] || globalConfig.paperSize || 'a6').toLowerCase() as any;

    return {
      ...defaultConf,
      paperSize: pSize,
      cols: globalConfig.cols ?? defaultConf.cols,
      rows: globalConfig.rows ?? defaultConf.rows,
      colGap: globalConfig.colGap ?? defaultConf.colGap,
      rowGap: globalConfig.rowGap ?? defaultConf.rowGap,
      labelWidth: globalConfig.labelWidth ?? defaultConf.labelWidth,
      labelHeight: globalConfig.labelHeight ?? defaultConf.labelHeight,
      marginTop: globalConfig.marginTop ?? defaultConf.marginTop,
      marginBottom: globalConfig.marginBottom ?? defaultConf.marginBottom,
      marginLeft: globalConfig.marginLeft ?? defaultConf.marginLeft,
      marginRight: globalConfig.marginRight ?? defaultConf.marginRight,
      theme: (globalConfig as any).theme || 'classic',
      themeId: (globalConfig as any).themeId,
      showQrCode: globalConfig.visibleFields?.qrCode ?? defaultConf.showQrCode,
      showSku: globalConfig.visibleFields?.sku ?? defaultConf.showSku,
      showProductName: globalConfig.visibleFields?.productName ?? defaultConf.showProductName,
      showPrice: globalConfig.visibleFields?.price ?? defaultConf.showPrice,
      showBrand: globalConfig.visibleFields?.brand ?? defaultConf.showBrand,
      showCategory: globalConfig.visibleFields?.category ?? defaultConf.showCategory,
      showVariation: globalConfig.visibleFields?.variation ?? defaultConf.showVariation,
      showStock: globalConfig.visibleFields?.stock ?? defaultConf.showStock,
    };
  };

  // Helper to map a standard inventory Product to LabelProductData
  const mapProductToLabelData = (p: Product): any => {
    return {
      productName: p.name,
      sku: p.code || 'S/K',
      price: p.price > 0 ? `R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'S/P',
      brand: 'ESTOQUE',
      category: p.category || 'Geral',
      variation: 'Padrão',
      stock: `${p.stock} UN`,
      location: p.location ? `Setor ${p.location.aisle || '-'} / Prat. ${p.location.shelf || '-'}` : 'Não Informada',
      barcodeValue: p.barcode || p.code || '000000000000',
      qrUrl: `https://inventario.empresa.com/produto/${p.code || p.id}`,
    };
  };

  const handlePrintLabel = async () => {
    if (!selectedLabelProduct) return;
    alert('A impressão direta de etiquetas está em manutenção para a nova arquitetura.');
  };

  const handleGenerateLabelPdf = async () => {
    if (!selectedLabelProduct) return;
    alert('A exportação de PDF de etiquetas está em manutenção para a nova arquitetura.');
  };

  const handleSendToLabelBatch = () => {
    if (!selectedLabelProduct) return;
    
    // Read batch list and update to prevent duplicates and sum quantity
    const labelBatchItems = useStore.getState().labelBatchItems || [];
    const existingIndex = labelBatchItems.findIndex(item => item.productId === selectedLabelProduct.id);
    let newBatch = [...labelBatchItems];
    
    if (existingIndex > -1) {
      newBatch[existingIndex] = {
        ...newBatch[existingIndex],
        quantity: newBatch[existingIndex].quantity + labelQty
      };
    } else {
      newBatch.push({ productId: selectedLabelProduct.id, quantity: labelQty });
    }
    
    useStore.setState({ labelBatchItems: newBatch });
    setLabelSuccessMessage(`Adicionado ao lote com sucesso! Total no lote: ${newBatch.find(i => i.productId === selectedLabelProduct.id)?.quantity || labelQty}`);
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const [showInactive, setShowInactive] = useState(false);

  // Reset page when filters change to prevent empty states
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, showInactive]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const pName = p.name || '';
      const pCode = p.code || '';
      const matchSearch = pName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          pCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchLowStock = activeTab === 'low' ? p.stock < p.minStock : true;
      const matchActive = showInactive || (p.active !== false && !p.deleted);
      return matchSearch && matchLowStock && matchActive;
    });
  }, [products, searchTerm, activeTab, showInactive]);

  const pagedProducts = useMemo(() => {
    return filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredProducts, currentPage]);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    categoryId: '',
    subcategoryId: '',
    price: 0,
    wholesalePrice: 0,
    costPrice: 0,
    stock: 0,
    minStock: 5,
    unit: 'UN',
    location: { aisle: '', shelf: '', drawer: '' },
    notes: '',
    active: true,
    image: '',
    extraImages: [] as string[],
    productionId: '',
    productionMode: 'stock' as 'stock' | 'on_demand',
    variations: [] as any[],
    file3d: undefined as { name: string; type: string; data: string; } | undefined
  });

  // Synchronize parent stock with the sum of children variations
  React.useEffect(() => {
    if (formData.variations && formData.variations.length > 0) {
      const sumStock = formData.variations.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      if (formData.stock !== sumStock) {
        setFormData(prev => ({ ...prev, stock: sumStock }));
      }
    }
  }, [formData.variations, formData.stock]);

  const extraFileInputRef = useRef<HTMLInputElement>(null);
  const file3dInputRef = useRef<HTMLInputElement>(null);
  const [activeExtraImageIndex, setActiveExtraImageIndex] = useState<number | null>(null);

  const handleFile3DChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['stl', '3mf', 'glb', 'gltf'].includes(ext)) {
        alert('Formato de arquivo inválido. Formatos aceitos: .3mf, .stl, .glb, .gltf');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          file3d: {
            name: file.name,
            type: ext,
            data: reader.result as string
          }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerUploadExtraImage = (index: number) => {
    setActiveExtraImageIndex(index);
    if (extraFileInputRef.current) {
      extraFileInputRef.current.value = '';
      extraFileInputRef.current.click();
    }
  };

  const handleExtraImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeExtraImageIndex !== null) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setFormData(prev => {
          const currentExtra = [...(prev.extraImages || [])];
          while (currentExtra.length <= activeExtraImageIndex) {
            currentExtra.push('');
          }
          currentExtra[activeExtraImageIndex] = base64;
          return { ...prev, extraImages: currentExtra };
        });
        setActiveExtraImageIndex(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveExtraImage = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData(prev => {
      const currentExtra = [...(prev.extraImages || [])];
      if (index < currentExtra.length) {
        currentExtra[index] = '';
      }
      return { ...prev, extraImages: currentExtra };
    });
  };

  const wholesaleAverage = useMemo(() => {
    return products.reduce((acc, p) => acc + (p.wholesalePrice || 0), 0) / (products.length || 1);
  }, [products]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        name: product.name,
        code: product.code,
        category: product.category,
        categoryId: product.categoryId || '',
        subcategoryId: product.subcategoryId || '',
        price: product.price,
        wholesalePrice: product.wholesalePrice || 0,
        costPrice: product.costPrice,
        stock: product.stock,
        minStock: product.minStock,
        unit: product.unit,
        location: product.location || { aisle: '', shelf: '', drawer: '' },
        notes: product.notes || '',
        active: product.active,
        image: product.image || '',
        extraImages: product.extraImages || [],
        productionId: product.productionId || '',
        productionMode: product.productionMode || 'stock',
        variations: product.variations || [],
        file3d: product.file3d
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        code: '',
        category: '',
        categoryId: '',
        subcategoryId: '',
        price: 0,
        wholesalePrice: 0,
        costPrice: 0,
        stock: 0,
        minStock: 5,
        unit: 'UN',
        location: { aisle: '', shelf: '', drawer: '' },
        notes: '',
        active: true,
        image: '',
        extraImages: [],
        productionId: '',
        productionMode: 'stock',
        variations: [],
        file3d: undefined
      });
    }
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSKU = () => {
    if (formData.code && !confirm('Deseja substituir o código atual por um novo QR Code gerado automaticamente?')) {
      return;
    }
    const skuRegex = /^PROD-(\d+)$/;
    const currentSkus = products
      .map(p => p.code.match(skuRegex))
      .filter(Boolean)
      .map(match => parseInt(match![1]));
    const nextNum = currentSkus.length > 0 ? Math.max(...currentSkus) + 1 : 1;
    const newSku = `PROD-${nextNum.toString().padStart(4, '0')}`;
    setFormData(prev => ({ ...prev, code: newSku }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editingProduct) {
      setPendingAction({ type: 'update', data: formData });
      setIsMasterPasswordModalOpen(true);
    } else {
      addProduct(formData);
      setIsModalOpen(false);
    }
  };

  const handleMasterPasswordConfirm = () => {
    setIsMasterPasswordModalOpen(false);
    
    if (pendingAction?.type === 'delete' && productToDelete) {
      const hasSalesHis = sales.some(sale => sale.items?.some(item => item.id === productToDelete.id));
      const hasProdHis = !!productToDelete.productionId;
      const hasConsignmentHis = (useStore.getState().consignmentRemittances || []).some((rem: any) => rem.items?.some((item: any) => item.productId === productToDelete.id));
      const hasReturnsHis = (useStore.getState().returns || []).some((r: any) => r.productId === productToDelete.id);
      const hasLabelsHis = (useStore.getState().labelBatchItems || []).some((item: any) => item.productId === productToDelete.id);

      const hasHistory = hasSalesHis || hasProdHis || hasConsignmentHis || hasReturnsHis || hasLabelsHis;

      deleteProduct(productToDelete.id);
      if (hasHistory) {
        setIsHistoryAlertOpen(true);
      }
      setProductToDelete(null);
    } else if (pendingAction?.type === 'reactivate' && productToReactivate) {
      updateProduct(productToReactivate.id, {
        active: true,
        archivedAt: undefined,
        archivedBy: undefined
      });
      setProductToReactivate(null);
    } else if (pendingAction?.type === 'update' && editingProduct && pendingAction.data) {
      updateProduct(editingProduct.id, pendingAction.data);
      setIsModalOpen(false);
    }
    
    setPendingAction(null);
  };

  const handleQuickAdjustment = (id: string, amount: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (product.variations && product.variations.length > 0) return;
    updateProduct(id, { stock: product.stock + amount });
    addActivity(`Ajuste de estoque (${amount > 0 ? '+' : ''}${amount}) para: ${product.name}`, 'inventory', 'Estoque');
  };

  const confirmDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteAction = () => {
    if (!productToDelete) return;
    setPendingAction({ type: 'delete' });
    setIsDeleteModalOpen(false);
    setIsMasterPasswordModalOpen(true);
  };

  // CategoryManager wrapper nested definition has been extracted to a stable module-level component to avoid unmounting/state resets on re-renders.

  return (
    <div className="h-full flex flex-col gap-3 md:overflow-hidden md:max-h-[calc(100vh-100px)]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-white">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
            <Package className="w-6 h-6 text-amber-500" />
            Estoque
          </h1>
          <p className="text-[8px] uppercase font-black tracking-[0.3em] text-white/30 leading-none mt-1">Gestão de SKUs e Saldo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsCategoryModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all border border-white/5">
            <Tag className="w-3.5 h-3.5" /> Categorias
          </button>
          <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-amber-500/10 group">
            <Plus className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform" /> Novo Produto
          </button>
        </div>
      </div>

      <div className="bg-[#121212] border border-white/5 rounded-xl p-2 flex flex-col lg:flex-row items-center gap-3 shrink-0 shadow-inner">
        <div className="flex p-0.5 bg-black/40 rounded-lg border border-white/5 shrink-0 gap-1">
          <button onClick={() => setActiveTab('all')} className={cn("px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer", activeTab === 'all' ? "bg-amber-500 text-black" : "text-white/20 hover:text-white/40")}>
            Todos
          </button>
          <button onClick={() => setActiveTab('low')} className={cn("px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer", activeTab === 'low' ? "bg-red-500 text-white" : "text-white/20 hover:text-white/40")}>
            Abaixo do Mínimo
            {products.filter(p => p.stock < p.minStock).length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
          <button 
            type="button"
            onClick={() => setShowInactive(!showInactive)} 
            className={cn(
              "px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1 cursor-pointer select-none", 
              showInactive ? "bg-amber-600/30 border border-amber-500/40 text-amber-400" : "text-white/20 hover:text-white/40 border border-transparent"
            )}
          >
            <Filter className="w-3 h-3" />
            {showInactive ? "Inativos Visíveis" : "Ver Inativos"}
          </button>
        </div>
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3.5 h-3.5" />
          <input type="text" placeholder="Buscar por nome, QR Code..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:border-amber-500/50 outline-none transition-all placeholder:text-white/10" />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 bg-[#0A0A0A] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
        <div className="hidden lg:grid grid-cols-[50px_1fr_110px_90px_90px_90px_100px] gap-3 px-4 py-3.5 bg-white/[0.03] border-b border-white/5 text-[11px] uppercase font-black text-white/30 tracking-widest leading-none items-center shrink-0">
          <div className="text-center">IMG</div>
          <div>Descrição / Código / Categoria</div>
          <div className="text-center">Estoque</div>
          <div className="text-center">Custo</div>
          <div className="text-center">Lojista</div>
          <div className="text-center">Público</div>
          <div className="text-right">Ação</div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="divide-y divide-white/[0.03]">
            {pagedProducts.map((product, index) => (
              <motion.div layout key={product.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("group transition-colors hover:bg-white/[0.02] border-l-2 border-transparent", index % 2 === 0 ? "bg-transparent" : "bg-white/[0.01]", product.stock < product.minStock && "bg-red-500/[0.02] hover:bg-red-500/[0.04] border-l-red-500", (product.active === false || product.deleted) && "opacity-40 grayscale hover:opacity-75")}>
                <div onClick={() => handleOpenModal(product)} className="grid grid-cols-1 lg:grid-cols-[50px_1fr_110px_90px_90px_90px_100px] gap-3 px-3 py-2.5 lg:px-4 items-center cursor-pointer">
                  <div className="hidden lg:flex items-center justify-center shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden border border-white/5 group-hover:border-amber-500/30 transition-colors">
                      {product.image ? <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Package className="w-4 h-4 text-white/20" />}
                    </div>
                  </div>
                  <div className="min-w-0 py-1">
                    <h3 className="text-xs font-bold text-white truncate group-hover:text-amber-400 transition-colors leading-tight">{product.name}</h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-[8.5px] font-mono text-amber-500/60 uppercase tracking-widest">{product.code}</span>
                      <span className="text-[8.5px] font-black text-white/20 uppercase tracking-wider">{categories.find(c => c.id === product.categoryId)?.name || product.category || 'Geral'}</span>
                      {product.subcategoryId && <><span className="text-[8.5px] text-white/10">•</span><span className="text-[8.5px] font-medium text-white/20 uppercase">{subcategories.find(s => s.id === product.subcategoryId)?.name}</span></>}
                      {product.stock < product.minStock && <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-red-500/10 text-[7px] font-bold text-red-500 uppercase tracking-tighter ml-1">CRÍTICO</span>} {product.variations && product.variations.length > 0 && <span className="flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/10 text-[7px] font-black text-amber-500 uppercase tracking-tighter ml-1">GRADE ({product.variations.length} VAR)</span>}
                      {(product.active === false || product.deleted) && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-[7px] font-bold text-amber-500 uppercase tracking-tighter ml-1">INATIVO / ARQUIVADO</span>}
                    </div>
                  </div>
                  <div className="flex lg:grid lg:items-center justify-between lg:justify-center gap-4 lg:gap-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex lg:flex flex-col lg:items-center justify-center">
                      {product.variations && product.variations.length > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className={cn("text-xs font-black tabular-nums leading-none", product.stock < product.minStock ? "text-red-500" : "text-white")}>{product.stock}</span>
                          <span className="text-[6.5px] font-black text-amber-500 uppercase tracking-widest mt-1 text-center bg-amber-500/10 px-1 py-0.5 rounded leading-none">Grade de Variação</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleQuickAdjustment(product.id, -1); }} className="w-5 h-5 rounded bg-white/5 border border-white/5 hover:bg-red-500/10 text-white/20 hover:text-red-500 transition-all flex items-center justify-center"><ArrowDownRight className="w-3 h-3" /></button>
                          <div className="flex flex-col items-center min-w-[24px] lg:min-w-[36px]"><span className={cn("text-xs font-black tabular-nums leading-none", product.stock < product.minStock ? "text-red-500" : "text-white")}>{product.stock}</span></div>
                          <button onClick={(e) => { e.stopPropagation(); handleQuickAdjustment(product.id, 1); }} className="w-5 h-5 rounded bg-white/5 border border-white/5 hover:bg-emerald-500/10 text-white/20 hover:text-emerald-500 transition-all flex items-center justify-center"><ArrowUpRight className="w-3 h-3" /></button>
                        </div>
                      )}
                    </div>
                    <div className="lg:hidden flex flex-wrap gap-4">
                      <div className="flex flex-col"><span className="text-[7px] uppercase font-black text-white/20 tracking-wider">Custo</span><span className="text-xs font-black text-white/40">R$ {product.costPrice.toFixed(2)}</span></div>
                      <div className="flex flex-col"><span className="text-[7px] uppercase font-black text-amber-500/40 tracking-wider">Lojista</span><span className="text-xs font-black text-amber-400">R$ {(product.wholesalePrice || 0).toFixed(2)}</span></div>
                      <div className="flex flex-col"><span className="text-[7px] uppercase font-black text-emerald-500/40 tracking-wider">Público</span><span className="text-xs font-black text-emerald-400">R$ {product.price.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <div className="hidden lg:flex flex-col items-center justify-center border-l border-white/[0.03]"><span className="text-xs font-black tabular-nums text-white/40"><span className="text-[8.5px] opacity-30 font-medium mr-0.5">R$</span>{product.costPrice.toFixed(2)}</span></div>
                  <div className="hidden lg:flex flex-col items-center justify-center border-l border-white/[0.03]"><span className="text-xs font-black tabular-nums text-amber-500/80"><span className="text-[8.5px] opacity-30 font-medium mr-0.5">R$</span>{(product.wholesalePrice || 0).toFixed(2)}</span></div>
                  <div className="hidden lg:flex flex-col items-center justify-center border-l border-white/[0.03]"><span className="text-xs font-black tabular-nums text-emerald-400/80"><span className="text-[8.5px] opacity-30 font-medium mr-0.5">R$</span>{product.price.toFixed(2)}</span></div>
                  <div className="flex items-center justify-end gap-1.5 shrink-0 pt-1 lg:pt-0 border-t lg:border-t-0 border-white/[0.03]" onClick={(e) => e.stopPropagation()}>
                    <button onClick={(e) => { e.stopPropagation(); setSelectedLabelProduct(product); setLabelQty(1); setLabelSuccessMessage(null); }} title="Etiqueta" className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-emerald-400 transition-all active:scale-95"><Tag className="w-4 h-4 text-emerald-400" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleOpenModal(product); }} title="Editar" className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-all active:scale-95"><Edit2 className="w-3.5 h-3.5" /></button>
                    {product.active === false || product.deleted ? (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setProductToReactivate(product);
                          setPendingAction({ type: 'reactivate' });
                          setIsMasterPasswordModalOpen(true);
                        }} 
                        title="Reativar Produto" 
                        className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1 cursor-pointer select-none"
                      >
                        <RefreshCw className="w-3 h-3 animate-spin duration-3000" /> Reativar
                      </button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); confirmDelete(product); }} title="Inativar / Arquivar" className="p-1.5 hover:bg-red-500/10 rounded-lg text-white/40 hover:text-red-500 transition-all active:scale-95"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
            {filteredProducts.length === 0 && <div className="py-20 flex flex-col items-center justify-center opacity-20"><Package className="w-12 h-12 mb-4" /><p className="text-xs font-black uppercase tracking-widest text-center">Nenhum SKU encontrado no filtro ativo</p></div>}
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none">
                Página {currentPage} de {totalPages} ({filteredProducts.length} itens)
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-black uppercase text-white/40 disabled:opacity-20 translate-all border border-white/5"
                >
                  Anterior
                </button>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 bg-white/5 rounded-lg text-[9px] font-black uppercase text-white/40 disabled:opacity-20 translate-all border border-white/5"
                >
                  Próximo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-black/40 border border-white/5 rounded-xl p-2 flex flex-wrap items-center justify-center gap-6 shrink-0">
         <div className="flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-white/20" />
            <div className="flex flex-col">
               <span className="text-[7px] uppercase font-black text-white/20 tracking-widest">SKUS</span>
               <span className="text-[10px] font-bold text-white leading-none">{products.length}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <div className="flex flex-col">
               <span className="text-[7px] uppercase font-black text-white/20 tracking-widest">Alerta</span>
               <span className="text-[10px] font-bold text-red-500 leading-none">{products.filter(p => p.stock < p.minStock).length}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
            <div className="flex flex-col">
               <span className="text-[7px] uppercase font-black text-white/20 tracking-widest">Curva A</span>
               <span className="text-[10px] font-bold text-white leading-none">12 Itens</span>
            </div>
         </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.99, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.99, y: 5 }} className="relative w-full max-w-4xl bg-[#0A0A0A] border border-white/10 rounded-xl p-4 shadow-2xl flex flex-col max-h-[96vh]" >
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                  <h2 className="text-lg font-black text-white leading-none uppercase tracking-tighter">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
                  <p className="text-[9px] text-white/30 uppercase font-black tracking-[0.3em] mt-1">Gestão de Portfólio WMS</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Left Column: Image & Basic Info */}
                  <div className="md:col-span-4 flex flex-col gap-3">
                    <div className="space-y-0.5">
                      <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Imagem principal do produto</label>
                      <div onClick={() => fileInputRef.current?.click()} className="w-full aspect-[3/4] max-w-[170px] mx-auto rounded-xl border-2 border-dashed border-white/5 bg-white/[0.02] flex flex-col items-center justify-center cursor-pointer group hover:border-amber-500/50 hover:bg-amber-500/5 transition-all overflow-hidden relative shadow-inner">
                        {formData.image ? (
                          <>
                            <img src={formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Camera className="w-6 h-6 text-white" />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center p-2">
                            <ImageIcon className="w-6 h-6 text-white/10 mb-1 group-hover:text-amber-500 transition-colors" />
                            <span className="text-[8px] font-black uppercase text-white/20 group-hover:text-white transition-colors text-center px-2">Carregar Imagem Principal</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleImageChange} className="hidden" accept="image/*" />

                    {/* Seção Imagens extras */}
                    <div className="space-y-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1.5 justify-between">
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-3 h-3 text-amber-500" />
                          <h3 className="text-[9px] font-black uppercase text-white/40 tracking-widest">Imagens extras para PDV Totem</h3>
                        </div>
                        <span className="text-[8px] text-white/30 font-black uppercase tracking-wider">MÁX. 5</span>
                      </div>
                      
                      <div className="grid grid-cols-5 gap-1.5">
                        {[0, 1, 2, 3, 4].map((index) => {
                          const extraImg = formData.extraImages?.[index];
                          return (
                            <div 
                              key={index}
                              onClick={() => triggerUploadExtraImage(index)}
                              className="relative aspect-square rounded-lg border border-dashed border-white/10 bg-white/[0.01] hover:border-amber-500/40 hover:bg-amber-500/5 transition-all overflow-hidden flex flex-col items-center justify-center cursor-pointer group"
                              title={`Imagem extra ${index + 1}`}
                            >
                              {extraImg ? (
                                <>
                                  <img src={extraImg} alt={`Extra ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  <button 
                                    type="button"
                                    onClick={(e) => handleRemoveExtraImage(index, e)}
                                    className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 hover:bg-red-600 rounded text-white/60 hover:text-white transition-colors"
                                    title="Remover imagem"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <Camera className="w-3 h-3 text-white" />
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-col items-center">
                                  <Plus className="w-3 h-3 text-white/20 group-hover:text-amber-500 transition-colors" />
                                  <span className="text-[6.5px] font-black uppercase text-white/20 group-hover:text-white transition-colors mt-0.5">#{index + 1}</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <input type="file" ref={extraFileInputRef} onChange={handleExtraImageChange} className="hidden" accept="image/*" />
                    </div>

                    {/* MODELO 3D OPCIONAL */}
                    <div className="space-y-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1.5 justify-between">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3 h-3 text-cyan-400" />
                          <h3 className="text-[9px] font-black uppercase text-white/40 tracking-widest">Modelo 3D Opcional</h3>
                        </div>
                        <span className="text-[7px] text-cyan-400 font-extrabold uppercase tracking-wider">STL/3MF/GLB/GLTF</span>
                      </div>
                      
                      <div className="space-y-2">
                        {formData.file3d ? (
                          <div className="flex flex-col gap-2 p-2 bg-black/60 border border-white/5 rounded-lg">
                            <div className="flex flex-col min-w-0">
                              <span className="text-[9px] font-black text-white truncate uppercase font-mono">{formData.file3d.name}</span>
                              <span className="text-[7px] text-zinc-500 font-mono uppercase mt-0.5">{formData.file3d.type}</span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-end mt-1">
                              <button 
                                type="button" 
                                onClick={() => file3dInputRef.current?.click()}
                                className="px-2 py-1 bg-white/5 border border-white/5 hover:bg-white/10 text-white rounded text-[7px] font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Substituir
                              </button>
                              <button 
                                type="button" 
                                onClick={() => setFormData(prev => ({ ...prev, file3d: undefined }))}
                                className="px-2 py-1 bg-rose-500/10 border border-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded text-[7px] font-black uppercase tracking-wider transition-all cursor-pointer"
                              >
                                Remover
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            onClick={() => file3dInputRef.current?.click()} 
                            className="w-full py-3.5 border border-dashed border-white/10 rounded-xl bg-white/[0.01] hover:border-cyan-500/40 hover:bg-cyan-500/5 transition-all flex flex-col items-center justify-center cursor-pointer group"
                          >
                            <Upload className="w-4 h-4 text-white/20 group-hover:text-cyan-400 transition-colors mb-1" />
                            <span className="text-[7.5px] font-black uppercase text-white/30 group-hover:text-white transition-colors">Carregar Arquivo 3D</span>
                          </div>
                        )}
                        <input 
                          type="file" 
                          ref={file3dInputRef} 
                          onChange={handleFile3DChange} 
                          className="hidden" 
                          accept=".glb,.gltf,.stl,.3mf" 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2.5 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <MapPin className="w-3 h-3 text-blue-500" />
                        <h3 className="text-[9px] font-black uppercase text-white/40 tracking-widest">Endereçamento</h3>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="space-y-0.5">
                          <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Corredor</label>
                          <input value={formData.location.aisle} onChange={(e) => setFormData({ ...formData, location: { ...formData.location, aisle: e.target.value } })} className="w-full bg-black border border-white/5 rounded-md py-1 px-2 text-[10px] text-white outline-none focus:border-blue-500/50" placeholder="A" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Prateleira</label>
                          <input value={formData.location.shelf} onChange={(e) => setFormData({ ...formData, location: { ...formData.location, shelf: e.target.value } })} className="w-full bg-black border border-white/5 rounded-md py-1 px-2 text-[10px] text-white outline-none focus:border-blue-500/50" placeholder="01" />
                        </div>
                        <div className="space-y-0.5">
                          <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Gaveta</label>
                          <input value={formData.location.drawer} onChange={(e) => setFormData({ ...formData, location: { ...formData.location, drawer: e.target.value } })} className="w-full bg-black border border-white/5 rounded-md py-1 px-2 text-[10px] text-white outline-none focus:border-blue-500/50" placeholder="B2" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Detailed Info */}
                  <div className="md:col-span-8 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-0.5">
                        <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Descrição Comercial</label>
                        <input required placeholder="Ex: Mousepad Gamer HyperX Fury S Speed Edition..." value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-black/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500/50 outline-none shadow-inner" />
                      </div>
                      
                      <div className="space-y-0.5">
                        <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1 flex items-center justify-between">Código/SKU<button type="button" onClick={generateSKU} className="flex items-center gap-1 text-amber-500 hover:text-amber-400 transition-colors"><RefreshCw className="w-2 h-2" /> Gerar</button></label>
                        <input required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} className="w-full bg-black/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500/50 outline-none font-mono" placeholder="Ex: PROD-0001" />
                      </div>
                      
                      <div className="space-y-0.5">
                        <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Unidade de Medida</label>
                        <input value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} className="w-full bg-black/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500/50 outline-none" placeholder="Unidade, Pacote, Caixa..." />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {/* Classification Section */}
                      <div className="space-y-3 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Tag className="w-3 h-3 text-amber-500" />
                          <h3 className="text-[9px] font-black uppercase text-white/40 tracking-widest">Classificação</h3>
                        </div>
                        <div className="space-y-2">
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Categoria Principal</label>
                             <select value={formData.categoryId} onChange={(e) => { const catId = e.target.value; const selectedCat = categories.find(c => c.id === catId); setFormData({ ...formData, categoryId: catId, category: selectedCat?.name || '', subcategoryId: '' }); }} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:border-amber-500/50 outline-none">
                                <option value="">Geral</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                             </select>
                           </div>
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Subcategoria</label>
                             <select disabled={!formData.categoryId} value={formData.subcategoryId} onChange={(e) => setFormData({ ...formData, subcategoryId: e.target.value })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-3 text-xs text-white focus:border-amber-500/50 outline-none disabled:opacity-20 transition-all">
                                <option value="">Nenhuma</option>
                                {subcategories.filter(s => s.categoryId === formData.categoryId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                             </select>
                           </div>
                        </div>
                      </div>

                      {/* Pricing Section */}
                      <div className="space-y-3 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <DollarSign className="w-3 h-3 text-emerald-500" />
                          <h3 className="text-[9px] font-black uppercase text-white/40 tracking-widest">Precificação</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Custo (R$)</label>
                             <input type="number" step="0.01" value={formData.costPrice} onChange={(e) => setFormData({ ...formData, costPrice: parseFloat(e.target.value) })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-2 text-xs text-white focus:border-amber-500/50 outline-none" />
                           </div>
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Estoque {editingProduct ? 'Atual' : 'Inicial'}</label>
                             <input type="number" disabled={formData.variations && formData.variations.length > 0} value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: parseInt(e.target.value) || 0 })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-2 text-xs text-white focus:border-amber-500/50 outline-none disabled:opacity-50 disabled:bg-zinc-950 disabled:cursor-not-allowed" />
                           </div>
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-white/20 tracking-widest ml-1">Estoque Mín.</label>
                             <input type="number" value={formData.minStock} onChange={(e) => setFormData({ ...formData, minStock: parseInt(e.target.value) || 0 })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-2 text-xs text-white focus:border-red-500/50 outline-none" />
                           </div>
                           <div className="space-y-0.5" />
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-amber-500/50 tracking-widest ml-1">Venda Lojista</label>
                             <input type="number" step="0.01" value={formData.wholesalePrice} onChange={(e) => setFormData({ ...formData, wholesalePrice: parseFloat(e.target.value) })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-2 text-xs text-amber-500 font-black focus:border-amber-500/50 outline-none" />
                           </div>
                           <div className="space-y-0.5">
                             <label className="text-[7px] uppercase font-black text-emerald-500/50 tracking-widest ml-1">Venda Varejo</label>
                             <input type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })} className="w-full bg-black border border-white/10 rounded-xl py-1.5 px-2 text-xs text-emerald-400 font-black focus:border-emerald-500/50 outline-none" />
                           </div>
                        </div>
                      </div>
                    </div>

                    {/* GERENCIAMENTO DE VARIAÇÕES (INDUSTRIAL GRADED) */}
                    <div className="space-y-3 bg-white/[0.02] p-4 rounded-2xl border border-white/5 shadow-md">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-amber-500/10 rounded-lg">
                            <Layers className="w-4 h-4 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-black text-white tracking-widest">Grade de Variações</p>
                            <p className="text-[8px] text-white/30 font-medium font-sans">Cadastrar tamanhos, cores, acabamentos, etc.</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (formData.variations && formData.variations.length > 0) {
                              if (confirm("Deseja realmente limpar todas as variações deste produto? Isso removerá o estoque individual delas.")) {
                                setFormData({ ...formData, variations: [] });
                              }
                            } else {
                              setFormData({
                                ...formData,
                                variations: [
                                  { id: Math.random().toString(36).substr(2, 9), sku: formData.code ? `${formData.code}-01` : '', name: 'Padrão', stock: 0 }
                                ]
                              });
                            }
                          }}
                          className={`text-[8.5px] font-black uppercase px-2.5 py-1.5 rounded-lg border transition-all ${
                            formData.variations && formData.variations.length > 0
                              ? 'bg-rose-500/5 text-rose-500 border-rose-500/10 hover:bg-rose-500/10'
                              : 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/25'
                          }`}
                        >
                          {formData.variations && formData.variations.length > 0 ? 'Remover Grade' : 'Ativar Grade'}
                        </button>
                      </div>

                      {formData.variations && formData.variations.length > 0 && (
                        <div className="space-y-3 pt-1 border-t border-white/5">
                          {/* Quick Generator Panel */}
                          <div className="bg-black/40 border border-[#1a1a1a] rounded-xl p-3 space-y-2.5">
                            <p className="text-[8px] uppercase font-black text-amber-500 tracking-wider">Gerador de Combinações Rápidas</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <label className="text-[7px] uppercase font-black text-white/40 tracking-wider">Atributo (ex: Tamanho)</label>
                                <input
                                  type="text"
                                  id="quick-attr-name"
                                  placeholder="Tamanho, Cor..."
                                  className="w-full bg-black border border-white/10 rounded-lg py-1 px-2 text-[10px] text-white focus:border-amber-500/50 outline-none"
                                />
                              </div>
                              <div className="space-y-0.5">
                                <label className="text-[7px] uppercase font-black text-white/40 tracking-wider">Valores (ex: P, M, G)</label>
                                <input
                                  type="text"
                                  id="quick-attr-values"
                                  placeholder="P, M, G..."
                                  className="w-full bg-black border border-white/10 rounded-lg py-1 px-2 text-[10px] text-white focus:border-amber-500/50 outline-none"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const nameInput = document.getElementById('quick-attr-name') as HTMLInputElement;
                                const valuesInput = document.getElementById('quick-attr-values') as HTMLInputElement;
                                if (!nameInput || !valuesInput) return;
                                const attrName = nameInput.value.trim();
                                const rawValues = valuesInput.value.split(',').map(v => v.trim()).filter(Boolean);
                                if (!attrName || rawValues.length === 0) {
                                  alert('Informe o nome do atributo e pelo menos um valor válido.');
                                  return;
                                }

                                let newVariations = [...formData.variations];
                                if (newVariations.length === 1 && newVariations[0].name === 'Padrão') {
                                  newVariations = [];
                                }

                                if (newVariations.length === 0) {
                                  newVariations = rawValues.map((val, idx) => ({
                                    id: Math.random().toString(36).substr(2, 9),
                                    sku: formData.code ? `${formData.code}-${val.toUpperCase().replace(/\s+/g, '')}` : '',
                                    name: val,
                                    stock: 0
                                  }));
                                } else {
                                  const combined: any[] = [];
                                  newVariations.forEach(oldV => {
                                    rawValues.forEach(val => {
                                      const combinedName = `${oldV.name} / ${val}`;
                                      combined.push({
                                        id: Math.random().toString(36).substr(2, 9),
                                        sku: formData.code ? `${formData.code}-${combinedName.toUpperCase().replace(/[\s\/]+/g, '')}` : '',
                                        name: combinedName,
                                        stock: oldV.stock || 0,
                                        price: oldV.price,
                                        wholesalePrice: oldV.wholesalePrice,
                                        costPrice: oldV.costPrice
                                      });
                                    });
                                  });
                                  newVariations = combined;
                                }

                                setFormData({ ...formData, variations: newVariations });
                                nameInput.value = '';
                                valuesInput.value = '';
                              }}
                              className="w-full bg-white/5 hover:bg-white/10 active:bg-white/15 text-white border border-white/10 text-[8px] font-black uppercase py-1.5 rounded-lg transition-all"
                            >
                              + Combinar com Atributo
                            </button>
                          </div>

                          {/* Variations Table/List */}
                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
                            {formData.variations.map((v, idx) => (
                              <div key={v.id || idx} className="grid grid-cols-12 gap-1.5 items-center p-2 bg-black border border-white/5 rounded-xl">
                                <div className="col-span-4 space-y-0.5">
                                  <label className="text-[5.5px] uppercase font-black text-white/30 tracking-widest pl-0.5">Variação / Descrição</label>
                                  <input
                                    type="text"
                                    value={v.name}
                                    onChange={(e) => {
                                      const updated = formData.variations.map((item, index) =>
                                        index === idx ? { ...item, name: e.target.value } : item
                                      );
                                      setFormData({ ...formData, variations: updated });
                                    }}
                                    className="w-full bg-black/60 border border-white/10 rounded-lg py-1 px-1.5 text-[10px] text-white focus:border-amber-500/50 outline-none"
                                    placeholder="G / Azul"
                                  />
                                </div>
                                <div className="col-span-3 space-y-0.5">
                                  <label className="text-[5.5px] uppercase font-black text-white/30 tracking-widest pl-0.5">SKU / Código</label>
                                  <input
                                    type="text"
                                    value={v.sku}
                                    onChange={(e) => {
                                      const updated = formData.variations.map((item, index) =>
                                        index === idx ? { ...item, sku: e.target.value } : item
                                      );
                                      setFormData({ ...formData, variations: updated });
                                    }}
                                    className="w-full bg-black/60 border border-white/10 rounded-lg py-1 px-1.5 text-[9px] font-mono text-amber-500 focus:border-amber-500/50 outline-none"
                                    placeholder="SKU"
                                  />
                                </div>
                                <div className="col-span-2 space-y-0.5">
                                  <label className="text-[5.5px] uppercase font-black text-white/30 tracking-widest pl-0.5">Estoque</label>
                                  <input
                                    type="number"
                                    value={v.stock}
                                    onChange={(e) => {
                                      const updated = formData.variations.map((item, index) =>
                                        index === idx ? { ...item, stock: parseInt(e.target.value) || 0 } : item
                                      );
                                      setFormData({ ...formData, variations: updated });
                                    }}
                                    className="w-full bg-black/60 border border-white/10 rounded-lg py-1 px-1 text-[10px] text-white text-center focus:border-amber-500/50 outline-none font-bold"
                                  />
                                </div>
                                <div className="col-span-2 space-y-0.5">
                                  <label className="text-[5.5px] uppercase font-black text-white/30 tracking-widest pl-0.5">Preço (R$)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={v.price || ''}
                                    onChange={(e) => {
                                      const updated = formData.variations.map((item, index) =>
                                        index === idx ? { ...item, price: parseFloat(e.target.value) || undefined } : item
                                      );
                                      setFormData({ ...formData, variations: updated });
                                    }}
                                    className="w-full bg-black/60 border border-white/10 rounded-lg py-1 px-1 text-[9px] text-white/60 focus:border-amber-500/50 outline-none"
                                    placeholder={formData.price ? formData.price.toFixed(2) : '0.00'}
                                  />
                                </div>
                                <div className="col-span-1 pt-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = formData.variations.filter((_, index) => index !== idx);
                                      setFormData({ ...formData, variations: updated });
                                    }}
                                    className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-md transition-all inline-block mt-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const newIndex = formData.variations.length + 1;
                              const suffix = newIndex < 10 ? `0${newIndex}` : `${newIndex}`;
                              setFormData({
                                ...formData,
                                variations: [
                                  ...formData.variations,
                                  {
                                    id: Math.random().toString(36).substr(2, 9),
                                    sku: formData.code ? `${formData.code}-${suffix}` : '',
                                    name: `Grade ${newIndex}`,
                                    stock: 0
                                  }
                                ]
                              });
                            }}
                            className="w-full bg-amber-500/10 hover:bg-amber-500/15 active:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[8px] font-black uppercase py-1.5 rounded-lg transition-all"
                          >
                            + Adicionar Variação Manual
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Observações Internas / Ficha Técnica</label>
                      <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full bg-black/60 border border-white/5 rounded-xl py-2 px-3 text-xs text-white focus:border-amber-500/50 outline-none resize-none h-14 shadow-inner" placeholder="Detalhes técnicos, histórico ou observações sobre o item..." />
                    </div>

                    <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <div className="p-1.5 bg-amber-500/10 rounded-lg">
                           <Box className="w-3.5 h-3.5 text-amber-500" />
                         </div>
                         <div>
                            <p className="text-[9px] uppercase font-black text-white/60 tracking-widest">Produção Industrial</p>
                            <p className="text-[8px] text-white/20 font-medium">Vincular ficha técnica automática</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-2">
                         {formData.productionId && (
                           <select value={formData.productionId} onChange={(e) => {
                               const prodId = e.target.value;
                               const prod = productions.find(p => p.id === prodId);
                               let calculatedCost = formData.costPrice;
                               if (prod) {
                                 const qty = prod.quantity;
                                 if (qty === undefined || qty === null || qty <= 0 || isNaN(qty)) {
                                   alert("Aviso: Esta ficha técnica tem uma quantidade de lote inválida ou nula. O preço de custo unitário não pôde ser recalculado automaticamente a partir do lote e foi mantido o valor atual.");
                                   calculatedCost = formData.costPrice;
                                 } else {
                                   calculatedCost = prod.totalCost / qty;
                                 }
                               }
                               setFormData(prev => ({ ...prev, productionId: prodId, costPrice: calculatedCost }));
                             }} className="bg-black border border-white/20 rounded-lg py-1 px-2 text-[9px] text-white outline-none min-w-[120px]">
                             <option value="manual">Personalizada</option>
                             {productions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                           </select>
                         )}
                         <div className="relative inline-flex h-5 w-9 items-center rounded-full bg-white/5 cursor-pointer" onClick={() => {
                            const newValue = !!formData.productionId ? '' : (productions[0]?.id || 'manual');
                            let calculatedCost = formData.costPrice;
                            if (newValue && newValue !== 'manual') {
                              const prod = productions.find(p => p.id === newValue);
                              if (prod) {
                                const qty = prod.quantity;
                                if (qty === undefined || qty === null || qty <= 0 || isNaN(qty)) {
                                  alert("Aviso: Esta ficha técnica tem uma quantidade de lote inválida ou nula. O preço de custo unitário não pôde ser recalculado automaticamente a partir do lote e foi mantido o valor atual.");
                                  calculatedCost = formData.costPrice;
                                } else {
                                  calculatedCost = prod.totalCost / qty;
                                }
                              }
                            }
                            setFormData(prev => ({ ...prev, productionId: newValue, costPrice: newValue ? calculatedCost : prev.costPrice }));
                          }}>
                            <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform", formData.productionId ? "translate-x-5 bg-amber-500" : "translate-x-0.5 bg-white/20")} />
                         </div>
                       </div>
                    </div>

                    {formData.productionId && (
                       <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/10 space-y-2">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             <div className="p-1.5 bg-amber-500/10 rounded-lg">
                               <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                             </div>
                             <div>
                                <p className="text-[9px] uppercase font-black text-white/60 tracking-widest">Método de Baixa de Insumos</p>
                                <p className="text-[8px] text-white/20 font-medium tracking-wide">Defina quando os insumos deste produto são deduzidos</p>
                             </div>
                           </div>
                         </div>
                         <div className="grid grid-cols-2 gap-2 pt-0.5">
                           <button
                             type="button"
                             onClick={() => setFormData(prev => ({ ...prev, productionMode: 'stock' }))}
                             className={cn(
                               "py-2 px-3 rounded-lg border text-[9px] uppercase font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                               formData.productionMode !== 'on_demand'
                                 ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-extrabold"
                                 : "bg-black/40 border-white/5 text-white/40 hover:text-white"
                             )}
                           >
                             <span>Estoque [STOCK]</span>
                             <span className="text-[7px] text-white/40 font-normal">Baixa manual no lote de produção</span>
                           </button>
                           <button
                             type="button"
                             onClick={() => setFormData(prev => ({ ...prev, productionMode: 'on_demand' }))}
                             className={cn(
                               "py-2 px-3 rounded-lg border text-[9px] uppercase font-bold transition-all flex flex-col items-center justify-center gap-0.5",
                               formData.productionMode === 'on_demand'
                                 ? "bg-amber-500/20 border-amber-500/40 text-amber-400 font-extrabold"
                                 : "bg-black/40 border-white/5 text-white/40 hover:text-white"
                             )}
                           >
                             <span>Sob Demanda [ON_DEMAND]</span>
                             <span className="text-[7px] text-white/40 font-normal">Baixa na separação do pedido</span>
                           </button>
                         </div>
                       </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-white/5 shrink-0">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl text-[9px] uppercase font-black tracking-[0.2em] transition-all border border-white/5 block">Cancelar</button>
                  <button type="submit" className="flex-[2] py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-[9px] uppercase font-black tracking-[0.2em] transition-all shadow-xl shadow-amber-600/20 flex items-center justify-center gap-2 group">
                    <Save className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> 
                    {editingProduct ? 'Salvar SKU' : 'Efetivar SKU'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isCategoryModalOpen && <CategoryManager onClose={() => setIsCategoryModalOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {isDeleteModalOpen && productToDelete && (() => {
          const productHasHistory = 
            sales.some(sale => sale.items?.some(item => item.id === productToDelete.id)) ||
            !!productToDelete.productionId ||
            (useStore.getState().consignmentRemittances || []).some((rem: any) => rem.items?.some((item: any) => item.productId === productToDelete.id)) ||
            (useStore.getState().returns || []).some((r: any) => r.productId === productToDelete.id) ||
            (useStore.getState().labelBatchItems || []).some((item: any) => item.productId === productToDelete.id);

          return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsDeleteModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden" >
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0"><AlertTriangle className="w-6 h-6 text-red-500" /></div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">
                      {productHasHistory ? 'Inativar / Arquivar' : 'Confirmar Exclusão'}
                    </h2>
                    <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">
                      {productHasHistory ? 'Este produto será inativado' : 'Deseja excluir este produto?'}
                    </p>
                  </div>
                </div>
                
                <div className="bg-black/20 rounded-xl p-4 border border-white/5 mb-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-4 h-4 text-white/20" />
                    <span className="text-sm font-medium text-white">{productToDelete.name}</span>
                  </div>
                  <div className="mt-2 text-[10px] text-white/30 uppercase tracking-widest font-black">CÓDIGO: {productToDelete.code}</div>
                </div>

                {productHasHistory && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-6 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-200/70 font-medium leading-relaxed">
                      Este produto possui histórico no sistema. Ele será inativado para novas vendas, mas continuará disponível nos relatórios e pedidos antigos.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button 
                    onClick={() => setIsDeleteModalOpen(false)} 
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-xl text-[10px] uppercase font-black tracking-widest transition-all border border-white/5"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleDeleteAction} 
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {productHasHistory ? 'Inativar' : 'Sim, excluir'}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {isHistoryAlertOpen && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsHistoryAlertOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl" >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0"><Info className="w-6 h-6 text-amber-500" /></div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">Aviso de Segurança</h2>
                  <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mt-1">Histórico Detectado</p>
                </div>
              </div>
              
              <p className="text-xs text-white/60 mb-8 leading-relaxed">
                Este produto já possui histórico de movimentações (vendas ou pedidos) e por segurança não pode ser excluído permanentemente para não quebrar a integridade dos dados.
                <br /><br />
                <span className="text-amber-400 font-bold">O produto foi inativado.</span> Ele não aparecerá mais no PDV, mas permanecerá nos registros históricos.
              </p>

              <button 
                onClick={() => setIsHistoryAlertOpen(false)} 
                className="w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] uppercase font-black tracking-widest transition-all border border-white/5"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLabelProduct && (
          <div id="label-action-modal-overlay" className="fixed inset-0 z-[210] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedLabelProduct(null)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              className="relative w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
              
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Tag className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white leading-tight">Ação com Etiqueta</h2>
                    <p className="text-[8px] text-white/40 uppercase font-black tracking-widest mt-0.5">Etiqueta unificada & controle de lote</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedLabelProduct(null)}
                  className="p-1 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Product Info Display */}
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 mb-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center overflow-hidden border border-white/5">
                  {selectedLabelProduct.image ? (
                    <img src={selectedLabelProduct.image} alt={selectedLabelProduct.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <Package className="w-5 h-5 text-white/10" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-black text-white/30 tracking-wider">Produto Selecionado</p>
                  <h4 className="text-xs font-bold text-white truncate leading-tight">{selectedLabelProduct.name}</h4>
                  <p className="text-[9px] text-white/50 font-mono mt-0.5">
                    {selectedLabelProduct.code || 'SEM SKU'} • R$ {selectedLabelProduct.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="mb-5">
                <label className="text-[9px] text-white/40 uppercase font-black tracking-widest mb-1.5 block">
                  Quantidade de Etiquetas
                </label>
                <div className="flex items-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setLabelQty(prev => Math.max(1, prev - 1))}
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors active:scale-95"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input 
                    type="number" 
                    min={1} 
                    value={labelQty}
                    onChange={(e) => setLabelQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl py-2 px-3 text-sm text-white text-center font-bold focus:border-emerald-500/50 outline-none h-10 outline-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button 
                    type="button"
                    onClick={() => setLabelQty(prev => prev + 1)}
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Feedback messages */}
              {labelSuccessMessage && (
                <div className="bg-emerald-500/10 border border-emerald-500/15 rounded-xl p-3.5 mb-5 flex gap-2.5 items-start">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-white leading-normal">
                      {labelSuccessMessage}
                    </p>
                    {labelSuccessMessage.includes('Adicionado ao lote') && (
                      <button 
                        type="button"
                        onClick={() => {
                          setSelectedLabelProduct(null);
                          useStore.setState({ isSettingsOpen: true, activeSettingModule: 'cupons', activeSubSetting: 'lote' });
                        }}
                        className="text-[9px] uppercase font-black text-emerald-400 tracking-wider hover:underline mt-1.5 flex items-center gap-1 cursor-pointer"
                      >
                        Abrir Lote de Etiquetas <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons Grid */}
              <button 
                type="button"
                onClick={handleSendToLabelBatch}
                className="w-full py-3 bg-black/45 hover:bg-black/85 border border-white/5 text-amber-400 rounded-xl text-[9px] uppercase font-black tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer mb-3 active:scale-95"
              >
                <Layers className="w-3.5 h-3.5" /> Enviar para Lote
              </button>

              <button 
                type="button"
                onClick={() => setSelectedLabelProduct(null)}
                className="w-full py-2.5 text-[9px] uppercase font-black text-white/30 hover:text-white/60 tracking-widest transition-all block text-center"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MasterPasswordModal 
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handleMasterPasswordConfirm}
        description={
          pendingAction?.type === 'delete' 
            ? 'Inativar/Excluir um produto requer autorização gerencial.' 
            : pendingAction?.type === 'reactivate'
              ? 'Reativar um produto inativo requer autorização gerencial.'
              : 'Alterar dados de um produto existente requer autorização gerencial.'
        }
      />
    </div>
  );
}
