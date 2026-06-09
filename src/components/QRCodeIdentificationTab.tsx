import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  QrCode, 
  Search, 
  User, 
  ShieldCheck, 
  Box, 
  ShoppingCart, 
  IdCard, 
  AlertCircle, 
  Camera, 
  CameraOff, 
  ChevronRight, 
  Sparkles, 
  FileText, 
  CheckCircle2, 
  Package, 
  Tag, 
  Calendar, 
  TrendingUp, 
  UserX,
  CreditCard,
  MapPin,
  ClipboardCheck,
  RefreshCw
} from 'lucide-react';
import { useStore } from '../store';
import QRScanner from './QRScanner';

interface IdentifiedItem {
  type: 'admin' | 'user' | 'badge' | 'product' | 'sale' | 'client';
  title: string;
  subtitle: string;
  description: string;
  details: { label: string; value: string | number; highlight?: boolean }[];
  accentColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function QRCodeIdentificationTab() {
  const [inputValue, setInputValue] = useState('');
  const [scannedValue, setScannedValue] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [identifiedResult, setIdentifiedResult] = useState<IdentifiedItem | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Store lists
  const users = useStore((state) => state.users) || [];
  const badges = useStore((state) => state.badges) || [];
  const products = useStore((state) => state.products) || [];
  const sales = useStore((state) => state.sales) || [];
  const clients = useStore((state) => state.clients) || [];

  // Start scanner safely
  const startScanner = () => {
    setScanError(null);
    setIsScanning(true);
    setIdentifiedResult(null);
  };

  // Run database-wide inquiry on searchQuery change
  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === '') {
      setIdentifiedResult(null);
      return;
    }

    setIsSearching(true);
    const cleanToken = searchQuery.trim();

    // 1. Check if it matches a JSON Admin Badge descriptor
    let matchFound = false;
    let parsedJsonToken: string | null = null;
    let isLegacyAdminJson = false;

    if (cleanToken.startsWith('{')) {
      try {
        const parsed = JSON.parse(cleanToken);
        if (parsed && parsed.type === 'admin-badge' && parsed.tokenId) {
          parsedJsonToken = parsed.tokenId;
          isLegacyAdminJson = true;
        }
      } catch (_) {}
    }

    const tokenToEvaluate = parsedJsonToken || cleanToken;

    // A. Inquiry: MASTER ADMIN / ADM
    const adminUser = users.find(u => 
      u.id === 'admin' || 
      u.isMasterAdmin === true || 
      u.isOwner === true || 
      (u.login && u.login === 'admin')
    );

    if (adminUser && adminUser.qrCodeToken === tokenToEvaluate) {
      setIdentifiedResult({
        type: 'admin',
        title: 'Administrador Principal',
        subtitle: 'Acesso Mestre do Sistema',
        description: 'Este QR Code corresponde ao crachá administrativo oficial do ADM. Ele está vinculado ao login do mestre e permite autenticação direta no painel do sistema.',
        accentColor: 'emerald',
        icon: ShieldCheck,
        details: [
          { label: 'Nome Completo', value: adminUser.fullName || 'Administrador Nexa' },
          { label: 'Identificador / Login', value: adminUser.login || 'admin', highlight: true },
          { label: 'Função Principal', value: adminUser.primaryFunction || 'Gerente Geral' },
          { label: 'Matrícula', value: adminUser.matricula || 'admin' },
          { label: 'Situação cadastral', value: 'ATIVO (Protegido)', highlight: true },
          { label: 'Tipo do Crachá', value: isLegacyAdminJson ? 'Crachá Estruturado (JSON)' : 'Token Direto (Escanear Crachá)' }
        ]
      });
      matchFound = true;
    }

