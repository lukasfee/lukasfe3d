import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Search, 
  ShoppingCart, 
  User as UserIcon, 
  Plus, 
  Minus, 
  Trash2, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Percent,
  CheckCircle2,
  AlertCircle,
  X,
  UserPlus,
  ArrowRight,
  Package,
  Calendar,
  Clock,
  ExternalLink,
  RefreshCw,
  Lock,
  Unlock,
  LogOut,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, CartItem, Sale, User } from '../store';
import { roundMoney, safeAdd, safeSubtract, safeMultiply, safeDivide, safePercent } from '../utils/money';
import OperationalConfirmationModal from '../components/OperationalConfirmationModal';

export function generatePixPayload(key: string, amount: number, receiver: string, city: string = 'SAO PAULO') {
  const cleanKey = key.replace(/[^\w@.-]/g, '');
  const cleanReceiver = receiver.trim().substring(0, 25).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const cleanCity = city.trim().substring(0, 15).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const formattedAmount = amount.toFixed(2);

  const payloadKey = `00020126580014br.gov.bcb.pix01${cleanKey.length.toString().padStart(2, '0')}${cleanKey}520400005303986540${formattedAmount.length.toString().padStart(2, '0')}${formattedAmount}5802BR59${cleanReceiver.length.toString().padStart(2, '0')}${cleanReceiver}60${cleanCity.length.toString().padStart(2, '0')}${cleanCity}62070503***6304`;
  
  let crc = 0xFFFF;
  for (let i = 0; i < payloadKey.length; i++) {
    crc ^= (payloadKey.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
    }
  }
  const crcHex = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return payloadKey + crcHex;
}

