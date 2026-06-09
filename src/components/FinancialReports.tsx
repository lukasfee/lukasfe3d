import React, { useState, useMemo, useRef } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ShoppingCart, 
  ArrowUpRight, 
  ArrowDownLeft,
  ChevronDown,
  Filter,
  FileText
} from 'lucide-react';
import { useStore, FinancialTransaction, Sale } from '../store';
import { cn } from '../lib/utils';
import { roundMoney, safeAdd, safeSubtract, safeMultiply, safeDivide } from '../utils/money';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, subDays, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Period = 'diario' | 'semanal' | 'mensal' | 'personalizado';

export default function FinancialReports() {
  const financialTransactions = useStore(state => state.financialTransactions);
  const sales = useStore(state => state.sales);
  const products = useStore(state => state.products);
  
  const [period, setPeriod] = useState<Period>('mensal');
  const [customRange, setCustomRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const reportRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (period) {
      case 'diario':
        start = startOfDay(now);
        break;
      case 'semanal':
        start = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case 'mensal':
        start = startOfMonth(now);
        break;
      case 'personalizado':
        start = startOfDay(new Date(customRange.start));
        end = endOfDay(new Date(customRange.end));
        break;
      default:
        start = startOfMonth(now);
    }

    const interval = { start, end };

    const periodTransactions = financialTransactions.filter(t => 
      isWithinInterval(new Date(t.date), interval) && t.status !== 'cancelado'
    );

    const periodSales = sales.filter(s => 
      isWithinInterval(new Date(s.timestamp), interval) && s.status !== 'cancelado'
    );

    const totalSold = periodSales.reduce((acc, s) => safeAdd(acc, s.total), 0);
    const salesCount = periodSales.length;
    const avgTicket = salesCount > 0 ? safeDivide(totalSold, salesCount) : 0;

    const totalIn = periodTransactions
      .filter(t => t.type === 'entrada')
      .reduce((acc, t) => safeAdd(acc, t.value), 0);
    
    const totalOut = periodTransactions
      .filter(t => t.type === 'saida')
      .reduce((acc, t) => safeAdd(acc, t.value), 0);

    const expenses = totalOut;
    const profit = safeSubtract(totalSold, expenses);

    let totalCMV = 0;
    let productsSoldCount = 0;

    const productsMap = new Map<string, { name: string, quantity: number, total: number }>();
    periodSales.forEach(s => {
      s.items.forEach(item => {
        const qty = item.pickedQuantity !== undefined ? item.pickedQuantity : item.quantity;
        const unitCost = item.unitCostAtSale !== undefined ? item.unitCostAtSale : (products.find(p => p.id === item.id)?.costPrice ?? item.costPrice ?? 0);
        totalCMV = safeAdd(totalCMV, safeMultiply(unitCost, qty));
        productsSoldCount += qty;

        const existing = productsMap.get(item.id) || { name: item.name, quantity: 0, total: 0 };
        existing.quantity += qty;
        existing.total = safeAdd(existing.total, safeMultiply(item.price, qty));
        productsMap.set(item.id, existing);
      });
    });

    const grossProfit = safeSubtract(totalSold, totalCMV);

    const topProducts = Array.from(productsMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Optimized timeline data: group by date once
    const salesByDay = new Map<string, number>();
    periodSales.forEach(s => {
      const d = format(new Date(s.timestamp), 'dd/MM');
      salesByDay.set(d, (salesByDay.get(d) || 0) + s.total);
    });

    const inByDay = new Map<string, number>();
    const outByDay = new Map<string, number>();
    periodTransactions.forEach(t => {
      const d = format(new Date(t.date), 'dd/MM');
      if (t.type === 'entrada') inByDay.set(d, (inByDay.get(d) || 0) + t.value);
      else outByDay.set(d, (outByDay.get(d) || 0) + t.value);
    });

    const days = eachDayOfInterval(interval);
    const timelineData = days.map(day => {
      const d = format(day, 'dd/MM');
      const salesVal = salesByDay.get(d) || 0;
      const outVal = outByDay.get(d) || 0;
      return {
        date: d,
        vendas: salesVal,
        entradas: inByDay.get(d) || 0,
        saidas: outVal,
        lucro: salesVal - outVal
      };
    });

    const canceledSales = sales.filter(s => 
      isWithinInterval(new Date(s.timestamp), interval) && s.status === 'cancelado'
    );
    const canceledCount = canceledSales.reduce((acc, s) => acc + s.items.reduce((sum, item) => sum + item.quantity, 0), 0);

    // Total discounts
    const totalDiscounts = periodSales.reduce((acc, s) => safeAdd(acc, s.discount || 0), 0);

    return {
      totalSold,
      salesCount,
      avgTicket,
      totalIn,
      totalOut,
      expenses,
      profit: totalSold - expenses,
      topProducts,
      timelineData,
      canceledCount,
      totalDiscounts,
      grossValue: totalSold + totalDiscounts,
      netValue: totalSold,
      totalCMV,
      productsSoldCount,
      grossProfit,
      movements: periodTransactions.sort((a, b) => b.date - a.date)
    };
  }, [financialTransactions, sales, period, customRange, products]);

  const statsValues = [
    { label: 'Valor Bruto', value: stats.grossValue, icon: <DollarSign className="w-3 h-3" /> },
    { label: 'Valor Líquido', value: stats.netValue, icon: <ChevronDown className="w-3 h-3" /> },
    { label: 'Descontos', value: stats.totalDiscounts, icon: <Filter className="w-3 h-3 text-amber-500" /> },
    { label: 'Ticket Médio', value: stats.avgTicket, icon: <TrendingUp className="w-3 h-3 text-blue-500" /> },
    { label: 'CMV Real', value: stats.totalCMV, icon: <ShoppingCart className="w-3 h-3 text-purple-400" /> },
    { label: 'Lucro Bruto (DRE)', value: stats.grossProfit, icon: <TrendingUp className="w-3 h-3 text-emerald-400" /> },
  ];

  return (
    <div className="space-y-6">

      {/* Filters Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-[#121212] border border-white/5 p-4 rounded-[32px] no-print">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'diario', label: 'Diário' },
            { id: 'semanal', label: 'Semanal' },
            { id: 'mensal', label: 'Mensal' },
            { id: 'personalizado', label: 'Personalizado' }
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id as Period)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                period === p.id 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" 
                  : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'personalizado' && (
          <div className="flex items-center gap-2 bg-black/40 p-2 rounded-2xl border border-white/5">
            <input 
              type="date"
              value={customRange.start}
              onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
              className="bg-transparent border-none text-[11px] font-bold text-white outline-none"
            />
            <span className="text-white/20">até</span>
            <input 
              type="date"
              value={customRange.end}
              onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
              className="bg-transparent border-none text-[11px] font-bold text-white outline-none"
            />
          </div>
        )}

      </div>

      <div ref={reportRef} id="financial-report-content" className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card 
            title="Vendas" 
            value={stats.totalSold} 
            subtitle={`${stats.salesCount} vendas`}
            icon={<ShoppingCart className="w-5 h-5 text-blue-400" />}
            color="blue"
          />
          <Card 
            title="Lucro" 
            value={stats.profit} 
            subtitle="Estimado"
            icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
            color="emerald"
            isBalance
          />
          <Card 
            title="Gastos" 
            value={stats.expenses} 
            subtitle="Saídas totais"
            icon={<TrendingDown className="w-5 h-5 text-red-400" />}
            color="red"
          />
          <Card 
            title="Entradas" 
            value={stats.totalIn} 
            subtitle="Flow total"
            icon={<ArrowUpRight className="w-5 h-5 text-emerald-400" />}
            color="emerald"
          />
          <Card 
            title="Saídas" 
            value={stats.totalOut} 
            subtitle="Flow total"
            icon={<ArrowDownLeft className="w-5 h-5 text-red-400" />}
            color="red"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Main Chart */}
          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-3.5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Evolução de Vendas vs Gastos
            </h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.timelineData}>
                  <defs>
                    <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#ffffff20', fontSize: 10, fontWeight: 'bold' }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#ffffff20', fontSize: 10, fontWeight: 'bold' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                    itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                  />
                  <Area type="monotone" dataKey="vendas" stroke="#10b981" fillOpacity={1} fill="url(#colorVendas)" strokeWidth={3} />
                  <Area type="monotone" dataKey="saidas" stroke="#ef4444" fillOpacity={1} fill="url(#colorSaidas)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Secondary Charts */}
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-3 flex items-center gap-2">
                 <DollarSign className="w-4 h-4 text-blue-500" /> Lucratividade por Período
               </h3>
               <div className="h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.timelineData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                      <XAxis dataKey="date" hide />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                      />
                      <Bar dataKey="lucro" radius={[4, 4, 0, 0]}>
                        {stats.timelineData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.lucro >= 0 ? '#10b981' : '#ef4444'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>

            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                 {statsValues.map(stat => (
                   <MiniStat key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
                 ))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/5">
                 <MiniStat label="Produtos Vendidos" value={stats.productsSoldCount} prefix="" />
                 <MiniStat label="Produtos Cancelados" value={stats.canceledCount} prefix="" color="text-red-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
             <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                   <FileText className="w-4 h-4" /> Movimentações do Período
                </h3>
             </div>
             <div className="overflow-x-auto max-h-[180px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-black/20 text-white/20 uppercase tracking-widest text-[9px] font-black">
                      <th className="px-6 py-3 text-left">Data</th>
                      <th className="px-6 py-3 text-left">Descrição</th>
                      <th className="px-6 py-3 text-left">Categoria</th>
                      <th className="px-6 py-3 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stats.movements.slice(0, 5).map((m) => (
                      <tr key={m.id} className="hover:bg-white/[0.02]">
                        <td className="px-6 py-3 text-white/40">{format(m.date, 'dd/MM/yy HH:mm')}</td>
                        <td className="px-6 py-3 font-bold text-white">{m.description}</td>
                        <td className="px-6 py-3">
                          <span className="px-2 py-1 bg-white/5 rounded text-[9px] uppercase font-black">{m.category}</span>
                        </td>
                        <td className={cn(
                          "px-6 py-3 text-right font-mono font-black",
                          m.type === 'entrada' ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {m.type === 'entrada' ? '+' : '-'} R$ {m.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>

          <div className="bg-[#121212] border border-white/5 rounded-2xl p-4">
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-3.5 font-black uppercase">
               Top Produtos Vendidos
             </h3>
             <div className="space-y-4 max-h-[180px] overflow-y-auto custom-scrollbar">
                {stats.topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-[10px] font-black">
                      #{i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-[11px] font-bold text-white truncate max-w-[150px]">{p.name}</div>
                      <div className="text-[9px] font-black uppercase text-white/20">{p.quantity} unidades</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-mono font-black text-white">R$ {p.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  </div>
                ))}
                {stats.topProducts.length === 0 && (
                  <div className="py-10 text-center opacity-20">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Sem vendas no período</p>
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, subtitle, icon, color, isBalance = false }: any) {
  const colors: any = {
    blue: 'bg-blue-500/10 text-blue-500',
    emerald: 'bg-emerald-500/10 text-emerald-500',
    red: 'bg-red-500/10 text-red-500',
    amber: 'bg-amber-500/10 text-amber-500'
  };

  const textColors: any = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400'
  };

  return (
    <div className="bg-[#121212] border border-white/5 p-3.5 rounded-xl relative overflow-hidden group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20">{title}</span>
        <div className={cn("p-1.5 rounded-lg transition-all", colors[color])}>
          {icon}
        </div>
      </div>
      <div className="space-y-0.5">
        <h4 className={cn(
          "text-lg font-mono font-black tracking-tighter",
          isBalance && value < 0 ? "text-red-500" : "text-white"
        )}>
          R$ {value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </h4>
        <p className="text-[9px] font-black uppercase tracking-widest text-white/20">{subtitle}</p>
      </div>
      <div className={cn("absolute bottom-0 left-0 h-1 bg-current transition-all", textColors[color])} style={{ width: '20%' }} />
    </div>
  );
}

function MiniStat({ label, value, prefix = "R$ ", color = "text-white/60", icon }: any) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="block text-[8px] font-black uppercase text-white/20 tracking-widest">{label}</span>
      </div>
      <p className={cn("text-xs font-mono font-black", color)}>
        {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : value}
      </p>
    </div>
  );
}