    // B. Inquiry: COMMON USERS
    if (!matchFound) {
      const matchedUser = users.find(u => u.qrCodeToken === tokenToEvaluate);
      if (matchedUser) {
        const isUserAdmin = matchedUser.id === 'admin' || matchedUser.isMasterAdmin || matchedUser.isOwner;
        setIdentifiedResult({
          type: 'user',
          title: isUserAdmin ? 'Administrador Secundário' : 'Operador / Colaborador',
          subtitle: `Acesso a usuário: ${matchedUser.login}`,
          description: 'Este QR Code está associado diretamente a um cadastro de colaborador no banco de dados local. Ele permite login rápido através do terminal e crachá.',
          accentColor: isUserAdmin ? 'violet' : 'sky',
          icon: User,
          details: [
            { label: 'Nome Completo', value: matchedUser.fullName },
            { label: 'Login de Acesso', value: matchedUser.login, highlight: true },
            { label: 'Matrícula', value: matchedUser.matricula || 'Não informada' },
            { label: 'Perfil / Função', value: matchedUser.primaryFunction || 'Operador / Caixa' },
            { label: 'Nível Administrativo', value: matchedUser.isAdmin ? 'Administrador' : 'Colaborador Comum' },
            { label: 'Setor de Atuação', value: matchedUser.setor || 'Geral' },
            { label: 'Status da Conta', value: matchedUser.status === 'ativo' ? 'Ativo' : 'Inativo', highlight: true }
          ]
        });
        matchFound = true;
      }
    }

    // C. Inquiry: BADGES (CRACHÁS)
    if (!matchFound) {
      const matchedBadge = badges.find(b => b.codigoCracha === tokenToEvaluate);
      if (matchedBadge) {
        const userWithBadge = matchedBadge.usuarioVinculado ? users.find(u => u.id === matchedBadge.usuarioVinculado) : null;
        setIdentifiedResult({
          type: 'badge',
          title: 'Crachá de Colaborador',
          subtitle: `Crachá ID: ${matchedBadge.id}`,
          description: 'Este QR Code corresponde a um crachá físico catalogado no gerenciador de crachás. Ele pode estar ativo ou inativo e vinculado a um usuário.',
          accentColor: matchedBadge.status === 'Vinculado' ? 'teal' : 'amber',
          icon: IdCard,
          details: [
            { label: 'Código do Crachá', value: matchedBadge.codigoCracha, highlight: true },
            { label: 'Status do Crachá', value: matchedBadge.status || 'Livre', highlight: true },
            { label: 'Pertence a um Usuário', value: userWithBadge ? 'Sim (Vinculado)' : 'Não (Disponível)' },
            { label: 'Colaborador Associado', value: userWithBadge ? userWithBadge.fullName : 'Nenhum' },
            { label: 'Login do Colaborador', value: userWithBadge ? userWithBadge.login : 'N/A' },
            { label: 'Data de Cadastro', value: matchedBadge.dataCriacao ? new Date(matchedBadge.dataCriacao).toLocaleDateString('pt-BR') : 'Desconhecida' }
          ]
        });
        matchFound = true;
      }
    }

    // D. Inquiry: PRODUCTS (ESTOQUE)
    if (!matchFound) {
      const matchedProduct = products.find(p => 
        (p.code && p.code.trim() === tokenToEvaluate) || 
        (p.barcode && p.barcode.trim() === tokenToEvaluate) || 
        p.id === tokenToEvaluate
      );
      if (matchedProduct) {
        setIdentifiedResult({
          type: 'product',
          title: 'Produto / Catálogo',
          subtitle: matchedProduct.name,
          description: 'Este QR Code corresponde a uma etiqueta de produto cadastrada no controle de estoque industrial.',
          accentColor: 'indigo',
          icon: Box,
          details: [
            { label: 'Nome do Item', value: matchedProduct.name, highlight: true },
            { label: 'Código de Referência (SKU)', value: matchedProduct.code || matchedProduct.id },
            { label: 'Preço Venda Unitário', value: `R$ ${matchedProduct.price?.toFixed(2)}` },
            { label: 'Estoque de Segurança', value: `${matchedProduct.minStock || 0} ${matchedProduct.unit || 'UN'}` },
            { label: 'Categoria / Grupo', value: matchedProduct.unit || 'Peças / Diversos' },
            { label: 'Quantidade em Estoque', value: `${matchedProduct.stock || 0} ${matchedProduct.unit || 'UN'}`, highlight: true }
          ]
        });
        matchFound = true;
      }
    }

