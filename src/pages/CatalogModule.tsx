import React, { useState, useMemo } from 'react';
import { useStore, Product } from '../store';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  Settings, 
  Share2, 
  Copy, 
  Check, 
  QrCode, 
  Save, 
  AlertTriangle, 
  Globe, 
  ShoppingBag, 
  Filter, 
  Edit2, 
  Phone, 
  MessageSquare, 
  PlusCircle,
  X,
  Search,
  ExternalLink,
  Info
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function CatalogModule() {
  const products = useStore(state => state.products);
  const updateProduct = useStore(state => state.updateProduct);
  const catalogConfig = useStore(state => state.catalogConfig);
  const updateCatalogConfig = useStore(state => state.updateCatalogConfig);
  const currentUser = useStore(state => state.currentUser);

  // UI state
  const [activeTab, setActiveTab] = useState<'produtos' | 'publicar' | 'ajustes' | 'compartilhar'>('produtos');
  const [copiedLink, setCopiedLink] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // New settings form state (initialized from store config)
  const [storeName, setStoreName] = useState(catalogConfig?.storeName || 'Nossa Vitrine');
  const [storeDescription, setStoreDescription] = useState(catalogConfig?.storeDescription || '');
  const [whatsappNumber, setWhatsappNumber] = useState(catalogConfig?.whatsappNumber || '');
  const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState(catalogConfig?.whatsappMessageTemplate || '');
  const [themeColor, setThemeColor] = useState(catalogConfig?.themeColor || 'emerald');
  const [themeMode, setThemeMode] = useState(catalogConfig?.themeMode || 'light');
  const [showPrices, setShowPrices] = useState(catalogConfig?.showPrices ?? true);
  const [hideOutOfStock, setHideOutOfStock] = useState(catalogConfig?.hideOutOfStock ?? false);
  const [autoUnpublishOnZeroStock, setAutoUnpublishOnZeroStock] = useState(catalogConfig?.autoUnpublishOnZeroStock ?? false);
  const [logoUrl, setLogoUrl] = useState(catalogConfig?.logoUrl || '');
  const [bannerUrl, setBannerUrl] = useState(catalogConfig?.bannerUrl || '');

  // Edit Product custom catalog field modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [overridePrice, setOverridePrice] = useState<string>('');
  const [customDescription, setCustomDescription] = useState<string>('');
  const [individualPriceShow, setIndividualPriceShow] = useState<boolean>(true);

  // Active public hash link of store
  const shopUrl = useMemo(() => {
    return window.location.origin + window.location.pathname + '#/vitrine';
  }, []);

  // Filter lists of products
  const publishedProducts = useMemo(() => {
    return products.filter(p => {
      if (p.active === false || p.deleted) return false;
      if (!p.catalogPublished) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query));
      }
      return true;
    });
  }, [products, categoryFilter, searchQuery]);

  const unpublishedProducts = useMemo(() => {
    return products.filter(p => {
      if (p.active === false || p.deleted) return false;
      if (p.catalogPublished) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query));
      }
      return true;
    });
  }, [products, categoryFilter, searchQuery]);

  // Unique categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Handle saving configurations
  const handleSaveConfig = () => {
    updateCatalogConfig({
      storeName,
      storeDescription,
      whatsappNumber,
      whatsappMessageTemplate,
      themeColor,
      themeMode,
      showPrices,
      hideOutOfStock,
      autoUnpublishOnZeroStock,
      logoUrl,
      bannerUrl
    });
  };

  // Toggle visible hidden inside catalog
  const handleToggleHide = (product: Product) => {
    updateProduct(product.id, {
      catalogHidden: !product.catalogHidden
    }, currentUser?.fullName || 'Sistema');
  };

  // Publish / add product to catalog
  const handlePublish = (product: Product) => {
    updateProduct(product.id, {
      catalogPublished: true,
      catalogHidden: false
    }, currentUser?.fullName || 'Sistema');
  };

  // Unpublish / remove product from catalog
  const handleUnpublish = (product: Product) => {
    updateProduct(product.id, {
      catalogPublished: false
    }, currentUser?.fullName || 'Sistema');
  };

  // Handle single product edit save
  const handleSaveProductEdit = () => {
    if (!editingProduct) return;
    updateProduct(editingProduct.id, {
      catalogPriceOverride: overridePrice === '' ? undefined : parseFloat(overridePrice),
      catalogDescription: customDescription === '' ? undefined : customDescription,
      catalogPriceShow: individualPriceShow
    }, currentUser?.fullName || 'Sistema');
    setEditingProduct(null);
  };

  // Start edited product form
  const handleStartProductEdit = (product: Product) => {
    setEditingProduct(product);
    setOverridePrice(product.catalogPriceOverride !== undefined ? product.catalogPriceOverride.toString() : '');
    setCustomDescription(product.catalogDescription || '');
    setIndividualPriceShow(product.catalogPriceShow ?? true);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shopUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 text-left">
      
      {/* Header card with quick indicators */}
      <div className="p-6 bg-gradient-to-r from-neutral-900 to-neutral-800 border border-white/5 rounded-3xl shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-wider uppercase text-white leading-none">Módulo de Catálogo</h1>
              <p className="text-[10px] uppercase font-black tracking-widest text-[#22d3ee] mt-1.5 font-sans">
                Vitrine Online Integrada &amp; WhatsApp Facilitado
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                // Open storefront in a new tab
                window.open(shopUrl, '_blank');
              }}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              Ver Vitrine Pública
            </button>
            <button
              onClick={handleCopyLink}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link da Loja
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-white/5 pb-px gap-2 overflow-x-auto scrollbar-none font-bold">
        {[
          { id: 'produtos', label: 'Produtos Publicados', count: publishedProducts.length },
          { id: 'publicar', label: 'Publicar do Estoque', count: unpublishedProducts.length },
          { id: 'ajustes', label: 'Ajustes & Experiência', count: null },
          { id: 'compartilhar', label: 'QR Code & Link', count: null }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2.5 rounded-t-xl text-[10px] uppercase tracking-widest transition-all whitespace-nowrap border-b-2 font-black ${
              activeTab === tab.id
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-neutral-800 text-white/60 rounded text-[9px]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* FILTER AND SEARCH ROW (If product tabs are active) */}
      {(activeTab === 'produtos' || activeTab === 'publicar') && (
        <div className="p-4 bg-neutral-900/30 border border-white/5 rounded-2xl flex flex-col md:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Pesquisar estoque..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full py-2.5 pl-9 pr-4 bg-black/40 border border-white/10 rounded-xl text-xs font-semibold text-white/90 placeholder-white/20 outline-none focus:border-white/20 transition-all font-sans"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="w-3.5 h-3.5 text-white/40 shrink-0" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full md:w-44 py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 outline-none cursor-pointer focus:border-white/20 font-sans"
            >
              <option value="all">Todas Categorias</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* TAB 1: PRODUTOS PUBLICADOS */}
      {activeTab === 'produtos' && (
        <div className="space-y-4">
          {publishedProducts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-white/10 bg-black/20 space-y-3">
              <ShoppingBag className="w-8 h-8 text-white/20 mx-auto" />
              <p className="text-[11px] font-black uppercase tracking-widest text-white/40 leading-relaxed">
                Nenhum produto publicado no catálogo atualmente.
              </p>
              <button
                onClick={() => setActiveTab('publicar')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-95"
              >
                Publicar Produtos do Estoque
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publishedProducts.map((product) => {
                const isHidden = product.catalogHidden;
                const hasOverridePrice = product.catalogPriceOverride !== undefined;
                const priceToShow = hasOverridePrice ? product.catalogPriceOverride! : product.price;

                return (
                  <div 
                    key={product.id}
                    className={`p-4 border rounded-2xl flex flex-col justify-between space-y-4 transition-all relative ${
                      isHidden 
                        ? 'bg-neutral-900/40 border-dashed border-white/10 opacity-70' 
                        : 'bg-neutral-900/20 border-white/5 hover:border-white/10'
                    }`}
                  >
                    
                    {/* Upper content */}
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        {/* Img preview */}
                        <div className="w-14 h-14 rounded-xl bg-neutral-950 flex-shrink-0 select-none overflow-hidden border border-white/5">
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/10">
                              <ShoppingBag className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">
                              {product.category || 'Geral'}
                            </span>
                            {isHidden ? (
                              <span className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded text-[7px] font-black uppercase tracking-wider font-mono">
                                Oculto
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[7px] font-black uppercase tracking-wider font-mono">
                                Publicado
                              </span>
                            )}
                          </div>

                          <h3 className="text-xs font-black uppercase text-white truncate pr-4">
                            {product.name}
                          </h3>
                          
                          {product.code && (
                            <p className="text-[9px] font-mono text-white/30 truncate">
                              SKU {product.code}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stock & pricing info rows */}
                      <div className="grid grid-cols-2 gap-2 bg-black/20 p-2.5 rounded-xl border border-white/5 text-[10px]">
                        <div>
                          <p className="text-[8px] uppercase font-black text-white/20">Estoque Atual</p>
                          <p className={`font-mono font-bold mt-0.5 ${product.stock <= 0 ? 'text-red-400' : 'text-white'}`}>
                            {product.stock} {product.unit || 'un'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] uppercase font-black text-white/20">Preço Vitrine</p>
                          <p className="font-mono font-bold text-white mt-0.5">
                            R$ {priceToShow.toFixed(2)}
                            {hasOverridePrice && (
                              <span className="text-[7px] block font-sans text-[#22d3ee] uppercase tracking-wider leading-none font-black mt-0.5">Substituído</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {product.catalogDescription && (
                        <div className="bg-black/10 p-2 rounded-lg text-[9px] leading-relaxed text-white/40">
                          <span className="font-bold text-white/50 block">Descrição Personalizada:</span>
                          {product.catalogDescription}
                        </div>
                      )}
                    </div>

                    {/* Bottom action bar */}
                    <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/5">
                      <button
                        onClick={() => handleToggleHide(product)}
                        className="py-2.5 bg-neutral-900 border border-white/5 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-white flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                        title={isHidden ? "Exibir na vitrine" : "Ocultar da vitrine"}
                      >
                        {isHidden ? (
                          <>
                            <Eye className="w-3 h-3 text-yellow-500" /> Exibir
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3 h-3" /> Ocultar
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleStartProductEdit(product)}
                        className="py-2.5 bg-neutral-900 border border-white/5 rounded-xl text-[8px] font-black uppercase tracking-widest text-white/60 hover:text-indigo-400 flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" /> Detalhes
                      </button>

                      <button
                        onClick={() => handleUnpublish(product)}
                        className="py-2.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                        title="Remover do catálogo"
                      >
                        <Trash2 className="w-3 h-3" /> Remover
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PUBLICAR DO ESTOQUE */}
      {activeTab === 'publicar' && (
        <div className="space-y-4">
          <div className="p-4 bg-zinc-950/20 rounded-2xl flex items-start gap-3 border border-white/5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-white/50 leading-relaxed font-sans">
              Estes são produtos do seu estoque que ainda não estão publicados no catálogo de vendas. Clique em <strong className="text-indigo-400">Publicar</strong> para colocá-los na vitrine instantaneamente com as configurações padrões.
            </p>
          </div>

          {unpublishedProducts.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-white/10 bg-black/20 space-y-2">
              <Check className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="text-[11px] font-black uppercase tracking-widest text-white/40">
                Uau! Todos os seus produtos estão publicados no catálogo!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {unpublishedProducts.map((product) => {
                return (
                  <div 
                    key={product.id}
                    className="p-4 bg-neutral-900/25 border border-white/5 rounded-2xl flex items-center justify-between gap-4 hover:border-white/10 transition-all text-left"
                  >
                    <div className="flex gap-3 min-w-0">
                      {/* Product thumbnail */}
                      <div className="w-11 h-11 rounded-lg bg-neutral-950 flex-shrink-0 overflow-hidden border border-white/5">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/10">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <span className="text-[7.5px] font-black uppercase tracking-wider text-white/30 block">
                          {product.category || 'Geral'}
                        </span>
                        <h4 className="text-xs font-black uppercase text-white truncate pr-2 leading-none mt-0.5">
                          {product.name}
                        </h4>
                        <div className="flex gap-2 items-center mt-1 text-[9px] font-mono">
                          <span className="text-white/40">Cod: {product.code || 'N/A'}</span>
                          <span className="text-white/40">|</span>
                          <span className="text-indigo-400 font-bold">R$ {product.price.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handlePublish(product)}
                      className="py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[9px] font-black uppercase tracking-widest text-white flex items-center gap-1 active:scale-95 transition-all select-none cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Publicar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AJUSTES DA VITRINE */}
      {activeTab === 'ajustes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-semibold">
          
          {/* Sub-form 1: Identidade Visual e Customização */}
          <div className="lg:col-span-2 space-y-6">
            <div className="p-5 bg-neutral-900/20 border border-white/5 rounded-3xl space-y-4 text-left">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2">
                <Settings className="w-4 h-4" /> Configuração da Vitrine
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">Nome da Vitrine</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Nome Fantasia"
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-semibold text-white outline-none focus:border-white/20 transition-all font-sans"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">WhatsApp de Contato (Completo com DDI/DDD)</label>
                  <input
                    type="text"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="Ex: 5511999999999"
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-white/20 transition-all"
                  />
                  <p className="text-[8px] text-white/30 uppercase">Digite sem espaços, símbolos ou parênteses.</p>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">Descrição / Biografia da Loja</label>
                  <textarea
                    rows={2}
                    value={storeDescription}
                    onChange={(e) => setStoreDescription(e.target.value)}
                    placeholder="Conte sobre sua loja ou promoções especiais..."
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-semibold text-white outline-none focus:border-white/20 transition-all font-sans resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">URL da Imagem de Logo</label>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://exemplo.com/logo.png"
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-white/20 transition-all"
                  />
                </div>

                {/* Theme Selector */}
                <div className="space-y-1">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">Cor do Tema</label>
                  <select
                    value={themeColor}
                    onChange={(e) => setThemeColor(e.target.value as any)}
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 outline-none focus:border-white/20 transition-all font-sans"
                  >
                    <option value="emerald">💚 Esmeralda</option>
                    <option value="indigo">💙 Índigo</option>
                    <option value="crimson">❤️ Crimson / Rosa</option>
                    <option value="slate">🖤 Grafite Slate</option>
                    <option value="amber">💛 Âmbar Gold</option>
                  </select>
                </div>

                <div className="space-y-1 col-span-1">
                  <label className="text-[9px] uppercase font-black tracking-wider text-white/40">Visual Escuro (Dark Mode)</label>
                  <select
                    value={themeMode}
                    onChange={(e) => setThemeMode(e.target.value as any)}
                    className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 outline-none focus:border-white/20 transition-all font-sans"
                  >
                    <option value="light">☀️ Light (Fundo Claro)</option>
                    <option value="dark">🌙 Dark (Tema Escuro)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Template da Mensagem WhatsApp */}
            <div className="p-5 bg-neutral-900/20 border border-white/5 rounded-3xl space-y-4 text-left">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#22d3ee] flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Roteiro de Conversa no WhatsApp
              </h3>
              
              <div className="space-y-2">
                <label className="text-[9px] uppercase font-black tracking-wider text-white/40">Mensagem Inicial Pronta ao Clicar no Produto</label>
                <textarea
                  rows={3}
                  value={whatsappMessageTemplate}
                  onChange={(e) => setWhatsappMessageTemplate(e.target.value)}
                  placeholder="Olá! Gostaria de consultar este produto no estoque: [PRODUTO] (SKU: [SKU])..."
                  className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-white/20 transition-all resize-none"
                />
                
                {/* tags hints list */}
                <div className="p-3 bg-black/35 rounded-xl border border-white/5 space-y-1">
                  <p className="text-[8px] uppercase font-black text-white/30">Substituições automáticas disponíveis:</p>
                  <div className="grid grid-cols-3 gap-2 text-[8px] font-mono text-white/50">
                    <div><span className="text-cyan-400">[PRODUTO]</span> :: Nome produto</div>
                    <div><span className="text-cyan-400">[SKU]</span> :: Código SKU</div>
                    <div><span className="text-cyan-400">[PRECO]</span> :: Preço formatado</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-form 2: Controles de preço e estoque */}
          <div className="space-y-6">
            <div className="p-5 bg-neutral-900/20 border border-white/5 rounded-3xl space-y-5 text-left">
              <h3 className="text-xs font-black uppercase tracking-widest text-indigo-400">
                Regras de Negócio
              </h3>

              {/* Toggle switch grid */}
              <div className="space-y-4">
                
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 select-none flex-1">
                    <p className="text-[10px] font-black uppercase text-white/80">Exibir Preço Público Padrão</p>
                    <p className="text-[8px] text-white/30 uppercase leading-snug">
                      Habilita ou desabilita a exibição de preços na vitrine.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={showPrices}
                    onChange={(e) => setShowPrices(e.target.checked)}
                    className="w-5 h-5 rounded border-white/15 bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer text-right shrink-0"
                  />
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 select-none flex-1 font-sans">
                    <p className="text-[10px] font-black uppercase text-white/80">Ocultar Produtos Sem Estoque</p>
                    <p className="text-[8px] text-white/30 uppercase leading-snug">
                      Se ativo, produtos com estoque zero serão omitidos do catálogo. Se inativo, mostra status &apos;Esgotado&apos;.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={hideOutOfStock}
                    onChange={(e) => setHideOutOfStock(e.target.checked)}
                    className="w-5 h-5 rounded border-white/15 bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer text-right shrink-0"
                  />
                </div>

                <div className="h-px bg-white/5" />

                <div className="flex items-start justify-between gap-3 font-sans">
                  <div className="space-y-1 select-none flex-1">
                    <p className="text-[10px] font-black uppercase text-white/80">Despublicar se Estoque Zerar</p>
                    <p className="text-[8px] text-white/30 uppercase leading-snug">
                      Retira o produto do catálogo de forma automática e permanente sempre que seu saldo chegar a zero no estoque real.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoUnpublishOnZeroStock}
                    onChange={(e) => setAutoUnpublishOnZeroStock(e.target.checked)}
                    className="w-5 h-5 rounded border-white/15 bg-neutral-800 text-indigo-600 focus:ring-0 cursor-pointer text-right shrink-0"
                  />
                </div>

              </div>

              {/* Actions box */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    handleSaveConfig();
                    alert('Configurações salvas com sucesso!');
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-lg select-none cursor-pointer font-sans"
                >
                  <Save className="w-3.5 h-3.5" /> Salvar Configurações
                </button>
              </div>

            </div>

            <div className="p-5 border border-amber-500/10 bg-amber-500/5 rounded-3xl space-y-2 text-left">
              <div className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                <h4 className="text-[9px] uppercase font-black tracking-widest leading-none">Dados Sincronizados</h4>
              </div>
              <p className="text-[9px] text-amber-500/70 leading-relaxed uppercase">
                O catálogo faz leitura em tempo real e não duplica as listagens do sistema. Alterações de preço e estoque efetuados no PDV ou Estoque refletirão logo na vitrine pública.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* TAB 4: COMPARTILHAMENTO E QR CODES */}
      {activeTab === 'compartilhar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-neutral-900/20 border border-white/5 rounded-3xl flex flex-col justify-between space-y-4 text-left">
            <div className="space-y-2">
              <span className="text-[8px] font-black uppercase tracking-widest text-[#22d3ee] block">Catálogo no Dispositivo Móvel</span>
              <h3 className="text-sm font-black uppercase text-white tracking-wider">Acesso Rápido com QR Code</h3>
              <p className="text-[10px] text-white/50 leading-relaxed font-sans">
                Seus clientes podem abrir a vitrine diretamente no celular escaneando o código ao lado. Imprima-o e cole no balcão da sua loja física.
              </p>
            </div>

            <div className="bg-black/30 p-4 rounded-2xl space-y-2 border border-white/5">
              <span className="text-[8px] font-black text-white/20 uppercase">Link Público Ativo:</span>
              <div className="flex justify-between items-center gap-3">
                <p className="font-mono text-[9px] text-indigo-400 truncate break-all flex-1">{shopUrl}</p>
                <button
                  onClick={handleCopyLink}
                  className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 rounded-lg text-[8px] font-black text-indigo-400 uppercase tracking-wider shrink-0 cursor-pointer"
                >
                  Copiar
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                alert("A função de impressão física foi desativada em conformidade com as novas diretrizes de segurança.");
              }}
              className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all select-none cursor-pointer font-sans"
            >
              Imprimir Identificador QR Code
            </button>
          </div>

          {/* QR Card container */}
          <div className="p-6 bg-neutral-900/10 border border-white/5 rounded-3xl flex flex-col items-center justify-center text-center space-y-4">
            <div className="p-5 bg-white rounded-3xl border border-white/5 inline-block">
              <QRCodeSVG value={shopUrl} size={180} level="H" includeMargin />
            </div>
            
            <div className="space-y-1">
              <p className="text-[9px] font-mono text-white/40 uppercase">Escanear para testar vitrine</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{storeName}</p>
            </div>
          </div>
        </div>
      )}

      {/* QUICK PRODUCT EDIT SPECIFIC CATALOG DETAIL MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[3000] flex items-center justify-center p-4">
          <div className="w-md max-w-full bg-[#121212] border border-white/10 rounded-[2.5rem] p-6 relative space-y-6 text-left shadow-2xl">
            <button 
              onClick={() => setEditingProduct(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all text-white/60 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <p className="text-[8px] font-black tracking-[0.2.em] text-indigo-400 uppercase">Personalizar Vitrine Individual</p>
              <h3 className="text-sm font-black uppercase text-white truncate pr-6">{editingProduct.name}</h3>
              {editingProduct.code && (
                <p className="text-[9px] font-mono text-white/30 uppercase leading-none">SKU: {editingProduct.code}</p>
              )}
            </div>

            <div className="space-y-4 uppercase font-semibold">
              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-wider text-white/40">Substituir Preço no Catálogo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={overridePrice}
                  onChange={(e) => setOverridePrice(e.target.value)}
                  placeholder={`Preço Original: R$ ${editingProduct.price.toFixed(2)}`}
                  className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white outline-none focus:border-white/20 transition-all"
                />
                <p className="text-[7.5px] text-white/30 font-black">Deixe em branco para utilizar o valor real do estoque.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-wider text-white/40">Exibir preço deste em particular?</label>
                <select
                  value={individualPriceShow ? 'yes' : 'no'}
                  onChange={(e) => setIndividualPriceShow(e.target.value === 'yes')}
                  className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-black uppercase text-white/70 outline-none focus:border-white/20 font-sans"
                >
                  <option value="yes">Sim, exibir preço do produto</option>
                  <option value="no">Não, esconder preço e mostrar &apos;Sob Consulta&apos;</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[8px] uppercase tracking-wider text-white/40">Descrição Personalizada no Catálogo</label>
                <textarea
                  rows={3}
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder={`Descrição Padrão: ${editingProduct.notes || 'Nenhuma descrição cadastrada.'}`}
                  className="w-full py-2.5 px-3 bg-black/40 border border-white/10 rounded-xl text-xs font-semibold text-white outline-none focus:border-white/20 transition-all font-sans resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 border border-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all select-none cursor-pointer"
              >
                Voltar
              </button>
              <button
                onClick={handleSaveProductEdit}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[9px] font-black uppercase tracking-widest text-white transition-all select-none cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
