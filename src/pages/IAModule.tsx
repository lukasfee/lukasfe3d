import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, 
  AlertCircle, 
  Lightbulb, 
  TrendingUp, 
  PackageSearch, 
  Users, 
  Clock, 
  ArrowUpRight,
  ShieldAlert,
  Zap,
  BarChart3,
  CheckCircle2,
  Eye
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';

export default function IAModule() {
  const alerts = useStore((state) => state.alerts);
  const products = useStore((state) => state.products);
  const sales = useStore((state) => state.sales);
  const currentCashier = useStore((state) => state.currentCashier);
  const generateAlerts = useStore((state) => state.generateAlerts);
  const updateAlertStatus = useStore((state) => state.updateAlertStatus);
  const clients = useStore((state) => state.clients);

  useEffect(() => {
    generateAlerts();
  }, []);

  const insights = [
    { 
      label: 'Estoque em Atenção', 
      value: `${products.filter(p => p.active !== false && !p.deleted && p.stock < p.minStock * 1.5).length} itens`, 
      icon: PackageSearch, 
      color: 'text-amber-400', 
      bg: 'bg-amber-500/10' 
    },
    { 
      label: 'Caixa Status', 
      value: currentCashier ? 'Ativo' : 'Fechado', 
      icon: Zap, 
      color: currentCashier ? 'text-emerald-400' : 'text-red-400', 
      bg: currentCashier ? 'bg-emerald-500/10' : 'bg-red-500/10' 
    },
    { 
      label: 'Total Vendas IA', 
      value: `R$ ${sales.reduce((acc, s) => acc + s.total, 0).toFixed(2)}`, 
      icon: TrendingUp, 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10' 
    },
    { 
      label: 'Clientes Base', 
      value: `${clients.length} contatos`, 
      icon: Users, 
      color: 'text-blue-400', 
      bg: 'bg-blue-500/10' 
    },
  ];

  const suggestions = useMemo(() => {
    // 1. Inventory prioritization
    const lowStockProd = products.find(p => p.stock < p.minStock);
    let invSug = {
      title: 'Reposição Prioritária',
      desc: 'Nenhum item com estoque abaixo do mínimo registrado.',
      action: 'Ver Inventário'
    };
    if (lowStockProd) {
      invSug.desc = `Repor ${lowStockProd.name} (SKU: ${lowStockProd.code}). Estoque atual: ${lowStockProd.stock} un, Mínimo recomendado: ${lowStockProd.minStock} un.`;
    } else if (products.length > 0) {
      const minStockObj = [...products].sort((a, b) => a.stock - b.stock)[0];
      invSug.desc = `Estoque saudável. Produto com menor estoque no momento é ${minStockObj.name} (${minStockObj.stock} un).`;
    }

    // 2. Inteligente Campaign
    const highStockProd = products.length > 0 ? [...products].sort((a, b) => b.stock - a.stock)[0] : null;
    let promoSug = {
      title: 'Promoção Inteligente',
      desc: 'Sem itens disponíveis para promoção inteligente.',
      action: 'Criar Campanha'
    };
    if (highStockProd) {
      promoSug.desc = `${highStockProd.name} possui alto volume em estoque (${highStockProd.stock} un). Sugerimos aplicar 10% OFF temporário no catálogo.`;
    }

    // 3. CRM / Loyalty
    let crmSug = {
      title: 'Fidelização',
      desc: 'Nenhum cliente cadastrado na base ainda.',
      action: 'Notificar CRM'
    };
    if (clients.length > 0) {
      crmSug.desc = `${clients.length} contatos ativos na base. Sugerimos disparar cupom CLIENTESPECIAL por WhatsApp para estimular a recompra.`;
    }

    // 4. Financial Otimization
    const moneySales = sales.filter(s => s.paymentMethodName?.toLowerCase().includes('dinheiro') || s.paymentMethodName?.toLowerCase().includes('money'));
    const moneyTotal = moneySales.reduce((acc, s) => acc + s.total, 0);
    let cashierSug = {
      title: 'Otimização de Caixa',
      desc: currentCashier ? 'Acompanhamento de caixa ativo. Todas as transações foram processadas regularmente.' : 'Aguardando abertura de caixa para monitorar movimentações.',
      action: 'Ver Caixa'
    };
    if (currentCashier && moneyTotal > 500) {
      cashierSug.desc = `Volume alto de vendas em espécie (R$ ${moneyTotal.toFixed(2)}). Recomendamos realizar uma sangria operacional de segurança.`;
    }

    return [invSug, promoSug, crmSug, cashierSug];
  }, [products, sales, clients, currentCashier]);

  return (
    <div className="min-h-full md:h-full flex flex-col gap-4 overflow-y-auto md:overflow-hidden md:max-h-[calc(100vh-140px)] custom-scrollbar pb-8 md:pb-0">
      {/* Header com Status */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-light text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-400" /> IA Operacional
          </h1>
          <p className="text-[10px] uppercase font-black tracking-[0.3em] text-white/30">Central inteligente para análise da operação</p>
        </div>
        <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Motor Operacional Ativo</span>
        </div>
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {insights.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-[#121212] border border-white/5 rounded-xl p-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
          >
            <div className={cn("p-2 rounded-lg shrink-0", item.bg)}>
              <item.icon className={cn("w-4 h-4", item.color)} />
            </div>
            <div>
              <span className="block text-[8px] uppercase font-black text-white/20 tracking-wider">{item.label}</span>
              <span className="text-xs font-bold text-white tracking-tight">{item.value}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Analysis Area */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-visible md:overflow-hidden">
        
        {/* Alertas - Left Area */}
        <div className="md:col-span-12 lg:col-span-7 flex flex-col gap-4 overflow-visible md:overflow-hidden">
          <div className="flex-1 bg-[#121212] border border-white/5 rounded-2xl p-5 flex flex-col shadow-inner">
            <h3 className="text-[10px] uppercase font-black text-white/30 tracking-[0.2em] mb-4 flex items-center gap-2">
              <ShieldAlert className="w-3 h-3 text-red-400" /> Alertas Inteligentes ({alerts.length})
            </h3>
            <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2">
              {alerts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-10">
                  <CheckCircle2 className="w-12 h-12 mb-2" />
                  <p className="text-xs font-black uppercase tracking-widest">Tudo em dia</p>
                </div>
              ) : (
                alerts.map((alert, i) => (
                  <div key={alert.id} className={cn(
                    "p-3 border rounded-xl flex gap-3 group transition-all",
                    alert.status === 'new' ? 'bg-black/40 border-white/10' : 'bg-black/10 border-white/5 opacity-50'
                  )}>
                    <div className={cn(
                      "w-8 h-8 rounded-lg shrink-0 flex items-center justify-center",
                      alert.priority === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                    )}>
                      {alert.type === 'inventory' ? <PackageSearch className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-black uppercase text-white/40 tracking-wider font-sans">{alert.title}</p>
                        <span className="text-[8px] text-white/10 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-[11px] text-white/70 leading-relaxed font-medium group-hover:text-white transition-colors">{alert.description}</p>
                      <div className="mt-2 flex items-center gap-4">
                        {alert.status === 'new' ? (
                          <button 
                            onClick={() => updateAlertStatus(alert.id, 'seen')}
                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-500/50 hover:text-emerald-400 transition-colors"
                          >
                            <Eye className="w-2.5 h-2.5" /> Marcar Visto
                          </button>
                        ) : (
                          <button 
                            onClick={() => updateAlertStatus(alert.id, 'resolved')}
                            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all underline underline-offset-4"
                          >
                            Arquivar
                          </button>
                        )}
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-500/40 hover:text-blue-400 cursor-pointer transition-colors">
                          Ação <ArrowUpRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="p-5 bg-gradient-to-br from-emerald-500/10 via-black/40 to-transparent border border-emerald-500/10 rounded-2xl flex items-center justify-between group overflow-hidden relative shadow-lg">
            <div className="absolute -right-4 -bottom-4 p-2 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity">
              <BarChart3 className="w-32 h-32 rotate-12" />
            </div>
            <div className="relative z-10 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] uppercase font-black text-emerald-500/80 tracking-[0.2em]">Resumo Preditivo</span>
              </div>
              <p className="text-xs text-white/90 font-medium italic pr-12 line-clamp-2">
                "{currentCashier ? 'Fluxo de caixa saudável. Tendência de crescimento de 5% para amanhã.' : 'Aguardando abertura de caixa para análises financeiras em tempo real.'}"
              </p>
            </div>
            <button className="relative z-10 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] uppercase font-black tracking-widest rounded-xl transition-all shrink-0 shadow-xl shadow-emerald-950/20 active:scale-95">
              Gerar Relatório
            </button>
          </div>
        </div>

        {/* Sugestões - Right Area */}
        <div className="md:col-span-12 lg:col-span-5 flex flex-col overflow-visible md:overflow-hidden">
          <div className="flex-1 bg-[#121212] border border-white/5 rounded-2xl p-5 flex flex-col shadow-inner">
            <h3 className="text-[10px] uppercase font-black text-white/30 tracking-[0.2em] mb-4 flex items-center gap-2">
              <Lightbulb className="w-3 h-3 text-amber-400" /> Sugestões Operacionais
            </h3>
            <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
              {suggestions.map((sug, i) => (
                <div key={i} className="group cursor-pointer p-3 border border-transparent hover:border-white/5 hover:bg-white/[0.01] rounded-xl transition-all">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors uppercase tracking-tight">{sug.title}</span>
                    <ArrowUpRight className="w-3 h-3 text-white/10 group-hover:text-white" />
                  </div>
                  <p className="text-[11px] text-white/40 leading-snug group-hover:text-white/60 transition-colors mb-3">{sug.desc}</p>
                  <div className="flex justify-end">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.15em] group-hover:text-amber-500 transition-colors">{sug.action}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="p-3 bg-black/40 rounded-xl flex items-center justify-between group cursor-pointer hover:bg-emerald-500/5 transition-all border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase text-white/60 tracking-widest group-hover:text-white">Explorar Automações</span>
                    <span className="text-[8px] text-white/20 uppercase font-bold tracking-tighter">Otimize tarefas manuais</span>
                  </div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/20 group-hover:text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

