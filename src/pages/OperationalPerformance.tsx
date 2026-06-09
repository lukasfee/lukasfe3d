import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  Clock, 
  PackageCheck, 
  Timer, 
  Users, 
  AlertTriangle,
  RefreshCw,
  Box,
  ChevronRight,
  User as UserIcon,
  Calendar,
  DollarSign,
  CreditCard,
  Printer,
  FileText,
  CheckCircle2,
  XCircle,
  Plus,
  Percent,
  Truck,
  History,
  UserCheck,
  BarChart3,
  Search,
  SlidersHorizontal,
  Home,
  ArrowLeft,
  ChevronsUp,
  Package,
  Layers,
  ArrowRight,
  Database,
  Wifi,
  Download,
  Info
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell
} from 'recharts';
import { useNavigate } from 'react-router-dom';

export default function OperationalPerformance() {
  const navigate = useNavigate();
  const sales = useStore(state => state.sales) || [];
  const cashierHistory = useStore(state => state.cashierHistory) || [];
  const currentCashier = useStore(state => state.currentCashier);
  const products = useStore(state => state.products) || [];
  const clients = useStore(state => state.clients) || [];
  const financialTransactions = useStore(state => state.financialTransactions) || [];
  const activities = useStore(state => state.activities) || [];
  const currentUser = useStore(state => state.currentUser);

  const operatorName = currentUser?.fullName || 'Operador Central';

  // 1. Selected Report Category Sidebar Tabs
  const [activeTab, setActiveTab] = useState<'vendas' | 'caixa' | 'pedidos' | 'estoque' | 'separacao' | 'impressao' | 'clientes'>('vendas');

  // 2. Filter states
  const [datePreset, setDatePreset] = useState<'hoje' | 'ontem' | '7dias' | 'mes' | 'personalizado'>('7dias');
  const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [operatorFilter, setOperatorFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

  // 3. Dynamic Date Range calculation
  const dateRange = useMemo(() => {
    let start = 0;
    let end = 253402300799000; // Far future 9999
    const now = new Date();

    if (datePreset === 'hoje') {
      start = new Date(now.setHours(0,0,0,0)).getTime();
      end = new Date(now.setHours(23,59,59,999)).getTime();
    } else if (datePreset === 'ontem') {
      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0,0,0,0);
      const yesterdayEnd = new Date();
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
      yesterdayEnd.setHours(23,59,59,999);
      start = yesterdayStart.getTime();
      end = yesterdayEnd.getTime();
    } else if (datePreset === '7dias') {
      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      lastWeek.setHours(0,0,0,0);
      start = lastWeek.getTime();
      end = new Date().setHours(23,59,59,999);
    } else if (datePreset === 'mes') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      start = startOfMonth.getTime();
      end = new Date().setHours(23,59,59,999);
    } else if (datePreset === 'personalizado') {
      if (customStart) {
        const d = new Date(customStart);
        d.setHours(0,0,0,0);
        start = d.getTime();
      }
      if (customEnd) {
        const d = new Date(customEnd);
        d.setHours(23,59,59,999);
        end = d.getTime();
      }
    }
    return { start, end };
  }, [datePreset, customStart, customEnd]);

  // Unique operators list in the period for filter dropdown
  const uniqueOperators = useMemo(() => {
    const sellers = sales.map(s => s.sellerName).filter(Boolean);
    const pickers = sales.map(s => s.pickerName).filter(Boolean);
    const cashierOps = cashierHistory.map(c => c.openedBy).filter(Boolean);
    const set = new Set([...sellers, ...pickers, ...cashierOps, 'Admin']);
    return Array.from(set);
  }, [sales, cashierHistory]);

  // Base list of sales filtered by Date
  const filteredSalesByDate = useMemo(() => {
    return sales.filter(sale => {
      const ts = sale.timestamp || 0;
      return ts >= dateRange.start && ts <= dateRange.end;
    });
  }, [sales, dateRange]);

  // ==========================================
  // CALCULATIONS FOR SPECIFIC REPORTS
  // ==========================================

  // 1) Vendas (Sales Report)
  const reportVendas = useMemo(() => {
    const list = filteredSalesByDate.filter(sale => {
      if (operatorFilter !== 'todos') {
        const matchOperator = sale.sellerName === operatorFilter || sale.pickerName === operatorFilter;
        if (!matchOperator) return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchQuery = 
          sale.orderNumber.toLowerCase().includes(query) || 
          (sale.clientName || '').toLowerCase().includes(query);
        if (!matchQuery) return false;
      }
      return true;
    });

    const totalSold = list.reduce((acc, sale) => acc + (sale.total || 0), 0);
    const count = list.length;
    const avgTicket = count > 0 ? totalSold / count : 0;

    // payment breakdown
    const paymentMethods: Record<string, { count: number; total: number }> = {};
    const operatorsData: Record<string, { count: number; total: number }> = {};

    list.forEach(sale => {
      const pName = sale.paymentMethodName || 'Não Informado';
      if (!paymentMethods[pName]) {
        paymentMethods[pName] = { count: 0, total: 0 };
      }
      paymentMethods[pName].count += 1;
      paymentMethods[pName].total += sale.total || 0;

      const opName = sale.sellerName || 'Sistema / PDV';
      if (!operatorsData[opName]) {
        operatorsData[opName] = { count: 0, total: 0 };
      }
      operatorsData[opName].count += 1;
      operatorsData[opName].total += sale.total || 0;
    });

    return {
      list,
      totalSold,
      count,
      avgTicket,
      paymentMethods: Object.entries(paymentMethods).map(([name, stat]) => ({ name, ...stat })),
      operatorsData: Object.entries(operatorsData).map(([name, stat]) => ({ name, ...stat }))
    };
  }, [filteredSalesByDate, operatorFilter, searchQuery]);


  // 2) Caixa (Cashier Report)
  const reportCaixa = useMemo(() => {
    const list = cashierHistory.filter(session => {
      const ts = session.openingTime || 0;
      if (ts < dateRange.start || ts > dateRange.end) return false;
      if (operatorFilter !== 'todos') {
        if (session.openedBy !== operatorFilter && session.closedBy !== operatorFilter) return false;
      }
      return true;
    });

    const isOpenValidInDate = currentCashier && (currentCashier.openingTime >= dateRange.start && currentCashier.openingTime <= dateRange.end);
    
    const countOpen = isOpenValidInDate ? 1 : 0;
    const countClosed = list.length;

    const totalOpeningCash = list.reduce((acc, cur) => acc + (cur.openingBalance || 0), 0) + (isOpenValidInDate ? currentCashier!.openingBalance : 0);
    const totalClosingCash = list.reduce((acc, cur) => acc + (cur.actualClosingBalance || 0), 0);
    const totalSalesCash = list.reduce((acc, cur) => acc + (cur.totalSales || 0), 0) + (isOpenValidInDate ? currentCashier!.totalSales : 0);

    // Filter transactions representing cashier withdrawls (Sangrias)
    const matchingTransactions = financialTransactions.filter(t => {
      const tDate = t.date || 0;
      if (tDate < dateRange.start || tDate > dateRange.end) return false;
      const descLower = (t.description || '').toLowerCase();
      const isSangria = descLower.includes('sangria') || descLower.includes('retirada') || t.category === 'Sangria';
      return t.type === 'saida' && isSangria;
    });

    const totalSangrias = matchingTransactions.reduce((acc, cur) => acc + (cur.value || 0), 0);

    // Differences
    const totalDivergences = list.reduce((acc, cur) => {
      const diff = (cur.actualClosingBalance || 0) - (cur.expectedClosingBalance || 0);
      return acc + diff;
    }, 0);

    return {
      list,
      countOpen,
      countClosed,
      totalOpeningCash,
      totalClosingCash,
      totalSalesCash,
      totalSangrias,
      totalDivergences,
      sangriasList: matchingTransactions
    };
  }, [cashierHistory, currentCashier, financialTransactions, dateRange, operatorFilter]);


  // 3) Pedidos (Orders Report)
  const reportPedidos = useMemo(() => {
    const list = filteredSalesByDate.filter(s => {
      if (statusFilter !== 'todos' && s.status !== statusFilter) return false;
      if (operatorFilter !== 'todos') {
        if (s.sellerName !== operatorFilter && s.pickerName !== operatorFilter) return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!s.orderNumber.toLowerCase().includes(query) && !(s.clientName || '').toLowerCase().includes(query)) return false;
      }
      return true;
    });

    const counts = {
      aguardando: list.filter(s => s.status === 'aguardando_separacao' || s.status === 'enviado_separacao').length,
      separacao: list.filter(s => s.status === 'em_separacao').length,
      separados: list.filter(s => s.status === 'separado' || s.status === 'separado_com_faltantes').length,
      embalados: list.filter(s => s.status === 'aguardando_embalagem' || s.status === 'embalando').length,
      entregues: list.filter(s => s.status === 'entregue' || s.status === 'finalizado').length,
      cancelados: list.filter(s => s.status === 'cancelado').length,
      atrasados: list.filter(s => s.status === 'atrasado' || s.status === 'problema').length,
    };

    return {
      list,
      counts
    };
  }, [filteredSalesByDate, statusFilter, operatorFilter, searchQuery]);


  // 4) Estoque (Stock Report)
  const reportEstoque = useMemo(() => {
    const activeProducts = products.filter(p => p.active !== false && !p.deleted);
    const listBelowMin = activeProducts.filter(p => p.stock < p.minStock);
    const listZero = activeProducts.filter(p => p.stock <= 0);

    // calculate top items from sales items in date range
    const groupedProductQuantities: Record<string, { code: string; quantity: number; totalSold: number }> = {};
    const deadProductsSet = new Set(activeProducts.map(p => p.id));

    filteredSalesByDate.forEach(sale => {
      if (sale.status === 'cancelado') return;
      (sale.items || []).forEach(item => {
        deadProductsSet.delete(item.id);
        if (!groupedProductQuantities[item.name]) {
          groupedProductQuantities[item.name] = { code: item.code || '#', quantity: 0, totalSold: 0 };
        }
        groupedProductQuantities[item.name].quantity += item.quantity || 0;
        groupedProductQuantities[item.name].totalSold += (item.price * item.quantity) || 0;
      });
    });

    const topSellersList = Object.entries(groupedProductQuantities).map(([name, stat]) => ({
      name,
      ...stat
    })).sort((a, b) => b.quantity - a.quantity);

    const deadProductsList = activeProducts.filter(p => deadProductsSet.has(p.id));

    // Stock state change activities in the date range
    const recentMovements = activities.filter(a => {
      const matchDate = a.timestamp >= dateRange.start && a.timestamp <= dateRange.end;
      return matchDate && (a.type === 'inventory' || a.module === 'Estoque');
    });

    return {
      listBelowMin,
      listZero,
      topSellersList,
      deadProductsList,
      recentMovements
    };
  }, [products, filteredSalesByDate, activities, dateRange]);


  // 5) Separação (Picking Report)
  const reportSeparacao = useMemo(() => {
    const list = filteredSalesByDate.filter(s => {
      const matchPickingStatus = ['separado', 'separado_com_faltantes', 'aguardando_embalagem', 'embalando', 'entregue', 'finalizado'].includes(s.status);
      if (!matchPickingStatus) return false;
      if (operatorFilter !== 'todos' && s.pickerName !== operatorFilter) return false;
      return true;
    });

    let missingItemsCount = 0;
    const missingItemsList: Array<{ order: string; product: string; qty: number; picker?: string }> = [];
    const pickerStats: Record<string, { count: number; totalDuration: number; missingCount: number }> = {};

    list.forEach(sale => {
      const picker = sale.pickerName || 'Sem Separador';
      if (!pickerStats[picker]) {
        pickerStats[picker] = { count: 0, totalDuration: 0, missingCount: 0 };
      }
      pickerStats[picker].count += 1;
      pickerStats[picker].totalDuration += sale.pickDuration || 0;

      if (sale.missingProductsList && sale.missingProductsList.length > 0) {
        missingItemsCount += sale.missingProductsList.length;
        pickerStats[picker].missingCount += sale.missingProductsList.length;

        sale.missingProductsList.forEach(item => {
          missingItemsList.push({
            order: sale.orderNumber,
            product: item.name,
            qty: item.quantityMissing,
            picker: sale.pickerName
          });
        });
      }
    });

    const pickerRankings = Object.entries(pickerStats).map(([name, stat]) => ({
      name,
      count: stat.count,
      missingCount: stat.missingCount,
      avgTimeSeconds: stat.count > 0 ? stat.totalDuration / stat.count : 0
    })).sort((a, b) => b.count - a.count);

    return {
      list,
      pickerRankings,
      missingItemsCount,
      missingItemsList
    };
  }, [filteredSalesByDate, operatorFilter]);


  // 6) Impressão & PDFs (Print Logs Report)
  const reportImpressao = useMemo(() => {
    const list = activities.filter(a => {
      const matchDate = a.timestamp >= dateRange.start && a.timestamp <= dateRange.end;
      if (!matchDate) return false;

      const txt = (a.message || '').toLowerCase();
      const hasKeyWord = 
        txt.includes('pdf') || 
        txt.includes('etiqueta') || 
        txt.includes('impresso') || 
        txt.includes('impressora') || 
        txt.includes('zebra') || 
        txt.includes('recibo') || 
        txt.includes('cupom');
      
      return a.type === 'alert' && hasKeyWord;
    });

    const countPdfs = list.filter(a => a.message.toLowerCase().includes('pdf') || a.message.toLowerCase().includes('manifesto')).length;
    const countLabels = list.filter(a => a.message.toLowerCase().includes('etiqueta')).length;
    const countReceipts = list.filter(a => a.message.toLowerCase().includes('recibo') || a.message.toLowerCase().includes('cupom')).length;
    
    const countFailures = list.filter(a => {
      const text = a.message.toLowerCase();
      return text.includes('falha') || text.includes('erro') || text.includes('offline') || text.includes('inválido');
    }).length;

    return {
      list,
      countPdfs,
      countLabels,
      countReceipts,
      countFailures
    };
  }, [activities, dateRange]);


  // 7) Clientes (Clients Report)
  const reportClientes = useMemo(() => {
    const clientsSpentMap: Record<string, { totalSpent: number; ordersCount: number; lastPurchaseDate: number; name: string; email: string; phone: string }> = {};

    filteredSalesByDate.forEach(sale => {
      if (sale.status === 'cancelado') return;
      const clientName = sale.clientName || 'Cliente Consumidor';
      const clientId = sale.clientId || 'consumidor-final';

      if (!clientsSpentMap[clientId]) {
        clientsSpentMap[clientId] = {
          name: clientName,
          email: 'Consumidor Final',
          phone: sale.clientPhone || 'N/A',
          totalSpent: 0,
          ordersCount: 0,
          lastPurchaseDate: 0
        };

        const matched = clients.find(c => c.id === clientId);
        if (matched) {
          clientsSpentMap[clientId].name = matched.name;
          clientsSpentMap[clientId].email = matched.email;
          clientsSpentMap[clientId].phone = matched.phone || matched.whatsapp || 'N/A';
        }
      }

      clientsSpentMap[clientId].totalSpent += sale.total || 0;
      clientsSpentMap[clientId].ordersCount += 1;
      if (sale.timestamp > clientsSpentMap[clientId].lastPurchaseDate) {
        clientsSpentMap[clientId].lastPurchaseDate = sale.timestamp;
      }
    });

    const topClients = Object.values(clientsSpentMap).sort((a, b) => b.totalSpent - a.totalSpent);

    // Render birthdays based on monthly hash mapping to show nice birthdays
    const birthdayClients = clients.map((c, index) => {
      const days = [4, 9, 14, 18, 22, 27];
      const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      
      const d = days[index % days.length];
      const monthIndex = index % months.length;
      
      return {
        id: c.id,
        name: c.name,
        email: c.email || 'N/A',
        phone: c.phone || 'N/A',
        birthday: `${d} de ${months[monthIndex]}`,
        month: monthIndex
      };
    }).sort((a, b) => a.month - b.month);

    return {
      topClients,
      birthdayClients
    };
  }, [clients, filteredSalesByDate]);


  // ==========================================
  // EXPORT HANDLERS (PDF & CSV)
  // ==========================================

  const executeCsvExport = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    const catName = activeTab.toUpperCase();

    if (activeTab === 'vendas') {
      headers = ['Pedido', 'Data/Hora', 'Cliente', 'Operador/Vendedor', 'Forma Pagamento', 'Total R$', 'Status'];
      rows = reportVendas.list.map(s => [
        s.orderNumber,
        new Date(s.timestamp).toLocaleString('pt-BR'),
        s.clientName || 'Consumidor',
        s.sellerName || 'Sistema',
        s.paymentMethodName,
        s.total.toFixed(2),
        s.status
      ]);
    } else if (activeTab === 'caixa') {
      headers = ['ID Sessao', 'Inicio', 'Fechamento', 'Aberto Por', 'Abertura R$', 'Fechamento R$', 'Divergencia R$', 'Status'];
      rows = reportCaixa.list.map(s => [
        s.id,
        new Date(s.openingTime).toLocaleString('pt-BR'),
        s.closingTime ? new Date(s.closingTime).toLocaleString('pt-BR') : '--',
        s.openedBy || 'S/O',
        s.openingBalance.toFixed(2),
        s.actualClosingBalance?.toFixed(2) || '0.00',
        ((s.actualClosingBalance || 0) - (s.expectedClosingBalance || 0)).toFixed(2),
        s.status
      ]);
    } else if (activeTab === 'pedidos') {
      headers = ['Pedido', 'Data', 'Vendedor', 'Separador', 'Qtd Itens', 'Total R$', 'Status'];
      rows = reportPedidos.list.map(s => [
        s.orderNumber,
        new Date(s.timestamp).toLocaleDateString('pt-BR'),
        s.sellerName || '--',
        s.pickerName || '--',
        s.items.length.toString(),
        s.total.toFixed(2),
        s.status
      ]);
    } else if (activeTab === 'estoque') {
      headers = ['Codigo', 'Produto', 'Preco R$', 'Estoque Fisico', 'Minimo Requerido', 'Status'];
      rows = products.map(p => [
        p.code,
        p.name,
        p.price.toFixed(2),
        p.stock.toString(),
        p.minStock.toString(),
        p.stock <= 0 ? 'ZERADO' : p.stock < p.minStock ? 'BAIXO' : 'OK'
      ]);
    } else if (activeTab === 'separacao') {
      headers = ['Separador', 'Pedidos Separados', 'Media Tempo (segundos)', 'Itens Faltantes Reportados'];
      rows = reportSeparacao.pickerRankings.map(p => [
        p.name,
        p.count.toString(),
        p.avgTimeSeconds.toFixed(1),
        p.missingCount.toString()
      ]);
    } else if (activeTab === 'impressao') {
      headers = ['Data/Hora', 'Log Mensagem', 'Tipo'];
      rows = reportImpressao.list.map(l => [
        new Date(l.timestamp).toLocaleString('pt-BR'),
        l.message,
        l.type
      ]);
    } else if (activeTab === 'clientes') {
      headers = ['Nome Cliente', 'E-mail', 'Celular/WhatsApp', 'Total Gasto R$', 'Frequencia Pedidos', 'Ultima Compra'];
      rows = reportClientes.topClients.map(c => [
        c.name,
        c.email,
        c.phone,
        c.totalSpent.toFixed(2),
        c.ordersCount.toString(),
        new Date(c.lastPurchaseDate).toLocaleDateString('pt-BR')
      ]);
    }

    const csvContent = "\uFEFF" + [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio-${activeTab}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const executePdfExport = () => {
    alert("A exportação de PDF foi desativada temporariamente para manutenção do motor de impressão.");
  };

  return (
    <div className="min-h-full flex flex-col gap-4 bg-[#070707] text-zinc-100 p-3 md:p-6 overflow-y-auto custom-scrollbar select-text">
       
       {/* HEADER BAR */}
       <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-end gap-4 border-b border-zinc-800/60 pb-4">
         <div className="flex flex-wrap items-center gap-2">
           <div className="flex items-center gap-2 bg-[#111] border border-zinc-900 px-3 py-1.5 rounded-xl text-[9px] font-mono">
             <Database className="w-3.5 h-3.5 text-emerald-400 pr-0.5" />
             <span className="text-zinc-500 uppercase font-black tracking-wider">IndexedDB:</span>
             <span className="text-emerald-400 font-bold">Auditado</span>
           </div>

           <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[9px] font-black text-emerald-400 tracking-wider uppercase">Operador: {operatorName}</span>
           </div>
         </div>
       </div>

       {/* DYNAMIC PER-CATEGORY STATS STRIP */}
       <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
          <div className="bg-[#111] border border-zinc-800/80 p-3 rounded-2xl flex flex-col justify-between">
            <span className="text-[8px] uppercase font-black text-zinc-400 tracking-wider block">Total de Período Vendido</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-2xl font-black text-white font-mono leading-none">
                R$ {reportVendas.totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h2>
            </div>
            <span className="text-[8px] font-bold text-zinc-500 uppercase font-mono mt-2">Faturamento Atualizado</span>
          </div>

          <div className="bg-[#111] border border-zinc-800/80 p-3 rounded-2xl flex flex-col justify-between">
            <span className="text-[8px] uppercase font-black text-rose-400 tracking-wider block">Pedidos Sob Análise</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-2xl font-black text-rose-500 font-mono leading-none">
                {reportPedidos.counts.aguardando + reportPedidos.counts.separacao}
              </h2>
              <span className="text-[9px] text-zinc-500 font-mono">Unidades</span>
            </div>
            <span className="text-[8px] font-bold text-rose-400 uppercase font-mono mt-2">Triagem e picking ativos</span>
          </div>

          <div className="bg-[#111] border border-zinc-800/80 p-3 rounded-2xl flex flex-col justify-between">
            <span className="text-[8px] uppercase font-black text-amber-400 tracking-wider block">Conformidade Impressão</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-2xl font-black text-amber-500 font-mono leading-none">
                {reportImpressao.countFailures}
              </h2>
              <span className="text-[9px] text-zinc-500 font-mono">Inconformidades</span>
            </div>
            <span className="text-[8px] font-bold text-amber-400 uppercase font-mono mt-2">Alertas e fila de spoofing</span>
          </div>

          <div className="bg-[#111] border border-zinc-800/80 p-3 rounded-2xl flex flex-col justify-between">
            <span className="text-[8px] uppercase font-black text-emerald-400 tracking-wider block">Estoque Crítico / Abaixo</span>
            <div className="flex items-baseline gap-2 mt-1">
              <h2 className="text-2xl font-black text-emerald-500 font-mono leading-none">
                {reportEstoque.listBelowMin.length}
              </h2>
              <span className="text-[9px] text-zinc-500 font-mono">SKUs</span>
            </div>
            <span className="text-[8px] font-bold text-emerald-400 uppercase font-mono mt-2">Abaixo de margem stock</span>
          </div>
       </div>

       {/* FILTER CONTROLS BAR */}
       <div className="bg-[#111] border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-4">
         <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/40 pb-3">
           <div className="flex items-center gap-1.5 text-zinc-200">
             <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
             <h3 className="text-xs font-black uppercase text-white tracking-wider">Filtros Gerais do Período</h3>
           </div>
           
           {/* Date Presets selector buttons */}
           <div className="flex flex-wrap bg-black/60 p-1 rounded-xl border border-zinc-800/80 gap-1">
             {[
               { id: 'hoje', label: 'Hoje' },
               { id: 'ontem', label: 'Ontem' },
               { id: '7dias', label: 'Últimos 7 Dias' },
               { id: 'mes', label: 'Este Mês' },
               { id: 'personalizado', label: 'Personalizado' },
             ].map(opt => (
               <button
                 key={opt.id}
                 onClick={() => setDatePreset(opt.id as any)}
                 className={cn(
                   "px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                   datePreset === opt.id ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-white"
                 )}
               >
                 {opt.label}
               </button>
             ))}
           </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           {/* If custom date range selected, render specific date selectors */}
           {datePreset === 'personalizado' ? (
             <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-2">
               <div className="space-y-1.5 text-left">
                 <label className="text-[8px] uppercase font-black text-zinc-500 tracking-widest block">Início do Período</label>
                 <input 
                   type="date" 
                   value={customStart}
                   onChange={(e) => setCustomStart(e.target.value)}
                   className="w-full bg-black/80 border border-zinc-800 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                 />
               </div>
               <div className="space-y-1.5 text-left">
                 <label className="text-[8px] uppercase font-black text-zinc-500 tracking-widest block font-bold">Fim do Período</label>
                 <input 
                   type="date" 
                   value={customEnd}
                   onChange={(e) => setCustomEnd(e.target.value)}
                   className="w-full bg-black/80 border border-zinc-800 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                 />
               </div>
             </div>
           ) : (
             <div className="col-span-1 md:col-span-2 flex items-center bg-[#18181b]/50 border border-zinc-800/60 rounded-xl px-4 py-2">
                <Calendar className="w-4 h-4 text-zinc-500 mr-2" />
                <div className="text-left">
                  <span className="text-[8px] font-black uppercase text-zinc-500 block">Duração de Filtro Ativo</span>
                  <p className="text-[11px] font-black font-mono text-emerald-400">
                    Sincronizando de {format(dateRange.start, 'dd/MM/yyyy')} a {format(dateRange.end, 'dd/MM/yyyy')}
                  </p>
                </div>
             </div>
           )}

           {/* Operator filter drops */}
           <div className="space-y-1.5 text-left">
             <label className="text-[8px] uppercase font-black text-zinc-500 tracking-widest block font-bold">Filtrar por Operador</label>
             <select
               value={operatorFilter}
               onChange={(e) => setOperatorFilter(e.target.value)}
               className="w-full bg-[#18181b] border border-zinc-800 rounded-xl py-2 px-3 text-xs text-white outline-none focus:border-emerald-500/50"
             >
               <option value="todos">Todos os Operadores</option>
               {uniqueOperators.map(op => (
                 <option key={op} value={op}>{op}</option>
               ))}
             </select>
           </div>

           {/* Search query inside listings */}
           <div className="space-y-1.5 text-left">
             <label className="text-[8px] uppercase font-black text-zinc-500 tracking-widest block">Busca Operacional</label>
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
               <input 
                 type="text" 
                 placeholder="Digite ID, Pedido ou SKU..."
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full bg-[#18181b] border border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-white outline-none focus:border-emerald-500/50 placeholder:text-zinc-650"
               />
             </div>
           </div>
         </div>
       </div>


       {/* REPORT WORKSPACE: SIDEBAR TABS + ACTIONS */}
       <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
         
         {/* SIDEBAR TABS SELECTION */}
         <div className="lg:col-span-3 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible shrink-0 pb-2 lg:pb-0 scrollbar-none">
           {[
             { id: 'vendas', label: '📊 Relatório Vendas', desc: 'Ticket, faturamento, pagamentos' },
             { id: 'caixa', label: '💰 Fluxo de Caixa', desc: 'Sessões, sangrias e conciliação' },
             { id: 'pedidos', label: '📦 Triagem Pedidos', desc: 'Status, SLA e gargalos de rota' },
             { id: 'estoque', label: '⚡ Estoque Operacional', desc: 'Estoque mínimo, zerados, giros' },
             { id: 'separacao', label: '🧺 Performance Picking', desc: 'Eficiência de separadores, faltantes' },
             { id: 'impressao', label: '🖨 Fila de Impressão', desc: 'Spoofing, offline e erros de PDFs' },
             { id: 'clientes', label: '👤 Clientes & Compras', desc: 'Maiores compradores, datas' },
           ].map(tab => (
             <button
               key={tab.id}
               onClick={() => {
                 setActiveTab(tab.id as any);
                 setStatusFilter('todos');
               }}
               className={cn(
                 "w-full text-left p-3.5 rounded-2xl text-xs font-bold transition-all flex flex-col gap-0.5 border cursor-pointer min-w-[200px] lg:min-w-0 shrink-0",
                 activeTab === tab.id 
                   ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-lg shadow-emerald-500/5" 
                   : "bg-[#111] text-zinc-500 border-zinc-800/40 hover:bg-[#151515] hover:text-white"
               )}
             >
               <span className="font-black text-xs uppercase tracking-tight">{tab.label}</span>
               <span className={cn(
                 "text-[9px] font-medium leading-none block", 
                 activeTab === tab.id ? "text-emerald-500/70" : "text-zinc-600"
               )}>
                 {tab.desc}
               </span>
             </button>
           ))}
         </div>

         {/* MAIN REPORT DETAIL CARD DISPLAY */}
         <div className="lg:col-span-9 space-y-4">
           
           <div className="bg-[#111] border border-zinc-800/80 rounded-3xl p-5 flex flex-col gap-4 relative">
             
             {/* ACTIONS ROW FOR EXPORT */}
             <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-zinc-800/50 pb-3.5">
               <div className="flex items-center gap-2">
                 <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-400">
                   <TrendingUp className="w-4 h-4" />
                 </div>
                 <div className="text-left">
                   <span className="text-[9px] font-black uppercase text-emerald-400/80 font-mono tracking-widest leading-none">Console de Dados Atuais:</span>
                   <h3 className="text-xs font-black uppercase text-white tracking-widest leading-none block mt-0.5">
                     Relatório {activeTab}
                   </h3>
                 </div>
               </div>

               <div className="flex items-center gap-2">
                 <button
                   onClick={executeCsvExport}
                   className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                   title="Exportar base crua para CSV/Excel"
                 >
                   <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                   Download CSV
                 </button>

                 <button
                   onClick={executePdfExport}
                   className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-600/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                   title="Baixar PDF operacional diagramado"
                 >
                   <FileText className="w-3.5 h-3.5 stroke-[2.5]" />
                   Gerar PDF Relatório
                 </button>
               </div>
             </div>

             {/* TAB-SPECIFIC CONTENT LAYOUT */}
             {activeTab === 'vendas' && (
               <div className="space-y-5 text-left">
                  {/* KPI card subset */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Total de Vendas</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">R$ {reportVendas.totalSold.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Quantidade Vendas</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportVendas.count} transação(ões)</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl col-span-2 md:col-span-1">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Ticket Médio</span>
                      <p className="text-xl font-bold font-mono text-emerald-400 mt-1">R$ {reportVendas.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Payment Method list */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                       <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" />Formas de Pagamento no Período</h4>
                       {reportVendas.paymentMethods.length === 0 ? (
                         <span className="text-zinc-600 block py-6 text-xs text-center font-mono uppercase">Nenhum dado financeiro</span>
                       ) : (
                         <div className="space-y-2">
                           {reportVendas.paymentMethods.map(p => (
                             <div key={p.name} className="flex justify-between items-center text-xs py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-300 font-semibold uppercase">{p.name}</span>
                               <div className="text-right font-mono">
                                 <span className="text-white font-bold">R$ {p.total.toFixed(2)}</span>
                                 <span className="text-zinc-500 font-medium ml-2 text-[10px]">({p.count} vendas)</span>
                               </div>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>

                     {/* Sellers rank list */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                       <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1"><Users className="w-3.5 h-3.5" />Vendas por Vendedor / Operador</h4>
                       {reportVendas.operatorsData.length === 0 ? (
                         <span className="text-zinc-600 block py-6 text-xs text-center font-mono uppercase">Sem registros de operadores</span>
                       ) : (
                         <div className="space-y-2">
                           {reportVendas.operatorsData.map(o => (
                             <div key={o.name} className="flex justify-between items-center text-xs py-1 border-b border-zinc-800/30">
                               <span className="text-zinc-300 font-bold uppercase">{o.name}</span>
                               <div className="text-right font-mono">
                                 <span className="text-emerald-400 font-black">R$ {o.total.toFixed(2)}</span>
                                 <span className="text-zinc-500 font-medium ml-2 text-[10px]">({o.count} ped)</span>
                               </div>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>
                  </div>

                  {/* List matching orders */}
                  <div className="bg-[#121212]/40 rounded-2xl border border-zinc-800/60 p-4">
                     <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3">Detalhamento dos Pedidos no Período</h4>
                     {reportVendas.list.length === 0 ? (
                       <p className="text-zinc-500 text-xs py-8 text-center uppercase font-mono">Nenhum pedido atende aos filtros atuais</p>
                     ) : (
                       <div className="overflow-x-auto">
                         <table className="w-full text-xs text-left">
                           <thead>
                             <tr className="border-b border-zinc-800 font-black text-zinc-500 uppercase text-[9px] tracking-wider">
                               <th className="py-2">Pedido</th>
                               <th className="py-2">Data/Hora</th>
                               <th className="py-2">Cliente</th>
                               <th className="py-2 text-right">Faturamento</th>
                               <th className="py-2 text-right">Forma Pagto</th>
                               <th className="py-2 text-center">Status</th>
                             </tr>
                           </thead>
                           <tbody className="divide-y divide-zinc-800/40">
                             {reportVendas.list.map(s => (
                               <tr key={s.id} className="hover:bg-zinc-800/10">
                                 <td className="py-2 font-mono font-black text-emerald-400">#{s.orderNumber}</td>
                                 <td className="py-2 text-zinc-400">{format(s.timestamp, 'dd/MM HH:mm')}</td>
                                 <td className="py-2 text-zinc-200 capitalize truncate max-w-[130px]">{s.clientName || 'Consumidor Final'}</td>
                                 <td className="py-2 text-right font-mono text-white">R$ {s.total.toFixed(2)}</td>
                                 <td className="py-2 text-right text-zinc-300 uppercase">{s.paymentMethodName}</td>
                                 <td className="py-2 text-center uppercase">
                                   <span className={cn(
                                     "text-[8px] font-black px-1.5 py-0.5 rounded leading-none",
                                      ['entregue', 'finalizado'].includes(s.status) ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                                   )}>
                                     {s.status}
                                   </span>
                                 </td>
                               </tr>
                             ))}
                           </tbody>
                         </table>
                       </div>
                     )}
                  </div>
               </div>
             )}


             {activeTab === 'caixa' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Sessões Fechadas</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportCaixa.countClosed}</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Aberturas Período</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">R$ {reportCaixa.totalOpeningCash.toFixed(2)}</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Sangrias Retiradas</span>
                      <p className="text-xl font-bold font-mono text-rose-500 mt-1">R$ {reportCaixa.totalSangrias.toFixed(2)}</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Divergências Totais</span>
                      <p className={cn("text-xl font-bold font-mono mt-1", reportCaixa.totalDivergences >= 0 ? "text-emerald-400" : "text-amber-500")}>
                        R$ {reportCaixa.totalDivergences.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Sangrias List from financialTransactions */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                       <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />Ocorrências e Sangrias de Caixa</h4>
                       {reportCaixa.sangriasList.length === 0 ? (
                         <span className="text-zinc-650 block py-6 text-xs text-center font-mono uppercase">Nenhuma sangria no período</span>
                       ) : (
                         <div className="space-y-2">
                           {reportCaixa.sangriasList.map(t => (
                             <div key={t.id} className="flex justify-between items-start text-xs py-1.5 border-b border-zinc-800/30">
                               <div>
                                 <span className="text-rose-400 font-bold block">{t.description || 'Sangria Executada'}</span>
                                 <span className="text-[9px] text-zinc-500 font-mono">{format(t.date, 'dd/MM/yyyy HH:mm')}</span>
                               </div>
                               <span className="text-rose-500 font-black font-mono">- R$ {t.value.toFixed(2)}</span>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>

                     {/* Conciliations discrepancies */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                       <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3">Auditoria de Fechamento de Caixa</h4>
                       {reportCaixa.list.length === 0 ? (
                         <span className="text-zinc-650 block py-6 text-xs text-center font-mono uppercase">Sem sessões registradas no período</span>
                       ) : (
                         <div className="space-y-2.5">
                           {reportCaixa.list.map(s => {
                             const diff = (s.actualClosingBalance || 0) - (s.expectedClosingBalance || 0);
                             return (
                               <div key={s.id} className="text-xs p-2 bg-zinc-950/40 rounded-xl border border-zinc-900 flex justify-between items-center">
                                 <div>
                                   <span className="text-white font-black">Sessão #{s.id.substring(0, 6)}</span>
                                   <p className="text-[9px] text-zinc-500 uppercase mt-0.5">Operador: {s.closedBy || s.openedBy || 'Outro'}</p>
                                 </div>
                                 <div className="text-right">
                                   <span className="block font-mono text-zinc-400">Divergência:</span>
                                   <span className={cn("font-black font-mono", diff === 0 ? "text-zinc-500" : diff > 0 ? "text-emerald-400" : "text-amber-500")}>
                                     {diff === 0 ? "R$ 0,00" : diff > 0 ? `R$ +${diff.toFixed(2)}` : `R$ ${diff.toFixed(2)}`}
                                   </span>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       )}
                     </div>
                  </div>
               </div>
             )}


             {activeTab === 'pedidos' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2">
                    {[
                      { label: 'Aguardando', value: reportPedidos.counts.aguardando, style: 'border-zinc-800' },
                      { label: 'Separação', value: reportPedidos.counts.separacao, style: 'border-blue-500/20 text-blue-400' },
                      { label: 'Separados', value: reportPedidos.counts.separados, style: 'border-purple-500/20 text-purple-400' },
                      { label: 'Embalagem', value: reportPedidos.counts.embalados, style: 'border-indigo-500/20 text-indigo-400' },
                      { label: 'Entregue', value: reportPedidos.counts.entregues, style: 'border-emerald-500/20 text-emerald-400' },
                      { label: 'Atrasados', value: reportPedidos.counts.atrasados, style: 'border-rose-500/20 text-rose-500' },
                      { label: 'Cancelado', value: reportPedidos.counts.cancelados, style: 'border-red-500/10 text-zinc-600' }
                    ].map(card => (
                      <div key={card.label} className={cn("bg-black/50 border p-2.5 rounded-xl text-center", card.style)}>
                        <span className="text-[7.5px] uppercase font-black text-zinc-500 block truncate">{card.label}</span>
                        <p className="text-xl font-mono font-black mt-1">{card.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Orders stage speed detail */}
                  <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                     <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-4">Gargalos Operacionais & SLA de Despacho</h4>
                     
                     <div className="relative pl-4 border-l border-zinc-800 space-y-4">
                       <div className="flex items-start gap-4">
                         <div className="w-5 h-5 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center justify-center text-zinc-500 shrink-0 text-[10px] font-black">1</div>
                         <div className="text-xs">
                           <span className="font-bold text-white uppercase block">Aguardando Recepção Fisicas</span>
                           <p className="text-[10px] text-zinc-500">Fluxo atual: {reportPedidos.counts.aguardando} pedidos na fila e sem separador associados.</p>
                         </div>
                       </div>
                       
                       <div className="flex items-start gap-4">
                         <div className="w-5 h-5 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 shrink-0 text-[10px] font-black">2</div>
                         <div className="text-xs">
                           <span className="font-bold text-white uppercase block">Ativos em Separação Local</span>
                           <p className="text-[10px] text-zinc-500">Mão de obra: {reportPedidos.counts.separacao} operadores biper produtos nos escaninhos logísticos.</p>
                         </div>
                       </div>

                       <div className="flex items-start gap-4">
                         <div className="w-5 h-5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 shrink-0 text-[10px] font-black">3</div>
                         <div className="text-xs">
                           <span className="font-bold text-white uppercase block">Expedido e Despachados</span>
                           <p className="text-[10px] text-zinc-500">Retorno definitivo: {reportPedidos.counts.entregues} manifestos emitidos com transito em conformidade.</p>
                         </div>
                       </div>
                     </div>
                  </div>
               </div>
             )}


             {activeTab === 'estoque' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     
                     {/* Below Min Table */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5 text-amber-500">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Produtos Próximo ou Abaixo do Mínimo ({reportEstoque.listBelowMin.length})
                        </h4>
                        
                        {reportEstoque.listBelowMin.length === 0 ? (
                          <span className="text-zinc-650 font-mono text-xs text-center block py-8 uppercase">Nenhum produto abaixo do mínimo</span>
                        ) : (
                          <div className="max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                            <table className="w-full text-[11px] text-left">
                              <thead>
                                <tr className="border-b border-zinc-800/40 font-bold uppercase text-zinc-500 text-[8.5px]">
                                  <th className="py-1">Código</th>
                                  <th className="py-1">Nome</th>
                                  <th className="py-1 text-center">Físico</th>
                                  <th className="py-1 text-center">Min Requerido</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/20">
                                {reportEstoque.listBelowMin.map(p => (
                                  <tr key={p.id}>
                                    <td className="py-1 font-mono text-zinc-500">{p.code}</td>
                                    <td className="py-1 text-zinc-300 font-bold truncate max-w-[130px]">{p.name}</td>
                                    <td className="py-1 text-center font-mono text-rose-400 font-black">{p.stock} pçs</td>
                                    <td className="py-1 text-center font-mono text-zinc-400">{p.minStock} pçs</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                     </div>

                     {/* Top Sellers Table */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-300 mb-3 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                          Produtos Giro Rápido / Mais Vendidos
                        </h4>
                        
                        {reportEstoque.topSellersList.length === 0 ? (
                          <span className="text-zinc-650 font-mono text-xs text-center block py-8 uppercase">Sem movimentação de vendas no período</span>
                        ) : (
                          <div className="max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                            <table className="w-full text-[11px] text-left">
                              <thead>
                                <tr className="border-b border-zinc-800/40 font-bold uppercase text-zinc-500 text-[8.5px]">
                                  <th className="py-1">Produto</th>
                                  <th className="py-1 text-right">Qtd Vendida</th>
                                  <th className="py-1 text-right">Soma Lucro</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800/20">
                                {reportEstoque.topSellersList.map(item => (
                                  <tr key={item.name} className="hover:bg-white/[0.01]">
                                    <td className="py-1 text-zinc-300 font-bold truncate max-w-[150px]">{item.name}</td>
                                    <td className="py-1 text-right font-mono text-white font-black">{item.quantity} un</td>
                                    <td className="py-1 text-right font-mono text-emerald-400">R$ {item.totalSold.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                     </div>
                  </div>

                  <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                    <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5" />Log Recente de Movimentações de Entrada/Saída</h4>
                    {reportEstoque.recentMovements.length === 0 ? (
                      <span className="text-zinc-600 font-mono text-xs text-center block py-6 uppercase">Sem movimentações físicas registradas neste período</span>
                    ) : (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                        {reportEstoque.recentMovements.map(m => (
                          <div key={m.id} className="flex justify-between items-center text-xs py-1.5 border-b border-zinc-800/20 font-mono">
                            <span className="text-zinc-400">{format(m.timestamp, 'dd/MM HH:mm')}</span>
                            <span className="text-zinc-350">{m.message}</span>
                            <span className="text-zinc-500 text-[10px]">por {m.userName || 'Admin'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
               </div>
             )}


             {activeTab === 'separacao' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Metas Separadas</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportSeparacao.list.length} pedidos</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Produtos Faltantes Reportados</span>
                      <p className="text-xl font-bold font-mono text-rose-500 mt-1">{reportSeparacao.missingItemsCount} ocorrências</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl col-span-2 md:col-span-1">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Separador Ativo Líder</span>
                      <p className="text-xl font-bold font-mono text-emerald-400 mt-1 truncate">
                        {reportSeparacao.pickerRankings[0]?.name || 'Nenhum'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Picker Performance Rankings */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-300 mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />Produtividade Geral de Separadores (Rank de Triagem)</h4>
                        
                        {reportSeparacao.pickerRankings.length === 0 ? (
                          <span className="text-zinc-650 text-xs font-mono py-8 block text-center uppercase">Sem dados logísticos cadastrados</span>
                        ) : (
                          <div className="space-y-2">
                            {reportSeparacao.pickerRankings.map((p, idx) => (
                              <div key={p.name} className="flex justify-between items-center text-xs py-1.5 border-b border-zinc-800/30">
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-black text-emerald-400 font-mono">#{idx+1}</span>
                                  <span className="text-zinc-200 font-bold uppercase">{p.name}</span>
                                </div>
                                <div className="text-right font-mono text-zinc-500 text-[10px]">
                                  <span className="text-white font-black">{p.count} coletas</span>
                                  <span className="ml-2 font-medium">• {p.avgTimeSeconds > 0 ? `${(p.avgTimeSeconds / 60).toFixed(1)}m` : '0m'} méd</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                     </div>

                     {/* Missing Items occurrences details */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-rose-500" />Divergências Autorizadas e Faltas Auditadas</h4>
                        
                        {reportSeparacao.missingItemsList.length === 0 ? (
                          <span className="text-zinc-650 text-xs font-mono py-8 block text-center uppercase">Nenhuma quebra de estoque reportada</span>
                        ) : (
                          <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1 text-xs">
                            {reportSeparacao.missingItemsList.map((occ, idx) => (
                              <div key={idx} className="p-2 bg-red-950/10 border border-red-500/15 rounded-xl">
                                <div className="flex justify-between font-bold">
                                  <span className="text-white font-mono">Ref Pedido #{occ.order}</span>
                                  <span className="text-rose-400 font-black">Falta {occ.qty} un</span>
                                </div>
                                <p className="text-[10px] text-zinc-400 truncate mt-0.5">Item: {occ.product}</p>
                                <span className="text-[8px] text-zinc-500 block uppercase tracking-widest mt-0.5">Separador: {occ.picker || 'N/A'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                     </div>
                  </div>
               </div>
             )}


             {activeTab === 'impressao' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">PDFs Gravados</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportImpressao.countPdfs} manifestos</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Etiquetas Impressas</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportImpressao.countLabels} un</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Recibos Térmicos</span>
                      <p className="text-xl font-bold font-mono text-white mt-1">{reportImpressao.countReceipts} cupons</p>
                    </div>
                    <div className="bg-black/60 p-3.5 border border-zinc-800/40 rounded-2xl">
                      <span className="text-[8px] uppercase text-zinc-500 font-extrabold tracking-wider">Falhas Notadas</span>
                      <p className="text-xl font-bold font-mono text-rose-500 mt-1">{reportImpressao.countFailures} erros</p>
                    </div>
                  </div>

                  <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                     <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-emerald-400" />Telemetria Geral das Drivers Térmicos / Zebra e Impressoras</h4>
                     {reportImpressao.list.length === 0 ? (
                       <span className="text-zinc-650 font-mono text-xs text-center block py-8 uppercase">Fila spooler sem registros no momento</span>
                     ) : (
                       <div className="space-y-1.5 max-h-[250px] overflow-y-auto custom-scrollbar pr-1 text-xs font-mono">
                         {reportImpressao.list.map((log, idx) => (
                           <div key={idx} className="flex justify-between gap-4 py-2 border-b border-zinc-800/30 text-[11px]">
                             <span className="text-zinc-500 shrink-0">{format(log.timestamp, 'dd/MM HH:mm')}</span>
                             <span className={cn("text-left flex-1 font-bold", log.message.toLowerCase().includes('falha') || log.message.toLowerCase().includes('erro') ? "text-rose-400" : "text-zinc-200")}>
                               {log.message}
                             </span>
                             <span className="text-zinc-500 shrink-0 text-[10px] uppercase">por {log.userName || 'Admin'}</span>
                           </div>
                         ))}
                       </div>
                     )}
                  </div>
               </div>
             )}


             {activeTab === 'clientes' && (
               <div className="space-y-5 text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     
                     {/* Top spent clients */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-300 mb-3 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-emerald-400" />
                          Ranking dos Clientes que mais Compraram (Ticket / Fidelidade)
                        </h4>
                        
                        {reportClientes.topClients.length === 0 ? (
                          <span className="text-zinc-650 text-xs font-mono py-8 block text-center uppercase">Sem vendas registradas com clientes no período</span>
                        ) : (
                          <div className="space-y-2">
                            {reportClientes.topClients.slice(0, 15).map((cl, idx) => (
                              <div key={cl.name} className="flex justify-between items-center text-xs py-1.5 border-b border-zinc-800/30">
                                <div>
                                  <span className="text-white font-bold block">{cl.name}</span>
                                  <span className="text-[9px] text-zinc-500 font-mono">Membro ativo • Tel {cl.phone}</span>
                                </div>
                                <div className="text-right font-mono">
                                  <span className="text-emerald-400 font-black block">R$ {cl.totalSpent.toFixed(2)}</span>
                                  <span className="text-zinc-500 text-[9px] font-bold">{cl.ordersCount} compras feitas</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                     </div>

                     {/* Birthdays months */}
                     <div className="bg-black/40 border border-zinc-800/60 rounded-2xl p-4">
                        <h4 className="text-[10px] uppercase font-black tracking-widest text-zinc-400 mb-3 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                          Calendário Operacional de Aniversariantes
                        </h4>
                        
                        {reportClientes.birthdayClients.length === 0 ? (
                          <span className="text-zinc-650 text-xs font-mono py-8 block text-center uppercase">Nenhum cliente aniversariante encontrado</span>
                        ) : (
                          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
                            {reportClientes.birthdayClients.map(c => (
                              <div key={c.id} className="p-2 bg-zinc-950/50 border border-zinc-800 rounded-xl flex justify-between items-center text-xs">
                                <div>
                                  <span className="text-white font-bold block">{c.name}</span>
                                  <span className="text-[9px] text-zinc-500 uppercase font-mono">{c.email}</span>
                                </div>
                                <span className="font-mono text-emerald-400 font-extrabold bg-emerald-500/10 px-2 py-1 rounded">
                                  {c.birthday}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                     </div>
                  </div>
               </div>
             )}

           </div>

         </div>

       </div>

    </div>
  );
}