    // E. Inquiry: SALES (PEDIDOS / ORDEM DE SEPARAÇÃO)
    if (!matchFound) {
      const matchedSale = sales.find(s => 
        s.id === tokenToEvaluate || 
        (s.orderNumber && s.orderNumber.trim() === tokenToEvaluate)
      );
      if (matchedSale) {
        setIdentifiedResult({
          type: 'sale',
          title: 'Pedido de Venda / Separação',
          subtitle: `Ordem: ${matchedSale.orderNumber || matchedSale.id}`,
          description: 'Este QR Code pertence a uma guia de pedido de separação impressa. Ele serve para acompanhar o fluxo logístico e despacho final das caixas.',
          accentColor: 'cyan',
          icon: ShoppingCart,
          details: [
            { label: 'Número da Venda/Pedido', value: matchedSale.orderNumber || matchedSale.id, highlight: true },
            { label: 'Cliente Destinatário', value: matchedSale.clientId ? (clients.find(c => c.id === matchedSale.clientId)?.name || 'Cliente Cadastrado') : 'Cliente Consumidor Final' },
            { label: 'Quantidade de Itens', value: matchedSale.items?.length || 0 },
            { label: 'Valor Total Bruto', value: `R$ ${matchedSale.total?.toFixed(2)}` },
            { label: 'Status Logístico', value: matchedSale.status || 'Pendente', highlight: true },
            { label: 'Operador / Vendedor', value: matchedSale.sellerName || 'Balcão / Interno' },
            { label: 'Data de Emissão', value: matchedSale.timestamp ? new Date(matchedSale.timestamp).toLocaleDateString('pt-BR') : 'N/A' }
          ]
        });
        matchFound = true;
      }
    }

    // F. Inquiry: CLIENTS
    if (!matchFound) {
      const matchedClient = clients.find(c => 
        c.id === tokenToEvaluate || 
        (c.document && c.document.trim() === tokenToEvaluate)
      );
      if (matchedClient) {
        setIdentifiedResult({
          type: 'client',
          title: 'Cliente Cadastrado',
          subtitle: matchedClient.name,
          description: 'Este QR Code corresponde a um registro cadastral de cliente ou transportador integrado ao ecossistema ERP.',
          accentColor: 'pink',
          icon: User,
          details: [
            { label: 'Visual Nome/Razão', value: matchedClient.name, highlight: true },
            { label: 'CNPJ ou CPF Doc', value: matchedClient.document || 'Isento / Não inf.' },
            { label: 'Contato Fone', value: matchedClient.phone || matchedClient.whatsapp || 'Não cadastrado' },
            { label: 'E-mail Comercial', value: matchedClient.email || 'Não cadastrado' },
            { label: 'Cidade Sede', value: matchedClient.city || 'N/A' },
            { label: 'Estado (UF)', value: matchedClient.state || 'N/A' },
            { label: 'Situação de Crédito', value: 'Liberado / Ativo', highlight: true }
          ]
        });
        matchFound = true;
      }
    }

    if (!matchFound) {
      // Not registered
      setIdentifiedResult(null);
    }