export default function PDVModule() {
  const products = useStore((state) => state.products);
  const currentCashier = useStore((state) => state.currentCashier);
  const addSale = useStore((state) => state.addSale);
  const clients = useStore((state) => state.clients);
  const paymentMethods = useStore((state) => state.paymentMethods);
  const receiptConfig = useStore((state) => state.receiptConfig);
  const currentUser = useStore((state) => state.currentUser);
  const deliveryMethods = useStore((state) => state.deliveryMethods);
  const company = useStore((state) => state.company);
  const logAction = useStore((state) => state.logAction);
  const logoutLocal = useStore((state) => state.logoutLocal);
  const verifyMasterCredential = useStore((state) => state.verifyMasterCredential);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('');
  const [payments, setPayments] = useState<{ methodId: string, methodName: string, amount: number, type: string }[]>([]);
  const [paymentInput, setPaymentInput] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string>('none');
  const [selectedDeliveryMethodId, setSelectedDeliveryMethodId] = useState<string>('');
  const [copiedPix, setCopiedPix] = useState(false);
  const [isQuickClientModalOpen, setIsQuickClientModalOpen] = useState(false);
  
  const [isLocked, setIsLocked] = useState(false);
  const [lockPassword, setLockPassword] = useState('');
  const [lockError, setLockError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (deliveryMethods.length > 0 && !selectedDeliveryMethodId) {
      const emMaos = deliveryMethods.find(m => m.name.toLowerCase().includes('mãos'));
      setSelectedDeliveryMethodId(emMaos?.id || deliveryMethods[0].id);
    }
  }, [deliveryMethods]);

  useEffect(() => {
    (window as any).pdvCartLength = cart.length;
    return () => {
      (window as any).pdvCartLength = 0;
    };
  }, [cart.length]);
  const [quickClientData, setQuickClientData] = useState({
    name: '',
    zip: '',
    address: '',
    number: '',
    phone: '',
    email: '',
  });
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [isSearchingCEP, setIsSearchingCEP] = useState(false);

  const fetchCEP = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, '');
    if (cleanCEP.length !== 8) return;

    setIsSearchingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setQuickClientData(prev => ({
          ...prev,
          address: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
          zip: cleanCEP
        }));
      }
    } catch (error) {
      console.error('Error fetching CEP:', error);
    } finally {
      setIsSearchingCEP(false);
    }
  };

  // Seller is the current user
  const seller = currentUser as User;

  // Protect and block page if currentUser session is invalid/null
  useEffect(() => {
    if (!currentUser) {
      logAction({
        module: 'Acesso',
        actionType: 'other',
        description: 'Tentativa de venda ou acesso via PDV bloqueada: operadora/vendedor sem sessão ativa.',
        status: 'erro'
      });
      alert('Sessão inválida. Faça login novamente para vender.');
      navigate('/login');
    }
  }, [currentUser, navigate, logAction]);

  // Redirect to Open Cashier if not open
  useEffect(() => {
    if (!currentCashier) {
      navigate('/abrir-caixa', { state: { from: location.pathname } });
    }
  }, [currentCashier, navigate, location.pathname]);

  // Set default payment method if none selected
  useEffect(() => {
    if (!selectedMethodId && paymentMethods.length > 0) {
      const defaultMethod = paymentMethods.find(m => m.showInPDV && m.active) || paymentMethods[0];
      if (defaultMethod) {
        setSelectedMethodId(defaultMethod.id);
      }
    }
  }, [paymentMethods, selectedMethodId]);

  const activePaymentMethods = useMemo(() => {
    return paymentMethods.filter(m => m.active && m.showInPDV);
  }, [paymentMethods]);

  const selectedMethod = useMemo(() => {
    return paymentMethods.find(m => m.id === selectedMethodId);
  }, [paymentMethods, selectedMethodId]);

  const filteredProducts = useMemo(() => {
    const active = products.filter(p => p.active !== false && !p.deleted);
    if (!searchTerm.trim()) return active.slice(0, 50);
    return active.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => safeAdd(acc, safeMultiply(item.price, item.quantity)), 0);
  }, [cart]);

  const total = useMemo(() => {
    return Math.max(0, safeSubtract(subtotal, discount));
  }, [subtotal, discount]);

  const totalPaid = useMemo(() => {
    return payments.reduce((acc, p) => safeAdd(acc, p.amount), 0);
  }, [payments]);

  const amountRemaining = useMemo(() => {
    return Math.max(0, safeSubtract(total, totalPaid));
  }, [total, totalPaid]);

  const change = useMemo(() => {
    const hasMoneyPayment = payments.some(p => p.type === 'money');
    if (totalPaid > total && hasMoneyPayment) {
      return safeSubtract(totalPaid, total);
    }
    return 0;
  }, [totalPaid, total, payments]);

  // Broadcast state changes in real-time to the secondary customer display window
  useEffect(() => {
    const channel = new BroadcastChannel('pdv-customer-display-channel');

    const broadcastState = () => {
      // Find selected client details
      const client = clients.find(c => c.id === selectedClientId);
      const clientName = selectedClientId && selectedClientId !== 'none'
        ? (client ? client.name : 'Consumidor Final')
        : 'Consumidor Final';

      // Find selected method details
      const selectedMethodName = selectedMethodId
        ? (paymentMethods.find(p => p.id === selectedMethodId)?.name || '')
        : '';

      channel.postMessage({
        type: 'pdv-state-update',
        payload: {
          cart,
          discount,
          payments,
          selectedMethodName,
          clientName,
          showSuccessModal,
          lastSale,
          subtotal,
          total
        }
      });
    };

    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'request-state') {
        broadcastState();
      }
    };

    broadcastState();

    return () => {
      channel.postMessage({ type: 'pdv-reset' });
      channel.close();
    };
  }, [cart, discount, payments, selectedMethodId, selectedClientId, showSuccessModal, lastSale, clients, paymentMethods, subtotal, total]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-2xl max-w-sm text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto animate-pulse" />
          <h2 className="text-white font-bold text-lg tracking-tight">Sessão Inválida</h2>
          <p className="text-zinc-400 text-xs leading-relaxed">Faça login novamente para realizar vendas.</p>
        </div>
      </div>
    );
  }

  const handleUnlock = () => {
    setLockError(null);
    if (!lockPassword.trim()) {
      setLockError('Insira uma senha.');
      return;
    }
    
    // Check current seller password
    const isSellerPasswordCorrect = currentUser?.password && (lockPassword.trim() === currentUser.password.trim());
    const isSellerLoginCorrect = currentUser?.login && (lockPassword.trim() === currentUser.login.trim());
    
    // Check Master supervising password
    const isMasterCorrect = verifyMasterCredential(lockPassword.trim()).success;
    
    if (isSellerPasswordCorrect || isSellerLoginCorrect || isMasterCorrect) {
      setLockPassword('');
      setIsLocked(false);
      setLockError(null);
      logAction({
        module: 'Acesso',
        actionType: 'login',
        description: `PDV Desbloqueado: ${currentUser?.fullName || 'Operador Central'}`,
        status: 'sucesso',
        referenceId: currentUser?.id
      });
    } else {
      setLockError('Senha incorreta! Use sua senha de operador ou a chave master.');
      setLockPassword('');
      logAction({
        module: 'Acesso',
        actionType: 'login',
        description: `Falha ao destravar PDV: senha incorreta`,
        status: 'erro'
      });
    }
  };

  const addToCart = (product: typeof products[0]) => {
    if (!currentCashier) return;
    
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      
      if (currentQty + 1 > product.stock) {
        alert('Estoque insuficiente para este produto.');
        return prev;
      }

      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setSearchTerm('');
  };

  const updateQuantity = (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        if (newQty > product.stock) {
          alert('Estoque insuficiente.');
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const handleQuickClientSubmit = () => {
    if (!quickClientData.name.trim()) return;

    const addClient = useStore.getState().addClient;
    addClient({
      name: quickClientData.name,
      zip: quickClientData.zip,
      address: quickClientData.address + (quickClientData.number ? `, ${quickClientData.number}` : ''),
      phone: quickClientData.phone,
      email: quickClientData.email || `${quickClientData.name.toLowerCase().replace(/\s/g, '.')}@generado.com`,
    }, seller.fullName);

    setIsQuickClientModalOpen(false);
    
    setTimeout(() => {
      const latestClients = useStore.getState().clients;
      const created = latestClients.find(c => c.name === quickClientData.name);
      if (created) setSelectedClientId(created.id);
    }, 100);

    setQuickClientData({ name: '', zip: '', address: '', number: '', phone: '', email: '' });
  };

  const addPayment = () => {
    if (!selectedMethod) return;
    const amount = roundMoney(parseFloat(paymentInput.replace(',', '.')) || amountRemaining);
    
    if (amount <= 0) return;

    // Check if adding more than total for non-money methods
    if (selectedMethod.type !== 'money' && amount > amountRemaining) {
      alert(`O valor pago em ${selectedMethod.name} não pode ser maior que o saldo restante (R$ ${amountRemaining.toFixed(2)}).`);
      return;
    }

    setPayments(prev => [...prev, {
      methodId: selectedMethod.id,
      methodName: selectedMethod.name,
      amount: amount,
      type: selectedMethod.type
    }]);

    setPaymentInput('');
  };

  const removePayment = (index: number) => {
    setPayments(prev => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = () => {
    if (!currentCashier) return;
    if (cart.length === 0) return;

    if (selectedClientId === 'none') {
      alert('Selecione um cliente ou use Consumidor Final para finalizar a venda.');
      return;
    }

    if (totalPaid < total) {
      alert(`Pagamento incompleto. Falta pagar R$ ${amountRemaining.toFixed(2)}.`);
      return;
    }

    const firstPayment = payments[0];

    const saleData = {
      items: cart.map(item => ({ ...item, pickedQuantity: 0 })),
      subtotal,
      discount,
      total,
      paymentMethodId: firstPayment?.methodId || '',
      paymentMethodName: firstPayment?.methodName || 'Múltiplos',
      receivedAmount: totalPaid,
      change: change,
      payments: payments.map(p => ({
        methodId: p.methodId,
        methodName: p.methodName,
        amount: p.amount
      })),
      clientId: selectedClientId || undefined,
      sellerName: seller.fullName,
      sellerLogin: seller.login,
      deliveryMethodId: selectedDeliveryMethodId,
      deliveryMethodName: deliveryMethods.find(m => m.id === selectedDeliveryMethodId)?.name || '',
    };

    const newSale = addSale(saleData);
    if (newSale) {
      setLastSale(newSale);
      setShowSuccessModal(true);
      // Auto-hide success modal after 3 seconds to not interrupt flow
      setTimeout(() => setShowSuccessModal(false), 3000);
    }
    
    // Clear everything
    setCart([]);
    setDiscount(0);
    setPayments([]);
    setPaymentInput('');
    setSelectedClientId('none');
    setSearchTerm('');
  };

  if (!currentCashier) {
    return null;
  }

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4 md:overflow-hidden md:max-h-[calc(100vh-100px)]">
      
      {/* Main Column - Search, Cart & Payments */}
      <div className="flex-[3] flex flex-col gap-3 md:overflow-hidden">
        
        {/* Top Header: Search & Client */}
        <div className="bg-[#121212] border border-white/5 rounded-xl p-2 flex flex-col md:flex-row items-center gap-2 shrink-0 shadow-inner">
          <div className="relative flex-1 max-w-xl w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3 h-3" />
            <input 
              type="text" 
              placeholder="Pesquisar/Escanear SKU ou Nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredProducts.length > 0) {
                  addToCart(filteredProducts[0]);
                }
              }}
              className="w-full bg-black/40 border border-white/5 rounded-lg py-1.5 pl-8 pr-3 text-[10px] text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10"
              autoFocus
            />
            
            {/* Floating Autocomplete Search Results */}
            <AnimatePresence>
              {searchTerm.trim().length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 right-0 mt-1 z-[100] bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar"
                >
                  {filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-[10px] text-white/20 uppercase font-black">Nenhum produto encontrado</div>
                  ) : (
                    filteredProducts.map(product => (
                      <div 
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="p-3 border-b border-white/5 hover:bg-white/5 cursor-pointer flex items-center justify-between transition-colors last:border-0"
                      >
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-white">{product.name}</span>
                          <span className="text-[8px] font-mono text-emerald-500/60 uppercase tracking-tighter">#{product.code}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[8px] text-white/30 uppercase font-black">{product.stock} em estoque</span>
                          <span className="text-[10px] font-mono font-black text-emerald-400">R$ {product.price.toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex items-center gap-2 px-2 py-1 bg-black/40 border border-white/5 rounded-lg flex-1 md:flex-initial">
               <UserIcon className="w-3 h-3 text-white/30" />
               <select 
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="bg-transparent text-[9px] text-white/80 outline-none cursor-pointer min-w-[120px]"
               >
                  <option value="none" className="bg-[#121212]">Selecione um cliente...</option>
                  <option value="" className="bg-[#121212]">Consumidor Final</option>
                  {clients.filter(c => c.active).map(c => (
                    <option key={c.id} value={c.id} className="bg-[#121212]">{c.name}</option>
                  ))}
               </select>
            </div>
            
            <button 
              onClick={() => setIsQuickClientModalOpen(true)}
              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-lg border border-emerald-500/20 transition-all group"
              title="Cadastro Rápido"
            >
              <UserPlus className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
            </button>

            <button 
              onClick={() => {
                if ((window as any).electron && (window as any).electron.openCustomerDisplayWindow) {
                  (window as any).electron.openCustomerDisplayWindow();
                } else {
                  window.open('#/pdv/customer-display', '_blank', 'width=1024,height=768');
                }
              }}
              className="p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/20 transition-all group flex items-center gap-1.5 cursor-pointer font-black font-sans text-[8px] uppercase hover:scale-105"
              title="Abrir Segunda Tela do Cliente"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Segunda Tela</span>
            </button>

            <button 
              type="button"
              onClick={() => {
                setIsLocked(true);
                logAction({
                  module: 'Acesso',
                  actionType: 'logout',
                  description: `PDV Travado Manualmente por ${currentUser?.fullName || 'Operador Central'}`,
                  status: 'sucesso'
                });
              }}
              className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-all group flex items-center gap-1.5 cursor-pointer font-black font-sans text-[8px] uppercase hover:scale-105"
              title="Travar Tela do PDV (Bloqueio de Segurança)"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Travar Tela</span>
            </button>

            <div className="flex items-center gap-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-xl group transition-all hover:bg-emerald-500/10">
               <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                 <ArrowRight className="w-4 h-4 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
               </div>
               <div className="flex flex-col">
                 <label className="text-[7px] uppercase font-black text-emerald-500/50 tracking-widest leading-none mb-1">Método de Entrega</label>
                 <select 
                  value={selectedDeliveryMethodId}
                  onChange={(e) => setSelectedDeliveryMethodId(e.target.value)}
                  className="bg-transparent text-[11px] font-bold text-white outline-none cursor-pointer min-w-[120px] appearance-none"
                 >
                    {deliveryMethods.filter(m => m.active).map(m => (
                      <option key={m.id} value={m.id} className="bg-[#121212]">{m.name}</option>
                    ))}
                 </select>
               </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-3 min-h-0">
          
          {/* Side-by-side area: Carrinho + Resumo de Lançamentos */}
          <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
            
            {/* Cart Area */}
            <div className="flex-[2.5] lg:flex-[1.8] bg-[#121212] border border-white/5 rounded-2xl flex flex-col overflow-hidden relative shadow-lg min-h-[360px] lg:min-h-0 h-[400px] lg:h-auto">
              <div className="p-2.5 border-b border-white/5 flex items-center justify-between bg-black/20">
                <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1.5">
                  <ShoppingCart className="w-3.5 h-3.5 text-amber-500" /> Itens no Carrinho ({cart.length})
                </h3>
                <button 
                  onClick={() => setCart([])}
                  className="text-[7px] text-red-500/40 hover:text-red-500 uppercase font-black tracking-[0.2em] transition-colors"
                  disabled={cart.length === 0}
                >
                  Limpar tudo
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-10 py-10">
                    <Package className="w-12 h-12 mb-3" />
                    <p className="text-[10px] uppercase font-black tracking-widest text-center">Inicie adicionando produtos<br/>pela pesquisa acima</p>
                  </div>
                ) : (
                  <div className="p-1">
                    <div className="grid grid-cols-12 gap-1 md:gap-2 px-2 md:px-3 py-2 text-[7px] uppercase font-black text-white/10 tracking-[0.1em] border-b border-white/5 bg-black/15">
                      <div className="col-span-1">#</div>
                      <div className="col-span-4">Descrição do Produto</div>
                      <div className="col-span-3 md:col-span-2 text-center">Qtd.</div>
                      <div className="col-span-2 text-right">Unitário</div>
                      <div className="col-span-2 md:col-span-3 text-right pr-1 md:pr-4">Subtotal</div>
                    </div>
                    
                    {cart.map((item, index) => (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        key={item.id} 
                        className="grid grid-cols-12 gap-1 md:gap-2 items-center px-2 md:px-3 py-1.5 md:py-2.5 rounded-lg hover:bg-white/[0.02] transition-colors group border-b border-white/5 last:border-0"
                      >
                        <div className="col-span-1 text-[8px] font-mono text-white/10">{String(index + 1).padStart(2, '0')}</div>
                        <div className="col-span-4">
                          <h4 className="text-[10px] md:text-[11px] font-bold text-white truncate leading-tight mb-0.5">{item.name}</h4>
                          <div className="flex flex-wrap items-center gap-1 md:gap-2">
                            <span className="text-[7px] uppercase font-black text-white/20 tracking-widest">{item.code}</span>
                            <span className="w-1 h-1 rounded-full bg-white/10 hidden md:inline-block" />
                            <span className="text-[7px] uppercase font-black text-amber-500/40 tracking-widest truncate max-w-[60px] md:max-w-none">{item.category}</span>
                          </div>
                        </div>
                        <div className="col-span-3 md:col-span-2 flex items-center justify-center">
                          <div className="flex items-center gap-1 bg-black/40 border border-white/5 rounded-lg p-0.5 shadow-inner">
                            <button 
                              onClick={() => updateQuantity(item.id, -1)}
                              className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center text-white/20 hover:text-white hover:bg-white/5 rounded transition-all">
                              <Minus className="w-2.5 h-2.5 md:w-3 md:h-3" />
                            </button>
                            <span className="text-[9px] md:text-[11px] font-mono font-bold text-white min-w-[16px] md:min-w-[24px] text-center">{item.quantity}</span>
                            <button 
                              onClick={() => updateQuantity(item.id, 1)}
                              className="w-4 h-4 md:w-5 md:h-5 flex items-center justify-center text-emerald-500/40 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all">
                              <Plus className="w-2.5 h-2.5 md:w-3 md:h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="col-span-2 text-right">
                          <span className="text-[8px] md:text-[10px] font-mono text-white/30">R$ {item.price.toFixed(2)}</span>
                        </div>
                        <div className="col-span-2 md:col-span-3 text-right flex items-center justify-end gap-1.5 md:gap-3 pr-1 md:pr-4">
                          <span className="text-[8px] md:text-[10px] font-mono font-black text-emerald-400">R$ {(item.price * item.quantity).toFixed(2)}</span>
                          <button 
                            onClick={() => removeItem(item.id)}
                            className="p-1 text-red-500/60 md:text-white/0 md:group-hover:text-red-500/40 hover:text-red-500 transition-colors">
                            <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Resumo de Lançamentos */}
            <div className="flex-1 bg-[#121212] border border-white/5 rounded-xl flex flex-col overflow-hidden shadow-lg min-h-0">
               <div className="p-2 border-b border-white/5 flex justify-between items-center bg-black/20 shrink-0">
                  <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-blue-500" /> Resumo de Lançamentos
                  </h3>
                  <span className="text-[9px] font-mono font-black text-white/40">TOTAL: R$ {totalPaid.toFixed(2)}</span>
               </div>
               <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {payments.length === 0 ? (
                    <p className="text-[8px] text-white/10 uppercase font-black text-center py-4">Nenhum pagamento registrado</p>
                  ) : (
                    payments.map((p, idx) => (
                       <motion.div initial={{ opacity: 0, x: 5 }} animate={{ opacity: 1, x: 0 }} key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-1.5 group">
                          <div className="flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                             <span className="text-[9px] font-bold text-white uppercase">{p.methodName}</span>
                          </div>
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-mono font-black text-emerald-400">R$ {p.amount.toFixed(2)}</span>
                             <button onClick={() => removePayment(idx)} className="text-white/0 group-hover:text-red-500/60 transition-all">
                                <X className="w-3 h-3" />
                             </button>
                          </div>
                       </motion.div>
                    ))
                  )}
               </div>
            </div>

          </div>

          {/* New Payment Area - MOVED */}
          <div className="bg-[#121212] border border-white/5 rounded-xl flex flex-col overflow-hidden shadow-lg shrink-0">
             <div className="p-2 border-b border-white/5 flex items-center justify-between bg-black/20 text-white shadow-inner">
                <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-blue-400" /> Registrar Pagamento
                </h3>
             </div>
             
             <div className="flex flex-col md:flex-row p-3 gap-4">
                {/* Method selector */}
                <div className="flex-1">
                   <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                    {activePaymentMethods.map(method => (
                      <button 
                        key={method.id}
                        onClick={() => setSelectedMethodId(method.id)}
                        className={cn(
                          "flex items-center justify-center gap-2 p-2 rounded-xl border transition-all grayscale hover:grayscale-0",
                          selectedMethodId === method.id ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 grayscale-0" : "bg-white/2 border-white/5 text-white/20"
                        )}
                      >
                        {method.type === 'money' ? <Banknote className="w-3.5 h-3.5" /> : 
                          method.type === 'pix' ? <QrCode className="w-3.5 h-3.5" /> : 
                          <CreditCard className="w-3.5 h-3.5" />}
                        <span className="text-[8px] font-black uppercase tracking-[0.1em] truncate">{method.name}</span>
                      </button>
                    ))}
                   </div>
                </div>

                {/* Input selector & add button */}
                <div className="flex items-end gap-2 w-full md:w-auto md:min-w-[320px]">
                   <div className="flex-1 space-y-1">
                     <label className="text-[7px] uppercase font-black text-white/20 ml-1">Valor a receber agora</label>
                     <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white/20">R$</span>
                        <input 
                            type="text" 
                            value={paymentInput}
                            onChange={(e) => setPaymentInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addPayment()}
                            className="w-full bg-black/40 py-2.5 pl-8 pr-2.5 rounded-xl border border-white/10 text-xs font-mono text-white outline-none focus:border-emerald-500/50"
                            placeholder={amountRemaining.toFixed(2)}
                        />
                     </div>
                   </div>
                   <button 
                     onClick={addPayment}
                     disabled={!selectedMethodId || amountRemaining <= 0}
                     className="py-2.5 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-20 active:scale-95 h-[38px] flex items-center justify-center"
                   >
                     Adicionar
                   </button>
                </div>
             </div>

             {/* If Pix is selected and there's a valid amount, display a gorgeous real-time QR code panel! */}
             {(() => {
               const selectedMethod = activePaymentMethods.find(m => m.id === selectedMethodId);
               const isPixSelected = selectedMethod?.type === 'pix';
               const pixAmount = Number(paymentInput) || amountRemaining || 0;
               if (!isPixSelected || !company.pixKey || pixAmount <= 0) return null;
               return (
                 <div className="mx-3 mb-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl flex flex-col md:flex-row items-center gap-4 animate-in fade-in slide-in-from-top-1 duration-300">
                   <div className="bg-white p-2 rounded-xl flex items-center justify-center shrink-0">
                     <QRCodeSVG 
                       value={generatePixPayload(
                         company.pixKey, 
                         pixAmount, 
                         company.pixReceiverName || company.name
                       )} 
                       size={100}
                       level="H"
                     />
                   </div>
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                       <span className="text-[9px] uppercase font-black text-emerald-400 tracking-wider">QR Code PIX Ativo</span>
                     </div>
                     <p className="text-[10px] font-bold text-white mt-1">Beneficiário: <span className="text-white/60 font-medium">{company.pixReceiverName || company.name}</span></p>
                     <p className="text-[9px] font-black text-amber-500 mt-0.5">Chave: <span className="font-mono text-white/50">{company.pixKey}</span></p>
                     <p className="text-[11px] font-mono font-black text-emerald-400 mt-1">
                       Valor Requisitado: R$ {pixAmount.toFixed(2)}
                     </p>
                     <button 
                       type="button" 
                       onClick={() => {
                         const payload = generatePixPayload(
                           company.pixKey!, 
                           pixAmount, 
                           company.pixReceiverName || company.name
                         );
                         navigator.clipboard.writeText(payload);
                         setCopiedPix(true);
                         setTimeout(() => setCopiedPix(false), 2000);
                       }}
                       className="mt-2 text-[8px] font-black tracking-widest text-[#0c0c0c] bg-emerald-400 hover:bg-emerald-300 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1 uppercase"
                     >
                       {copiedPix ? 'Copiado!' : 'Copiar Código PIX'}
                     </button>
                   </div>
                 </div>
               );
             })()}
          </div>

        </div>
      </div>

      {/* Right Sidebar - COMPACT (Resumo & Finish) */}
      <div className="w-full lg:w-[220px] xl:w-[260px] flex flex-col gap-3 md:overflow-hidden relative shrink-0">
        <div className="bg-[#121212] border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-2xl h-full">
          <div className="p-4 border-b border-white/5 bg-black/30">
             <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5 text-blue-500" /> Checkout
            </h3>
          </div>
          
          <div className="p-4 flex flex-col h-full gap-5">
             <div className="space-y-4">
               {/* Totals */}
               <div className="bg-black/60 border border-white/5 rounded-2xl p-4 flex flex-col items-center">
                  <span className="text-[8px] uppercase font-black text-white/20 tracking-[0.2em] mb-1">Total da Venda</span>
                  <div className="text-3xl font-mono font-black text-emerald-400">
                    R$ {total.toFixed(2)}
                  </div>
                  <div className="w-full h-px bg-white/5 my-3" />
                  <div className="w-full space-y-1.5 text-[10px]">
                    <div className="flex justify-between items-center">
                        <span className="text-white/20 font-black">SUBTOTAL:</span>
                        <span className="text-white/60 font-mono">R$ {subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between items-center">
                          <span className="text-amber-500/40 font-black">DESCONTO:</span>
                          <span className="text-amber-500 font-mono">- R$ {discount.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
               </div>

               {/* Discount Input */}
               <div className="space-y-1.5">
                  <label className="text-[7px] uppercase font-black text-white/20 tracking-wider ml-1">Aplicar Desconto (R$)</label>
                  <div className="relative group">
                     <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-amber-500/40 group-focus-within:text-amber-500" />
                     <input 
                       type="number"
                       value={discount || ''}
                       onChange={(e) => setDiscount(Number(e.target.value))}
                       className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-xs text-amber-500 font-mono font-black outline-none focus:border-amber-500/30 transition-all"
                       placeholder="0.00"
                     />
                  </div>
               </div>

               {/* Status Summary */}
               <div className="bg-black/20 rounded-2xl p-3 border border-dashed border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase">
                     <span className="text-white/20">Pago:</span>
                     <span className="text-white">R$ {totalPaid.toFixed(2)}</span>
                  </div>
                  {amountRemaining > 0 ? (
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-amber-500">
                       <span>Pendente:</span>
                       <span className="font-mono">R$ {amountRemaining.toFixed(2)}</span>
                    </div>
                  ) : change > 0 ? (
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-400">
                       <span>Troco:</span>
                       <span className="font-mono text-xs">R$ {change.toFixed(2)}</span>
                    </div>
                  ) : totalPaid > 0 && (
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-500">
                       <span>Status:</span>
                       <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completo</span>
                    </div>
                  )}
               </div>
             </div>

             {/* Action Buttons */}
             <div className="mt-auto space-y-3">
                <button 
                  disabled={cart.length === 0 || totalPaid < total}
                  onClick={handleCheckout}
                  className={cn(
                    "w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl active:scale-95",
                    (selectedClientId === 'none' || cart.length === 0 || totalPaid < total) 
                      ? "bg-white/5 text-white/20 cursor-not-allowed" 
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40"
                  )}
                >
                  FINALIZAR VENDA
                </button>

                {/* Inline Errors/Tips */}
                <div className="space-y-1">
                   {totalPaid < total && cart.length > 0 && (
                     <p className="text-[7px] text-amber-500 text-center uppercase font-black leading-tight">
                       Pagamento incompleto. Falta R$ {amountRemaining.toFixed(2)}
                     </p>
                   )}
                   {selectedClientId === 'none' && cart.length > 0 && (
                     <p className="text-[7px] text-amber-500/60 text-center uppercase font-black leading-tight">Selecione cliente no topo</p>
                   )}
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* QUICK CLIENT MODAL */}
      <AnimatePresence>
        {isQuickClientModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsQuickClientModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#121212] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-base font-black text-white uppercase tracking-tighter mb-1 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-500" /> Cadastro Rápido
              </h3>
              <p className="text-[9px] uppercase font-black text-white/30 tracking-widest mb-6">Novo cliente para venda imediata</p>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[8px] uppercase font-black text-white/20 ml-2">Nome Completo</label>
                  <input 
                    type="text" 
                    value={quickClientData.name}
                    onChange={(e) => setQuickClientData({ ...quickClientData, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleQuickClientSubmit()}
                    className="w-full bg-black border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500/50"
                    placeholder="Nome do cliente..."
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/20 ml-2">CEP</label>
                    <input 
                      type="text" 
                      value={quickClientData.zip}
                      onChange={(e) => setQuickClientData({ ...quickClientData, zip: e.target.value })}
                      onBlur={(e) => fetchCEP(e.target.value)}
                      className="w-full bg-black border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500/50 font-mono"
                      placeholder="00000-000"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/20 ml-2">Telefone</label>
                    <input 
                      type="text" 
                      value={quickClientData.phone}
                      onChange={(e) => setQuickClientData({ ...quickClientData, phone: e.target.value })}
                      className="w-full bg-black border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500/50 font-mono"
                      placeholder="(00) 0000-0000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/20 ml-2">Endereço</label>
                    <input 
                      type="text" 
                      value={quickClientData.address}
                      onChange={(e) => setQuickClientData({ ...quickClientData, address: e.target.value })}
                      className="w-full bg-black border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500/50"
                      placeholder="Rua, Av..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/20 ml-2">Nº</label>
                    <input 
                      type="text" 
                      value={quickClientData.number}
                      onChange={(e) => setQuickClientData({ ...quickClientData, number: e.target.value })}
                      className="w-full bg-black border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white outline-none focus:border-emerald-500/50"
                      placeholder="S/N"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-8">
                <button 
                  onClick={() => setIsQuickClientModalOpen(false)}
                  className="py-3 text-[10px] font-black uppercase text-white/20 hover:text-white transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleQuickClientSubmit}
                  disabled={!quickClientData.name.trim()}
                  className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/5 disabled:text-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Sale Success Notification */}
      <AnimatePresence>
        {showSuccessModal && lastSale && (
          <div className="fixed top-20 right-4 z-[100] w-full max-w-sm">
            <motion.div 
              initial={{ opacity: 0, x: 50, scale: 0.9 }} 
              animate={{ opacity: 1, x: 0, scale: 1 }} 
              exit={{ opacity: 0, x: 50, scale: 0.9 }} 
              className="bg-[#121212] border border-emerald-500/30 rounded-2xl p-4 shadow-2xl flex items-center justify-between gap-4"
            >
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                 </div>
                 <div className="min-w-0">
                    <h2 className="text-xs font-black uppercase text-white">Venda Concluída!</h2>
                    <p className="text-[8px] uppercase font-black text-white/30 truncate">Pedido #{lastSale.orderNumber}</p>
                 </div>
               </div>

               <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setShowSuccessModal(false)}
                    className="p-2 hover:bg-white/5 text-white/20 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <OperationalConfirmationModal 
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        onConfirm={(user) => {
          setIsQRModalOpen(false);
          handleCheckout();
        }}
        title="Finalizar via QR Code"
        description="Aproxime seu Crachá para autorizar o fechamento da venda."
      />

      {/* Lock Screen Fullscreen Overlay */}
      <AnimatePresence>
        {isLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-[#09090b] flex flex-col items-center justify-center p-4 select-none"
            style={{ backdropFilter: 'blur(10px)' }}
          >
            {/* Ambient Background Accent */}
            <div className="absolute inset-0 bg-radial-gradient from-red-500/5 via-transparent to-transparent pointer-events-none" />
            
            <div className="w-full max-w-sm bg-[#121214] border border-white/5 rounded-3xl p-6 md:p-8 flex flex-col items-center shadow-2xl relative z-10 space-y-6">
              
              {/* Header inside lock dialog */}
              <div className="flex flex-col items-center text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 animate-pulse border-dashed">
                  <Lock className="w-8 h-8 animate-wiggle" />
                </div>
                <h2 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em] mt-2">PDV Bloqueado</h2>
                <p className="text-[9px] uppercase font-bold text-white/20 tracking-wider">Insira suas credenciais para destravar o terminal</p>
              </div>

              {/* Operator info badge */}
              <div className="w-full bg-black/40 border border-white/5 py-3 px-4 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 font-bold uppercase text-xs border border-emerald-500/20">
                  {seller.fullName ? seller.fullName.substring(0, 2) : 'OP'}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="block text-[8px] font-black uppercase tracking-[0.2em] text-white/30">Operador Atual</span>
                  <p className="text-xs font-black text-white truncate">{seller.fullName || 'Operador Central'}</p>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/15 rounded-md border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[7px] font-black uppercase tracking-wider text-emerald-400">Caixa Ativo</span>
                </div>
              </div>

              {/* Input for password/PIN */}
              <div className="w-full space-y-1.5">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="SENHA OU PIN"
                    value={lockPassword}
                    onChange={(e) => {
                      setLockError(null);
                      setLockPassword(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUnlock();
                    }}
                    className={cn(
                      "w-full bg-black/60 border rounded-xl py-3 pl-4 pr-12 text-center text-sm font-mono uppercase font-black text-white placeholder:text-white/10 outline-none transition-all focus:ring-1 focus:ring-emerald-500/20",
                      lockError ? "border-red-500/40 focus:border-red-500" : "border-white/5 focus:border-emerald-500/50"
                    )}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/30 hover:text-white/60 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {lockError && (
                  <p className="text-[10px] font-bold text-red-400 uppercase text-center tracking-wide animate-pulse mt-1">
                    {lockError}
                  </p>
                )}
              </div>

              {/* Responsive Touch PinPad Grid */}
              <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    type="button"
                    key={num}
                    onClick={() => {
                      setLockError(null);
                      setLockPassword(prev => prev + num);
                    }}
                    className="aspect-square bg-white/5 hover:bg-white/10 text-white font-sans text-xl font-bold flex items-center justify-center rounded-2xl active:scale-95 transition-all border border-white/5 shadow-md"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setLockPassword('')}
                  className="bg-[#121214] hover:bg-red-550/10 hover:text-red-400 text-white/40 font-black text-[9px] uppercase tracking-wider flex items-center justify-center rounded-2xl active:scale-95 transition-all border border-white/5"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLockError(null);
                    setLockPassword(prev => prev + '0');
                  }}
                  className="aspect-square bg-white/5 hover:bg-white/10 text-white font-sans text-xl font-bold flex items-center justify-center rounded-2xl active:scale-95 transition-all border border-white/5 shadow-md"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (lockPassword.length > 0) {
                      setLockPassword(prev => prev.slice(0, -1));
                    }
                  }}
                  className="bg-[#121214] hover:bg-white/10 text-white/60 font-black text-[14px] flex items-center justify-center rounded-2xl active:scale-95 transition-all border border-white/5"
                >
                  ⌫
                </button>
              </div>

              {/* Action and Logout links */}
              <div className="w-full flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-emerald-500/20 active:scale-95"
                >
                  <Unlock className="w-3.5 h-3.5" /> Desbloquear PDV
                </button>
                
                <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5 w-full">
                  <button
                    type="button"
                    onClick={() => {
                      logoutLocal();
                      navigate('/login');
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-colors active:scale-95 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" /> Trocar Operador
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
