import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Bell, 
  TrendingUp, 
  Clock, 
  CircleDollarSign, 
  Zap,
  Database,
  Wifi,
  Cpu,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';

// Consolidated child components
import Dashboard from './Dashboard';
import NotificationsModule from './NotificationsModule';
import OperationalPerformance from './OperationalPerformance';
import HistoryModule from './HistoryModule';
import CashierHistoryModule from './CashierHistoryModule';
import AutomationModule from './AutomationModule';
import NFCPresenceModule from './NFCPresenceModule';
import CentralAcesso from './CentralAcesso';

export default function CentralOperacional() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('aba') || 'visao-geral';

  // Environment host detection
  const detectedEnv = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('android')) return 'Android APK';
    if (ua.includes('electron') || ua.includes('tauri')) return 'Desktop Native';
    return 'Cloud Web Client';
  }, []);

  const tabs = [
    { id: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'central-acesso', label: 'Central de Acesso', icon: ShieldCheck },
    { id: 'ponto', label: 'Ponto NFC', icon: Clock },
    { id: 'alertas', label: 'Alertas', icon: Bell },
    { id: 'relatorios', label: 'Relatórios', icon: TrendingUp },
    { id: 'auditoria', label: 'Auditoria', icon: Clock },
    { id: 'caixa', label: 'Caixa', icon: CircleDollarSign },
    { id: 'automacoes', label: 'Automações', icon: Zap },
  ];

  const [openedTabs, setOpenedTabs] = useState<string[]>([activeTab]);

  useEffect(() => {
    setOpenedTabs(prev => {
      if (prev.includes(activeTab)) return prev;
      return [...prev, activeTab];
    });
  }, [activeTab]);

  const handleTabChange = (tabId: string) => {
    setSearchParams({ aba: tabId });
  };

  return (
    <div className="flex flex-col h-full bg-[#070707] text-zinc-100 select-none overflow-hidden">
      {/* 2. TAB NAVIGATION BAR (Compact / horizontally scrollable) */}
      <div className="w-full bg-[#0a0a0a] border-b border-white/5 px-4 md:px-6 py-2 shrink-0 overflow-x-auto scrollbar-hide flex items-center gap-1">
        <div className="flex items-center gap-1.5 w-full min-w-max">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isTabActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-[10.5px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 cursor-pointer touch-manipulation",
                  isTabActive
                    ? "bg-[#16c784]/15 text-[#16c784] border border-[#16c784]/25 shadow-[0_0_15px_rgba(22,199,132,0.05)] font-black"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-white/5 border border-transparent"
                )}
              >
                <IconComponent className={cn("w-3.5 h-3.5", isTabActive ? "text-[#16c784]" : "text-zinc-600")} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. CORE CONTENT WRAPPER */}
      <main className="flex-1 overflow-y-auto w-full custom-scrollbar relative">
        {tabs.map((tab) => {
          if (!openedTabs.includes(tab.id)) return null;
          const isActive = activeTab === tab.id;
          return (
            <div
              key={tab.id}
              className={cn("w-full h-full", isActive ? "block" : "hidden")}
              style={{ display: isActive ? 'block' : 'none' }}
            >
              {tab.id === 'visao-geral' && <Dashboard />}
              {tab.id === 'central-acesso' && <CentralAcesso />}
              {tab.id === 'ponto' && <NFCPresenceModule />}
              {tab.id === 'alertas' && <NotificationsModule />}
              {tab.id === 'relatorios' && <OperationalPerformance />}
              {tab.id === 'auditoria' && <HistoryModule />}
              {tab.id === 'caixa' && <CashierHistoryModule />}
              {tab.id === 'automacoes' && <AutomationModule />}
            </div>
          );
        })}
      </main>
    </div>
  );
}