    setIsSearching(false);
  }, [searchQuery, users, badges, products, sales, clients]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(inputValue);
  };

  const handleClear = () => {
    setInputValue('');
    setScannedValue(null);
    setSearchQuery('');
    setIdentifiedResult(null);
    setScanError(null);
  };

  return (
    <div className="space-y-6">
      {/* Tab Header Description */}
      <div className="bg-white/2 border border-white/5 rounded-xl p-5 md:p-6">
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-indigo-500/10 rounded-xl shrink-0">
            <QrCode className="w-5 h-5 text-indigo-400 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Identificador Global de QR Code</h3>
            <p className="text-xs text-white/40 mt-1 max-w-2xl leading-relaxed">
              Use esta ferramenta de diagnóstico para escanear ou digitar qualquer QR Code do sistema. 
              Ela rastreia localizações em múltiplos módulos e identifica a qual entidade pertence o código, sem alterar, expor senhas ou comprometer dados locais.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Reader and inputs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#0e0e0e] border border-white/5 rounded-xl p-5 shadow-xl">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Entrada de Sinal</h4>

            {/* Toggle Camera Scan Button */}
            <div className="mb-5">
              <button
                onClick={startScanner}
                type="button"
                className="w-full h-11 flex items-center justify-center gap-2 border border-emerald-500/30 hover:border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-bold text-xs uppercase tracking-widest rounded-lg transition-all shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)]"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Escanear por Câmera</span>
              </button>
            </div>

            {/* Unified Modal Camera Scanner overlay */}
            <AnimatePresence>
              {isScanning && (
                <QRScanner
                  title="Identificador de QR Code"
                  description="Aponte o código, envie imagem ou leia da área de transferência"
                  onScan={(decodedText) => {
                    setScannedValue(decodedText);
                    setInputValue(decodedText);
                    setSearchQuery(decodedText);
                    setIsScanning(false);
                  }}
                  onClose={() => setIsScanning(false)}
                />
              )}
            </AnimatePresence>

            {scanError && (
              <div className="p-3 mb-5 border border-rose-500/20 bg-rose-500/5 text-rose-400 text-[10px] font-medium leading-relaxed rounded-lg flex gap-2.5 items-start">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            {/* Manual Text Input Search Form */}
            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1.5">
                  Fórmula / Valor Bruto do QR Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Cole ou redija o token do QR Code..."
                    className="w-full h-11 pl-4 pr-10 border border-white/5 bg-white/2 hover:bg-white/4 focus:bg-white/5 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/40 text-xs text-white placeholder-white/20 rounded-lg transition-all font-mono"
                  />
                  <button
                    type="submit"
                    className="absolute right-3.5 top-3.5 text-white/30 hover:text-white transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!inputValue.trim()}
                  className="flex-1 h-10 flex items-center justify-center border border-indigo-500/30 hover:border-indigo-500/50 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:border-white/5 disabled:bg-white/2 disabled:text-white/20 text-indigo-400 font-semibold text-xs rounded-lg transition-all"
                >
                  Identificar Código
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="h-10 px-4 flex items-center justify-center border border-white/5 hover:bg-white/5 text-white/40 hover:text-white text-xs font-semibold rounded-lg transition-all"
                >
                  Limpar
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Identification results display */}
        <div className="lg:col-span-7">
          <AnimatePresence mode="wait">
            {isSearching ? (
              <motion.div
                key="loading-search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-[#0e0e0e] border border-white/5 rounded-xl p-8 min-h-[340px] flex flex-col items-center justify-center text-center"
              >
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                <span className="text-[10px] text-white/30 font-black tracking-[0.3em] uppercase mt-4">Cruzando Dados...</span>
              </motion.div>
            ) : identifiedResult ? (
              <motion.div
                key={searchQuery}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-[#0e0e0e] border border-white/5 rounded-xl overflow-hidden shadow-xl"
              >
                {/* Result header */}
                <div className={`p-5 border-b border-white/5 bg-gradient-to-r from-${identifiedResult.accentColor}-500/10 to-transparent flex gap-4 items-center`}>
                  <div className={`p-2.5 rounded-xl bg-${identifiedResult.accentColor}-500/20 text-${identifiedResult.accentColor}-400 shrink-0`}>
                    <identifiedResult.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <span className={`text-[9px] font-black uppercase text-${identifiedResult.accentColor}-400 tracking-widest`}>
                      Registro Encontrado
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">{identifiedResult.title}</h3>
                  </div>
                </div>

                {/* Subtitle / Token values */}
                <div className="px-6 py-4 bg-white/2 border-b border-white/5">
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">
                    Fórmula do QR Code Identificado
                  </div>
                  <div className="text-xs font-mono text-emerald-400 bg-black/60 px-3.5 py-2 border border-white/5 rounded-md break-all">
                    {searchQuery}
                  </div>
                </div>

                {/* Description Text */}
                <div className="px-6 py-4 text-xs text-white/50 leading-relaxed border-b border-white/5 bg-white/[0.01]">
                  {identifiedResult.description}
                </div>

                {/* Secure Information list */}
                <div className="p-6">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3.5">
                    Metadados de Consulta Segura
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {identifiedResult.details.map((detail, index) => (
                      <div 
                        key={index} 
                        className="p-3 border border-white/5 bg-white/1 rounded-lg flex flex-col gap-1 justify-between"
                      >
                        <span className="text-[9px] font-medium text-white/35 uppercase tracking-wide">
                          {detail.label}
                        </span>
                        <span className={`text-xs font-semibold ${detail.highlight ? 'text-emerald-400' : 'text-white'}`}>
                          {detail.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Anti-tampering advisory message */}
                  <div className="mt-6 p-3 bg-white/2 border border-white/5 rounded-lg flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-white/25 shrink-0" />
                    <span className="text-[10px] text-white/40 leading-relaxed">
                      Este módulo opera sob modo sandbox estrito. Alterações cadastrais ou modificações de banco devem ser realizadas individualmente em seus respectivos painéis de permissões comerciais.
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : searchQuery === '' ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-[#0e0e0e] border border-white/5 border-dashed rounded-xl p-8 min-h-[340px] flex flex-col items-center justify-center text-center text-white/25"
              >
                <div className="p-4 bg-white/2 border border-white/5 rounded-2xl mb-4">
                  <QrCode className="w-8 h-8 text-white/20" />
                </div>
                <h4 className="text-sm font-semibold text-white/40">Inquérito de QR Code</h4>
                <p className="text-xs text-white/20 mt-1 max-w-sm leading-relaxed">
                  Escaneie ou digite um token de QR Code para identificar onde ele está cadastrado e qual seu perfil.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="no-match"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-[#0e0e0e] border border-rose-500/10 rounded-xl overflow-hidden shadow-xl"
              >
                {/* Result header */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-rose-500/10 to-transparent flex gap-4 items-center">
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                    <UserX className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase text-rose-400 tracking-widest">
                      Nenhum resultado
                    </span>
                    <h3 className="text-base font-bold text-white mt-0.5">Disponível para uso</h3>
                  </div>
                </div>

                {/* Subtitle / Token values */}
                <div className="px-6 py-4 bg-white/2 border-b border-white/5">
                  <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">
                    QR Code Escaneado / Informado
                  </div>
                  <div className="text-xs font-mono text-rose-400 bg-black/60 px-3.5 py-2 border border-white/5 rounded-md break-all">
                    {searchQuery}
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="text-xs text-white/50 leading-relaxed">
                    Este QR Code <strong>NÃO ESTÁ CADASTRADO</strong> em nenhuma tabela de segurança, crachá, produto, cliente, ordens de separação ou faturamento de caixa.
                  </div>
                  <div className="text-xs text-emerald-400/90 font-medium leading-relaxed bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-lg flex gap-2.5">
                    <CheckCircle2 className="w-4.5 h-4.5 shrink-0 mt-0.5 text-emerald-400" />
                    <span>Deste modo, ele está completamente livre na rede comercial e pode ser usado livremente como identificador de novo crachá no menu Usuários ou para controle de inventário.</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
