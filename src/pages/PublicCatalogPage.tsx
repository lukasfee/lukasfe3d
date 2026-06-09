import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store';
import { 
  Search, 
  MessageSquare, 
  QrCode, 
  X, 
  ExternalLink,
  Share2,
  Info,
  Check,
  ShoppingBag,
  Grid
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function PublicCatalogPage() {
  const products = useStore(state => state.products);
  const catalogConfig = useStore(state => state.catalogConfig);
  const location = useLocation();

  // Selected state for individual product QR code / modal details
  const [selectedProductForQr, setSelectedProductForQr] = useState<any | null>(null);
  const [selectedProductDetail, setSelectedProductDetail] = useState<any | null>(null);
  
  // Search and Category states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedLink, setCopiedLink] = useState(false);

  // Parse product and category from URL query/hash if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
    const productQuery = params.get('product');
    const categoryQuery = params.get('category');
    
    if (productQuery) {
      const prod = products.find(p => p.id === productQuery);
      if (prod) {
        setSelectedProductDetail(prod);
      }
    }
    
    if (categoryQuery) {
      setSelectedCategory(categoryQuery);
    }
  }, [products, location]);

  const activeThemeColor = catalogConfig?.themeColor || 'emerald';
  const isDark = catalogConfig?.themeMode === 'dark';

  // Theme styling definitions
  const colorSchemes = {
    emerald: {
      primary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      accent: 'text-emerald-500 bg-emerald-500/10',
      border: 'border-emerald-500/20',
      button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      text: 'text-emerald-500',
      banner: 'from-emerald-950 to-neutral-900',
    },
    indigo: {
      primary: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      accent: 'text-indigo-500 bg-indigo-500/10',
      border: 'border-indigo-500/20',
      button: 'bg-indigo-600 hover:bg-indigo-700 text-white',
      text: 'text-indigo-500',
      banner: 'from-indigo-950 to-neutral-900',
    },
    crimson: {
      primary: 'bg-rose-600 hover:bg-rose-500 text-white',
      accent: 'text-rose-500 bg-rose-500/10',
      border: 'border-rose-500/20',
      button: 'bg-rose-600 hover:bg-rose-700 text-white',
      text: 'text-rose-500',
      banner: 'from-rose-950 to-neutral-900',
    },
    slate: {
      primary: 'bg-zinc-700 hover:bg-zinc-600 text-white',
      accent: 'text-zinc-400 bg-zinc-500/10',
      border: 'border-zinc-500/20',
      button: 'bg-zinc-800 hover:bg-zinc-700 text-white',
      text: 'text-zinc-300',
      banner: 'from-zinc-900 to-neutral-900',
    },
    amber: {
      primary: 'bg-amber-600 hover:bg-amber-500 text-white',
      accent: 'text-amber-500 bg-amber-500/10',
      border: 'border-amber-500/20',
      button: 'bg-amber-500 hover:bg-amber-600 text-black font-black',
      text: 'text-amber-500',
      banner: 'from-amber-950 to-neutral-900',
    },
  };

  const scheme = colorSchemes[activeThemeColor] || colorSchemes.emerald;

  // List categories from active published products
  const categories = useMemo(() => {
    const list = new Set<string>();
    products.forEach(p => {
      if (p.catalogPublished && !p.catalogHidden) {
        if (p.category) {
          list.add(p.category);
        }
      }
    });
    return Array.from(list);
  }, [products]);

   // Filter products based on active categories, stock constraint, and query
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Must be active and not deleted
      if (p.active === false || p.deleted) return false;
      // Must be published in catalog
      if (!p.catalogPublished) return false;
      // Cannot be explicitly hidden
      if (p.catalogHidden) return false;
      // Filter out of stock if config requests it
      if (catalogConfig?.hideOutOfStock && p.stock <= 0) return false;
      
      // Category filter check
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;

      // Search query check
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(query) || (p.code && p.code.toLowerCase().includes(query));
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery, catalogConfig]);

  // Utility to handle copy shop link
  const handleCopyLink = () => {
    const url = window.location.origin + window.location.pathname + '#/vitrine' + (selectedCategory !== 'all' ? `?category=${encodeURIComponent(selectedCategory)}` : '');
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Helper code to format interest WhatsApp template
  const handleOpenWhatsAppInterest = (product: any) => {
    const phone = catalogConfig?.whatsappNumber || '';
    if (!phone) {
      alert('Número do WhatsApp não configurado pelo lojista.');
      return;
    }

    const priceText = (catalogConfig?.showPrices && product.catalogPriceShow !== false) 
      ? `R$ ${(product.catalogPriceOverride !== undefined ? product.catalogPriceOverride : product.price).toFixed(2)}`
      : 'Consultar';

    const rawTemplate = catalogConfig?.whatsappMessageTemplate || 'Olá! Tenho interesse no produto:\n[PRODUTO] - SKU [SKU]\nPreço: [PRECO]';
    
    // Replace placeholders
    let filledMessage = rawTemplate
      .replace(/\[PRODUTO\]/gi, product.name)
      .replace(/\[SKU\]/gi, product.code || 'N/A')
      .replace(/\[PRECO\]/gi, priceText);

    const encodedText = encodeURIComponent(filledMessage);
    const cleanPhone = phone.replace(/\D/g, '');
    const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    
    window.open(waUrl, '_blank');
  };

  // Build current shop URL
  const shopUrl = window.location.origin + window.location.pathname + '#/vitrine';

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? 'bg-[#0e0e0e] text-white/90' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* Banner / Header */}
      <header className={`relative py-12 px-6 flex flex-col items-center text-center bg-gradient-to-b ${isDark ? scheme.banner : 'from-slate-200 to-slate-100'} border-b ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
        <div className="absolute top-4 right-4 flex gap-2">
          {/* Share Shop */}
          <button 
            onClick={handleCopyLink} 
            className={`p-2.5 rounded-full backdrop-blur-md transition-all ${isDark ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
            title="Copiar Link do Catálogo"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Logo */}
        {catalogConfig?.logoUrl ? (
          <img 
            src={catalogConfig.logoUrl} 
            alt="Logo da Loja" 
            className="w-20 h-20 rounded-2xl object-cover shadow-lg border-2 border-white/10 mb-4"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={`w-20 h-20 rounded-2xl shadow-lg mb-4 flex items-center justify-center ${isDark ? 'bg-white/5 border border-white/10 text-white/40' : 'bg-slate-300 text-slate-500'}`}>
            <ShoppingBag className="w-10 h-10" />
          </div>
        )}

        {/* Store Info */}
        <h1 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{catalogConfig?.storeName || 'Nossa Vitrine'}</h1>
        <p className={`mt-2 text-xs md:text-sm max-w-md leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
          {catalogConfig?.storeDescription || 'Confira os nossos produtos disponíveis no catálogo online e faça seu pedido direto pelo WhatsApp!'}
        </p>

        {catalogConfig?.whatsappNumber && (
          <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            WhatsApp: {catalogConfig.whatsappNumber}
          </div>
        )}
      </header>

      {/* Main Catalog View Container */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        
        {/* Search & Global Actions Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Simple search input */}
          <div className="relative flex-1">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-white/40' : 'text-slate-400'}`} />
            <input 
              type="text" 
              placeholder="Pesquisar por produto ou SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full py-3 pl-10 pr-4 text-xs font-medium rounded-2xl transition-all outline-none border ${
                isDark 
                  ? 'bg-neutral-900 border-white/5 text-white focus:border-white/20' 
                  : 'bg-white border-slate-200 text-slate-900 focus:border-slate-400 focus:shadow-sm'
              }`}
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Category select on desktop */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSelectedCategory('all');
                // Remove category params from hash
                window.location.hash = '#/vitrine';
              }}
              className={`px-4 py-3 text-xs font-bold uppercase tracking-wider rounded-2xl transition-all border ${
                selectedCategory === 'all'
                  ? isDark ? 'bg-white text-black border-transparent' : 'bg-slate-900 text-white border-transparent'
                  : isDark ? 'bg-neutral-900 border-white/5 text-white/60 hover:bg-neutral-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Todos
            </button>
          </div>
        </div>

        {/* Categories Bar */}
        {categories.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/40">
              <Grid className="w-3 h-3" /> Categorias
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    window.location.hash = `#/vitrine?category=${encodeURIComponent(cat)}`;
                  }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl shrink-0 transition-all border ${
                    selectedCategory === cat
                      ? isDark ? `bg-${activeThemeColor}-500/10 border-${activeThemeColor}-500 text-${activeThemeColor}-400` : `bg-slate-900 text-white border-transparent`
                      : isDark ? 'bg-neutral-900 border-white/5 text-white/50 hover:bg-neutral-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div>
          {filteredProducts.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <p className={`text-sm ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Nenhum produto publicado encontrado.</p>
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${scheme.primary}`}
              >
                Limpar Filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredProducts.map((product) => {
                const showPrice = catalogConfig?.showPrices && product.catalogPriceShow !== false;
                const price = product.catalogPriceOverride !== undefined ? product.catalogPriceOverride : product.price;
                const description = product.catalogDescription || product.notes || 'Sem descrição cadastrada.';
                const isOutOfStock = product.stock <= 0;

                return (
                  <div 
                    key={product.id}
                    className={`flex flex-col relative rounded-3xl border overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
                      isDark 
                        ? 'bg-[#121212]/30 border-white/5 hover:border-white/10' 
                        : 'bg-white border-slate-100 shadow-sm hover:shadow-md'
                    }`}
                  >
                    
                    {/* QR icon in target upper right corner */}
                    <button 
                      onClick={() => setSelectedProductForQr(product)}
                      className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md z-10 transition-all hover:scale-110 ${
                        isDark ? 'bg-black/40 text-white/60 hover:text-white' : 'bg-white/80 text-slate-500 hover:text-slate-900'
                      }`}
                      title="Gerar QR Code do Produto"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>

                    {/* Image frame */}
                    <div 
                      onClick={() => setSelectedProductDetail(product)}
                      className="aspect-square bg-neutral-900/10 border-b border-white/5 relative overflow-hidden cursor-pointer"
                    >
                      {product.image ? (
                        <img 
                          src={product.image} 
                          alt={product.name} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col justify-center items-center text-white/25">
                          <ShoppingBag className="w-12 h-12 stroke-[1.25] mb-1" />
                          <span className="text-[9px] uppercase tracking-widest font-black">Sem imagem</span>
                        </div>
                      )}

                      {/* Stock Badges */}
                      {isOutOfStock ? (
                        <span className="absolute bottom-3 left-3 px-2 py-1 rounded bg-red-600 text-[8px] text-white font-black uppercase tracking-wider">
                          Esgotado
                        </span>
                      ) : (
                        <span className="absolute bottom-3 left-3 px-2 py-1 rounded bg-black/50 text-[8px] text-white/60 font-black tracking-wider uppercase">
                          Disponível
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5 cursor-pointer text-left" onClick={() => setSelectedProductDetail(product)}>
                        {product.category && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-[#22d3ee]">
                            {product.category}
                          </span>
                        )}
                        <h3 className={`text-xs font-black uppercase tracking-wider line-clamp-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          {product.name}
                        </h3>
                        {product.code && (
                          <p className="text-[9px] font-mono text-white/30 uppercase">
                            SKU {product.code}
                          </p>
                        )}
                        <p className={`text-[10px] line-clamp-2 leading-relaxed ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                          {description}
                        </p>
                      </div>

                      {/* Footer Actions */}
                      <div className="space-y-3 pt-2">
                        {/* Price rendering */}
                        <div className="flex justify-between items-baseline">
                          <span className="text-[9px] uppercase tracking-wider text-white/30">Preço</span>
                          {showPrice ? (
                            <span className={`text-[13px] font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                              R$ {price.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest leading-none">Sob Consulta</span>
                          )}
                        </div>

                        {/* Order button */}
                        <button
                          onClick={() => handleOpenWhatsAppInterest(product)}
                          disabled={isOutOfStock}
                          className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                            isOutOfStock 
                              ? 'bg-neutral-800 text-white/20 border border-white/5 cursor-not-allowed'
                              : scheme.button
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                          Tenho Interesse
                        </button>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className={`py-12 mt-20 border-t text-center ${isDark ? 'border-white/5 bg-[#080808] text-white/20' : 'border-slate-200 bg-slate-100 text-slate-500'} text-[8px] uppercase font-black tracking-widest`}>
        <div className="max-w-md mx-auto space-y-1.5 px-6">
          <p className="leading-relaxed">© {new Date().getFullYear()} - {catalogConfig?.storeName || 'Nossa Vitrine'}</p>
          <p className={isDark ? 'text-white/10' : 'text-slate-400'}>Catálogo Integrado com Gestão de Estoque & WhatsApp</p>
        </div>
      </footer>

      {/* QR CODE MODAL FOR PRODUCT */}
      {selectedProductForQr && (() => {
        const productUrl = `${window.location.origin}${window.location.pathname}#/vitrine?product=${selectedProductForQr.id}`;
        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[2000] flex items-center justify-center p-4">
            <div className={`w-sm max-w-full rounded-[2.5rem] p-8 text-center space-y-6 relative border ${isDark ? 'bg-neutral-900 border-white/10' : 'bg-white border-slate-200 shadow-2xl'}`}>
              <button 
                onClick={() => setSelectedProductForQr(null)}
                className={`absolute top-5 right-5 p-2 rounded-full transition-all ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1">
                <p className="text-[10px] font-black tracking-[0.2em] text-[#22d3ee] uppercase">QR Code do Produto</p>
                <h3 className={`text-base font-black uppercase text-left ${isDark ? 'text-white' : 'text-slate-950'}`}>{selectedProductForQr.name}</h3>
              </div>

              {/* QR Container */}
              <div className="p-6 bg-white rounded-3xl inline-block border border-slate-100">
                <QRCodeSVG value={productUrl} size={180} level="H" includeMargin />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2 text-left">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(productUrl);
                    alert('Link do produto copiado!');
                  }}
                  className={`w-full py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest text-center ${scheme.button}`}
                >
                  Copiar Link do Produto
                </button>
                <p className="text-[8px] text-white/30 text-center uppercase tracking-wider break-all font-mono">
                  {productUrl}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HIGHLIGHT DETAILS MODAL FOR PRODUCT */}
      {selectedProductDetail && (() => {
        const showPrice = catalogConfig?.showPrices && selectedProductDetail.catalogPriceShow !== false;
        const price = selectedProductDetail.catalogPriceOverride !== undefined ? selectedProductDetail.catalogPriceOverride : selectedProductDetail.price;
        const description = selectedProductDetail.catalogDescription || selectedProductDetail.notes || 'Sem descrição cadastrada.';
        const isOutOfStock = selectedProductDetail.stock <= 0;

        return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[1500] flex items-center justify-center p-4">
            <div className={`w-md max-w-full rounded-[2rem] overflow-hidden relative border ${isDark ? 'bg-neutral-900 border-white/10' : 'bg-white border-slate-200'}`}>
              <button 
                onClick={() => setSelectedProductDetail(null)}
                className={`absolute top-4 right-4 p-2 rounded-full backdrop-blur-md z-20 transition-all ${
                  isDark ? 'bg-black/60 text-white/60 hover:text-white hover:bg-black/80' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="aspect-video bg-black/40 relative">
                {selectedProductDetail.image ? (
                  <img 
                    src={selectedProductDetail.image} 
                    alt={selectedProductDetail.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col justify-center items-center text-white/20">
                    <ShoppingBag className="w-16 h-16 stroke-[1.25] mb-2" />
                    <span className="text-[9px] uppercase tracking-widest font-black">Sem imagem</span>
                  </div>
                )}
                {isOutOfStock && (
                  <span className="absolute bottom-4 left-4 px-2 py-1 rounded bg-red-600 text-[8px] text-white font-black uppercase tracking-wider">
                    Esgotado
                  </span>
                )}
              </div>

              <div className="p-6 space-y-4 text-left">
                <div className="space-y-1">
                  {selectedProductDetail.category && (
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#22d3ee]">
                      {selectedProductDetail.category}
                    </span>
                  )}
                  <h3 className={`text-base font-black uppercase tracking-wide ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {selectedProductDetail.name}
                  </h3>
                  {selectedProductDetail.code && (
                    <p className="text-[9px] font-mono text-white/30">
                      SKU {selectedProductDetail.code}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <h4 className="text-[8px] uppercase tracking-widest text-white/30 font-black">Descrição do Produto</h4>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-white/60' : 'text-slate-600'}`}>
                    {description}
                  </p>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <div>
                    <span className="text-[8px] uppercase tracking-widest text-white/30 block mb-0.5">Preço Estimado</span>
                    {showPrice ? (
                      <span className={`text-lg font-black font-mono ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        R$ {price.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest leading-none">Sob Consulta</span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      handleOpenWhatsAppInterest(selectedProductDetail);
                      setSelectedProductDetail(null);
                    }}
                    disabled={isOutOfStock}
                    className={`py-3 px-6 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 ${
                      isOutOfStock 
                        ? 'bg-neutral-800 text-white/20 cursor-not-allowed border border-white/5' 
                        : scheme.button
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    Tenho Interesse
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
