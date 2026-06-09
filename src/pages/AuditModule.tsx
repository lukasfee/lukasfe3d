import React from 'react';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Activity, 
  FileText, 
  Download, 
  Printer, 
  ChevronRight,
  Eye,
  CheckCircle2,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Flame,
  Layers,
  FileClock,
  Terminal,
  Smartphone,
  Monitor,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Box,
  KeyRound,
  FileSpreadsheet,
  Trash2,
  Lock
} from 'lucide-react';
import { useStore, AuditLog } from '../store';
import { isDesktop, getElectronBridge } from '../lib/environment';
import { format, isToday, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';

export default function AuditModule() {
  const auditLogs = useStore((state) => state.auditLogs);
  
  // States of Tabs and Desktop Data
  const [activeTab, setActiveTab] = React.useState<'audit' | 'print_errors' | 'pairing'>('audit');
  const [physicalPrintErrors, setPhysicalPrintErrors] = React.useState<any[]>([]);
  const [pairingAuditLogs, setPairingAuditLogs] = React.useState<any[]>([]);
  const [isDesktopActive, setIsDesktopActive] = React.useState(false);
  const [isLoadingDesktopData, setIsLoadingDesktopData] = React.useState(false);

  // Selections
  const [selectedLog, setSelectedLog] = React.useState<AuditLog | null>(null);
  const [selectedPrintError, setSelectedPrintError] = React.useState<any | null>(null);
  const [selectedPairingLog, setSelectedPairingLog] = React.useState<any | null>(null);
  
  // States
  const [searchTerm, setSearchTerm] = React.useState('');
  
  // Advanced filters
  const [moduleFilter, setModuleFilter] = React.useState('all');
  const [userFilter, setUserFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [riskFilter, setRiskFilter] = React.useState('all');
  const [dateFilter, setDateFilter] = React.useState('');
  const [isFiltersExpanded, setIsFiltersExpanded] = React.useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 15;

  const loadDesktopData = React.useCallback(async () => {
    const bridge = getElectronBridge();
    if (bridge) {
      setIsDesktopActive(true);
      setIsLoadingDesktopData(true);
      try {
        const [printErrors, pairingLogs] = await Promise.all([
          bridge.getPhysicalPrintErrors(),
          bridge.getPairingAuditLogs()
        ]);
        setPhysicalPrintErrors(printErrors || []);
        setPairingAuditLogs(pairingLogs || []);
      } catch (err) {
        console.error('[AuditModule] Failed to load Electron logs:', err);
      } finally {
        setIsLoadingDesktopData(false);
      }
    } else {
      setIsDesktopActive(false);
      setPhysicalPrintErrors([
        {
          id: 'err-1',
          timestamp: Date.now() - 5 * 60000,
          jobId: '1092',
          printerName: 'Zebra GK420t (Setor Embalagem 02)',
          paperSize: '100x150 mm (Térmica)',
          documentName: 'Etiqueta de Envio - Pedido #38192',
          errorMessage: 'Spooler indisponível ou impressora sem comunicação USB (Código 0x0022)',
          errorCode: 'ERR_PRINTER_OFFLINE'
        },
        {
          id: 'err-2',
          timestamp: Date.now() - 32 * 60000,
          jobId: '1088',
          printerName: 'Kiosk Termico Bematech MP-4200 TH',
          paperSize: '80mm Bobina',
          documentName: 'Cupom de Venda - Chave NFCE-3522',
          errorMessage: 'Fim de papel térmico detectado no sensor da guilhotina (Erro Físico 0x41)',
          errorCode: 'PAPER_OUT_SENSOR'
        },
        {
          id: 'err-3',
          timestamp: Date.now() - 140 * 60000,
          jobId: '1074',
          printerName: 'HP LaserJet M404dw - Recepção Faturamento',
          paperSize: 'A4 Folha Inteira',
          documentName: 'Danfe Simplificada - Lote #10382',
          errorMessage: 'Tracionador de papel atolado na bandeja superior de alimentação (Código 13.02.00)',
          errorCode: 'PAPER_JAM_INPUT'
        }
      ]);
      setPairingAuditLogs([
        {
          id: 'pair-1',
          timestamp: Date.now() - 2 * 60000,
          action: 'DISPOSITIVO_PAREADO',
          description: 'Coletor de Dados Sunmi L2Ks pareado via Autenticação Segura QR Code',
          details: { deviceId: 'SUNMI-L2K-FF02A', type: 'COLETOR_ANDROID_11' }
        },
        {
          id: 'pair-2',
          timestamp: Date.now() - 15 * 60000,
          action: 'PIN_CONFIRMADO',
          description: 'Celular de Separação (Motorola G82) ativado com PIN temporário de Expedição',
          details: { deviceId: 'MOTO_G82_PICK-14', type: 'APP_MOBILE_PWA' }
        },
        {
          id: 'pair-3',
          timestamp: Date.now() - 40 * 60000,
          action: 'CONEXÃO_RECUSADA',
          description: 'Tentativa de pareamento negada: Token do dispositivo expirado ou IP fora da sub-rede autorizada',
          details: { deviceId: 'DESAPARECIDO-IP-40', type: 'COLETOR_DESCONHECIDO' }
        },
        {
          id: 'pair-4',
          timestamp: Date.now() - 180 * 60000,
          action: 'DISPOSITIVO_REMOVIDO',
          description: 'Dispositivo Honeywell EDA51 desvinculado pela auditoria administrativa master',
          details: { deviceId: 'HW_EDA51_OPERADOR3', type: 'COLETOR_HONEYWELL' }
        }
      ]);
    }
  }, []);

  React.useEffect(() => {
    loadDesktopData();
  }, [loadDesktopData]);

  React.useEffect(() => {
    setSelectedLog(null);
    setSelectedPrintError(null);
    setSelectedPairingLog(null);
    setCurrentPage(1);
  }, [activeTab]);

  const handleClearPrintErrors = async () => {
    const bridge = getElectronBridge();
    if (bridge && window.confirm('Deseja realmente apagar TODOS os logs de erro de impressão física do terminal e seus arquivos de backup?')) {
      const res = await bridge.clearPhysicalPrintErrors();
      if (res.success) {
        setPhysicalPrintErrors([]);
        setSelectedPrintError(null);
      } else {
        alert('Erro ao apagar logs: ' + res.error);
      }
    }
  };

  const handleClearPairingLogs = async () => {
    const bridge = getElectronBridge();
    if (bridge && window.confirm('Deseja realmente apagar o histórico de pareamento e auditoria de dispositivos locais?')) {
      const res = await bridge.clearPairingAuditLogs();
      if (res.success) {
        setPairingAuditLogs([]);
        setSelectedPairingLog(null);
      }
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert('Nenhum dado disponível para exportar.');
      return;
    }
    
    // Get headers automatically from keys of the first item
    const headers = Object.keys(data[0]).filter(k => k !== 'raw' && k !== 'id');
    
    // Form CSV rows
    const csvRows = [
      headers.join(';'),
      ...data.map(row => 
        headers.map(fieldName => {
          const val = row[fieldName];
          const stringVal = val === null || val === undefined 
            ? '' 
            : typeof val === 'object' 
              ? JSON.stringify(val) 
              : String(val);
          // Escape quotes and semicolons
          const escaped = stringVal.replace(/"/g, '""').replace(/;/g, ',');
          return `"${escaped}"`;
        }).join(';')
      )
    ];
    
    const csvString = '\uFEFF' + csvRows.join('\r\n'); // BOM for Portuguese double-byte support
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert('Nenhum dado disponível para exportar.');
      return;
    }
    const cleanData = data.map(({ raw, id, ...rest }) => rest);
    const jsonString = JSON.stringify(cleanData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter lists
  const modules = React.useMemo(() => Array.from(new Set(auditLogs.map(log => log.module).filter(Boolean))), [auditLogs]);
  const usersList = React.useMemo(() => Array.from(new Set(auditLogs.map(log => log.userLogin).filter(Boolean))), [auditLogs]);

  // Statistics calculation
  const stats = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let loggedToday = 0;
    let criticalCount = 0;
    let stockMoves = 0;
    let adminAuths = 0;

    auditLogs.forEach(log => {
      // 1. Logs Today
      if (log.timestamp >= today.getTime()) {
        loggedToday++;
      }
      // 2. Critical Actions (High Risk / Alto Risco)
      if (log.riskLevel === 'alto' || log.status === 'bloqueado' || log.status === 'erro') {
        criticalCount++;
      }
      // 3. Stock Changes Moovs (Estoque or Separação)
      if (log.module === 'Estoque' || log.module === 'Separação') {
        stockMoves++;
      }
      // 4. Admin authorizations
      if (log.action === 'Autorização ADM/master usada' || log.description.toLowerCase().includes('autorização master') || log.description.toLowerCase().includes('mestre')) {
        adminAuths++;
      }
    });

    return {
      loggedToday,
      criticalCount,
      stockMoves,
      adminAuths,
      totalCount: auditLogs.length
    };
  }, [auditLogs]);

  // Handle filtrations
  const filteredLogs = React.useMemo(() => {
    return auditLogs.filter(log => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        log.description.toLowerCase().includes(term) ||
        (log.userLogin || '').toLowerCase().includes(term) ||
        (log.userMatricula || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.id || '').toLowerCase().includes(term) ||
        (log.entityId || '').toLowerCase().includes(term);

      const matchesModule = moduleFilter === 'all' || log.module === moduleFilter;
      const matchesUser = userFilter === 'all' || log.userLogin === userFilter;
      const matchesStatus = statusFilter === 'all' || log.status === statusFilter;
      const matchesRisk = riskFilter === 'all' || log.riskLevel === riskFilter;
      const matchesDate = !dateFilter || format(log.timestamp, 'yyyy-MM-dd') === dateFilter;

      return matchesSearch && matchesModule && matchesUser && matchesStatus && matchesRisk && matchesDate;
    });
  }, [auditLogs, searchTerm, moduleFilter, userFilter, statusFilter, riskFilter, dateFilter]);

  const filteredPrintErrors = React.useMemo(() => {
    return physicalPrintErrors.filter(err => {
      const term = searchTerm.toLowerCase();
      return (
        (err.documentName || '').toLowerCase().includes(term) ||
        (err.printerName || '').toLowerCase().includes(term) ||
        (err.jobId || '').toLowerCase().includes(term) ||
        (err.errorCode || '').toLowerCase().includes(term) ||
        (err.errorMessage || '').toLowerCase().includes(term) ||
        (err.raw || '').toLowerCase().includes(term)
      );
    });
  }, [physicalPrintErrors, searchTerm]);

  const filteredPairingLogs = React.useMemo(() => {
    return pairingAuditLogs.filter(log => {
      const term = searchTerm.toLowerCase();
      const detailsStr = log.details ? JSON.stringify(log.details).toLowerCase() : '';
      return (
        (log.action || '').toLowerCase().includes(term) ||
        (log.description || '').toLowerCase().includes(term) ||
        detailsStr.includes(term)
      );
    });
  }, [pairingAuditLogs, searchTerm]);

  const currentItemsLength = React.useMemo(() => {
    if (activeTab === 'print_errors') return filteredPrintErrors.length;
    if (activeTab === 'pairing') return filteredPairingLogs.length;
    return filteredLogs.length;
  }, [activeTab, filteredLogs.length, filteredPrintErrors.length, filteredPairingLogs.length]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, moduleFilter, userFilter, statusFilter, riskFilter, dateFilter]);

  // Paged
  const pagedLogs = React.useMemo(() => {
    return filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredLogs, currentPage]);

  const pagedPrintErrors = React.useMemo(() => {
    return filteredPrintErrors.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredPrintErrors, currentPage]);

  const pagedPairingLogs = React.useMemo(() => {
    return filteredPairingLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredPairingLogs, currentPage]);

  const totalPages = Math.ceil(currentItemsLength / itemsPerPage);

  const getStatusBadge = (status: AuditLog['status']) => {
    switch (status) {
      case 'sucesso': 
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/10">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Sucesso
          </span>
        );
      case 'bloqueado': 
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/10">
            <Lock className="w-2.5 h-2.5" />
            Bloqueado
          </span>
        );
      case 'erro': 
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/10">
            <AlertCircle className="w-2.5 h-2.5" />
            Erro
          </span>
        );
      default: return null;
    }
  };

  const getRiskLabel = (risk: AuditLog['riskLevel']) => {
    switch (risk) {
      case 'alto':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/20 uppercase tracking-widest">
            <Flame className="w-2.5 h-2.5 fill-rose-500/20" /> Alto Risco
          </span>
        );
      case 'médio':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/20 uppercase tracking-widest">
            <AlertTriangle className="w-2.5 h-2.5" /> Médio Risco
          </span>
        );
      case 'baixo':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 uppercase tracking-widest">
            <CheckCircle2 className="w-2.5 h-2.5" /> Baixo Risco
          </span>
        );
    }
  };

  const operationIcons: Record<string, React.ReactElement> = {
    create: <ArrowUpRight className="w-3.5 h-3.5" />,
    update: <RefreshCw className="w-3.5 h-3.5" />,
    delete: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
    cancel: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
    print: <Printer className="w-3.5 h-3.5" />,
    pdf: <FileSpreadsheet className="w-3.5 h-3.5" />,
    login: <User className="w-3.5 h-3.5" />,
  };

  const getActionTagType = (log: AuditLog) => {
    const actionLower = (log.action || '').toLowerCase();
    const typeLower = (log.actionType || '').toLowerCase();

    if (typeLower === 'delete' || typeLower === 'cancel' || actionLower.includes('cancel')) {
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    }
    if (typeLower === 'create' || actionLower.includes('criado') || actionLower.includes('cadastrado')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (typeLower === 'update' || actionLower.includes('alterado') || actionLower.includes('atualizado') || actionLower.includes('edição')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
    if (typeLower === 'print' || typeLower === 'pdf') {
      return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    }
    return 'bg-white/5 text-white/50 border-white/10';
  };

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 backdrop-blur-md border border-emerald-500/20 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
              Auditoria Completa do Sistema {isLoadingDesktopData && <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 inline" />}
            </h2>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-[0.2em] flex items-center gap-1">
              Rastreabilidade de Segurança WMS & Gestão Comercial
            </p>
          </div>
        </div>

        {/* Dynamic action/export tools panel */}
        <div className="flex flex-wrap gap-2 items-center justify-end">
          {activeTab === 'audit' && (
            <>
              <button
                onClick={() => exportToCSV(filteredLogs, 'auditoria-evento-erp')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
              <button
                onClick={() => exportToJSON(filteredLogs, 'auditoria-evento-erp')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-400 border border-white/5 hover:border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Exportar JSON
              </button>
            </>
          )}
          {activeTab === 'print_errors' && (
            <>
              <button
                onClick={() => exportToCSV(filteredPrintErrors, 'erros-impressao-desktop')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-purple-500/10 hover:text-purple-400 border border-white/5 hover:border-purple-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
              <button
                onClick={() => exportToJSON(filteredPrintErrors, 'erros-impressao-desktop')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-purple-500/10 hover:text-purple-400 border border-white/5 hover:border-purple-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Exportar JSON
              </button>
              <button
                onClick={handleClearPrintErrors}
                className="flex items-center gap-1.5 px-4 h-10 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar Logs
              </button>
            </>
          )}
          {activeTab === 'pairing' && (
            <>
              <button
                onClick={() => exportToCSV(filteredPairingLogs, 'auditoria-pareamento-central')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-blue-500/10 hover:text-blue-400 border border-white/5 hover:border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
              <button
                onClick={() => exportToJSON(filteredPairingLogs, 'auditoria-pareamento-central')}
                className="flex items-center gap-1.5 px-4 h-10 bg-white/5 hover:bg-blue-500/10 hover:text-blue-400 border border-white/5 hover:border-blue-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Exportar JSON
              </button>
              <button
                onClick={handleClearPairingLogs}
                className="flex items-center gap-1.5 px-4 h-10 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar Histórico
              </button>
            </>
          )}
        </div>
      </div>

      {/* STATISTICS CARDS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/[0.05] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Ações Hoje</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <FileClock className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white leading-none">{stats.loggedToday}</h3>
            <p className="text-[8px] text-white/30 font-bold uppercase mt-1">Eventos Ativos Hoje</p>
          </div>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/[0.05] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Nível Crítico</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Flame className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white leading-none">{stats.criticalCount}</h3>
            <p className="text-[8px] text-white/30 font-bold uppercase mt-1">Alto Risco Registrado</p>
          </div>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/[0.05] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Estoque & Separação</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Box className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white leading-none">{stats.stockMoves}</h3>
            <p className="text-[8px] text-white/30 font-bold uppercase mt-1">Movimentos WMS</p>
          </div>
        </div>

        <div className="bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col justify-between hover:bg-white/[0.05] transition-all">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Autorizações ADM</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white leading-none">{stats.adminAuths}</h3>
            <p className="text-[8px] text-white/30 font-bold uppercase mt-1">Supervisões Master</p>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-gradient-to-br from-emerald-500/10 to-blue-500/5 backdrop-blur-md border border-emerald-500/10 rounded-2xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[9px] font-black text-white/50 uppercase tracking-widest">Volume Total</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-black text-white leading-none">{stats.totalCount}</h3>
            <p className="text-[8px] text-white/40 font-bold uppercase mt-1">Transações na Base</p>
          </div>
        </div>

      </div>

      {/* TABS FOR AUDIT TYPES */}
      <div className="flex flex-col sm:flex-row border-b border-white/5 gap-2 pb-px bg-white/[0.01] p-1.5 rounded-2xl border border-white/5">
        <button
          onClick={() => setActiveTab('audit')}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
            activeTab === 'audit' 
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/10" 
              : "text-white/40 hover:text-white/80 hover:bg-white/5"
          )}
        >
          <ShieldCheck className="w-4 h-4" />
          Ações Gerais & Segurança ({auditLogs.length})
        </button>
        <button
          onClick={() => {
            setActiveTab('print_errors');
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
            activeTab === 'print_errors' 
              ? "bg-purple-500 text-white shadow-lg shadow-purple-500/10" 
              : "text-white/40 hover:text-white/80 hover:bg-white/5"
          )}
        >
          <Printer className="w-4 h-4" />
          Erros de Impressão Física ({physicalPrintErrors.length}){!isDesktopActive && <span className="text-[8px] opacity-60 ml-1 font-bold">(Simulação Web)</span>}
        </button>
        <button
          onClick={() => {
            setActiveTab('pairing');
          }}
          className={cn(
            "flex-1 flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
            activeTab === 'pairing' 
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/10" 
              : "text-white/40 hover:text-white/80 hover:bg-white/5"
          )}
        >
          <Smartphone className="w-4 h-4" />
          Auditoria de Pareamento ({pairingAuditLogs.length}){!isDesktopActive && <span className="text-[8px] opacity-60 ml-1 font-bold">(Simulação Web)</span>}
        </button>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4">
        
        <div className="flex flex-col lg:flex-row gap-3">
          
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              type="text"
              placeholder="Pesquisar por descrição, responsável, ID, ação ou ID da entidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-[10px] font-black text-white uppercase placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-all font-sans"
            />
          </div>

          <button 
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 hover:border-white/10 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
          >
            <Filter className={cn("w-3.5 h-3.5 transition-transform", isFiltersExpanded ? "rotate-180 text-emerald-400" : "text-white/40")} />
            {isFiltersExpanded ? 'Ocultar Filtros' : 'Filtros Avançados'}
          </button>

        </div>

        {/* EXPANDABLE ADVANCED FILTERS PANEL */}
        {isFiltersExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
            
            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Módulo do Sistema</label>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl h-11 px-3 text-[10px] font-black text-white uppercase focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">TODOS OS MÓDULOS</option>
                {modules.map(m => <option key={m} value={m} className="bg-neutral-900">{m.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Colaborador</label>
              <select
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl h-11 px-3 text-[10px] font-black text-white uppercase focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">TODOS OS USUÁRIOS</option>
                {usersList.map(u => <option key={u} value={u} className="bg-neutral-900">{u.toUpperCase()}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Nível de Risco</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl h-11 px-3 text-[10px] font-black text-white uppercase focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">TODOS OS RISCOS</option>
                <option value="alto" className="bg-neutral-900 text-rose-400">ALTO RISCO (CRÍTICO)</option>
                <option value="médio" className="bg-neutral-900 text-amber-400">MÉDIO RISCO</option>
                <option value="baixo" className="bg-neutral-900 text-emerald-400">BAIXO RISCO</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Status da Ação</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl h-11 px-3 text-[10px] font-black text-white uppercase focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
              >
                <option value="all" className="bg-neutral-900">TODOS OS STATUS</option>
                <option value="sucesso" className="bg-neutral-900 text-emerald-400">SUCESSO</option>
                <option value="bloqueado" className="bg-neutral-900 text-rose-400">BLOQUEADO</option>
                <option value="erro" className="bg-neutral-900 text-amber-400">ERRO</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Data de Registro</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-xl h-11 px-3 text-[10px] font-black text-white uppercase focus:outline-none focus:border-emerald-500/50 cursor-pointer"
              />
            </div>

          </div>
        )}
      </div>

      {/* MAIN TWO-COLUMN DASHBOARD LAYOUT */}
      <div className="flex flex-col lg:flex-row gap-6">
        
        {/* LOG LIST COLUMN */}
        <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden flex flex-col min-h-[600px] shadow-sm">
          
          {activeTab === 'audit' && (
            <div className="grid grid-cols-12 px-6 py-4 border-b border-white/5 bg-white/[0.02] text-[9px] font-black text-white/30 uppercase tracking-widest">
              <div className="col-span-2">Data / Hora</div>
              <div className="col-span-3">Usuário / ID</div>
              <div className="col-span-5">Módulo / Registros de Rastreio</div>
              <div className="col-span-2 text-right">Risco / Tipo</div>
            </div>
          )}

          {activeTab === 'print_errors' && (
            <div className="grid grid-cols-12 px-6 py-4 border-b border-white/5 bg-white/[0.02] text-[9px] font-black text-white/30 uppercase tracking-widest">
              <div className="col-span-2">Data / Hora</div>
              <div className="col-span-2">Código do Job</div>
              <div className="col-span-3">Impressora / Papel</div>
              <div className="col-span-5">Documento / Mensagem de Erro</div>
            </div>
          )}

          {activeTab === 'pairing' && (
            <div className="grid grid-cols-12 px-6 py-4 border-b border-white/5 bg-white/[0.02] text-[9px] font-black text-white/30 uppercase tracking-widest">
              <div className="col-span-2">Data / Hora</div>
              <div className="col-span-3">Ação / Evento</div>
              <div className="col-span-5">Descrição da Auditoria</div>
              <div className="col-span-2 text-right">ID do Aparelho</div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto max-h-[800px] custom-scrollbar divide-y divide-white/[0.03]">
            {activeTab === 'audit' && (
              pagedLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-28 p-12 opacity-30">
                  <FileText className="w-12 h-12 mb-4 text-white/20" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhum evento registrado com os critérios informados</p>
                </div>
              ) : (
                pagedLogs.map((log) => (
                  <div 
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={cn(
                      "grid grid-cols-12 px-6 py-3.5 items-center hover:bg-white/[0.03] transition-all cursor-pointer group relative",
                      selectedLog?.id === log.id && "bg-white/[0.04]"
                    )}
                  >
                    {/* Left accent bar by risk level */}
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1 transition-all",
                      log.riskLevel === 'alto' ? "bg-rose-500" : (log.riskLevel === 'médio' ? "bg-amber-500" : "bg-emerald-500")
                    )} />

                    <div className="col-span-2">
                      <span className="text-[10px] font-black text-white/90 leading-none block">{format(log.timestamp, 'HH:mm:ss')}</span>
                      <span className="text-[9px] text-white/30 font-bold uppercase block mt-1">{format(log.timestamp, 'dd MMM yyyy')}</span>
                    </div>

                    <div className="col-span-3 pr-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-[9px] font-black text-white uppercase border border-white/5">
                          {log.userLogin.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black text-white uppercase truncate max-w-[120px]">{log.userLogin}</span>
                          <span className="text-[8px] text-white/30 font-black uppercase tracking-widest truncate max-w-[120px]">{log.userRole}</span>
                        </div>
                      </div>
                    </div>

                    <div className="col-span-5 pr-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">{log.module}</span>
                        <span className="text-[8px] text-white/20 font-mono">#{log.id.substring(0, 5)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {log.status === 'sucesso' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        {log.status === 'bloqueado' && <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                        {log.status === 'erro' && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                        <span className="text-[10px] font-bold text-white/80 line-clamp-1 break-all">{log.description}</span>
                      </div>
                    </div>

                    <div className="col-span-2 text-right flex items-center justify-end gap-3.5 pl-2">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase border tracking-wider",
                          getActionTagType(log)
                        )}>
                          {log.action || log.actionType}
                        </span>
                        {log.riskLevel && getRiskLabel(log.riskLevel)}
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-emerald-500 group-hover:translate-x-1.5 transition-all" />
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'print_errors' && (
              pagedPrintErrors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-28 p-12 opacity-30">
                  <Printer className="w-12 h-12 mb-4 text-white/20" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma falha de spooler de impressão física registrada</p>
                </div>
              ) : (
                pagedPrintErrors.map((err) => (
                  <div 
                    key={err.id}
                    onClick={() => setSelectedPrintError(err)}
                    className={cn(
                      "grid grid-cols-12 px-6 py-3.5 items-center hover:bg-white/[0.03] transition-all cursor-pointer group relative",
                      selectedPrintError?.id === err.id && "bg-white/[0.04]"
                    )}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />
                    
                    <div className="col-span-2">
                      <span className="text-[10px] font-black text-white/90 leading-none block">{format(err.timestamp, 'HH:mm:ss')}</span>
                      <span className="text-[9px] text-white/30 font-bold uppercase block mt-1">{format(err.timestamp, 'dd MMM yyyy')}</span>
                    </div>

                    <div className="col-span-2 pr-2">
                      <span className="text-[10px] font-mono text-purple-400">JOB-{err.jobId || 'NONE'}</span>
                    </div>

                    <div className="col-span-3 pr-2">
                      <span className="text-[10px] font-black text-white truncate block uppercase">{err.printerName}</span>
                      <span className="text-[8px] text-white/30 font-black uppercase tracking-wider block mt-1">PAPEL: {err.paperSize}</span>
                    </div>

                    <div className="col-span-5 pr-2 flex items-center justify-between gap-2 overflow-hidden">
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold text-white/85 block truncate">{err.documentName}</span>
                        <div className="flex items-center gap-1.5 mt-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span className="text-[9px] font-bold text-rose-400 truncate block">{err.errorMessage}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-purple-500 group-hover:translate-x-1.5 transition-all shrink-0" />
                    </div>
                  </div>
                ))
              )
            )}

            {activeTab === 'pairing' && (
              pagedPairingLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-28 p-12 opacity-30">
                  <Smartphone className="w-12 h-12 mb-4 text-white/20" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Nenhuma atividade de pareamento registrada</p>
                </div>
              ) : (
                pagedPairingLogs.map((log) => (
                  <div 
                    key={log.id}
                    onClick={() => setSelectedPairingLog(log)}
                    className={cn(
                      "grid grid-cols-12 px-6 py-3.5 items-center hover:bg-white/[0.03] transition-all cursor-pointer group relative",
                      selectedPairingLog?.id === log.id && "bg-white/[0.04]"
                    )}
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />

                    <div className="col-span-2">
                      <span className="text-[10px] font-black text-white/90 leading-none block">{format(log.timestamp, 'HH:mm:ss')}</span>
                      <span className="text-[9px] text-white/30 font-bold uppercase block mt-1">{format(log.timestamp, 'dd MMM yyyy')}</span>
                    </div>

                    <div className="col-span-3 pr-2">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-blue-500/15 text-blue-400 border border-blue-500/10 uppercase tracking-widest">
                        {log.action}
                      </span>
                    </div>

                    <div className="col-span-5 pr-2">
                      <span className="text-[10px] font-bold text-white/80 leading-relaxed block truncate">{log.description}</span>
                    </div>

                    <div className="col-span-2 text-right flex items-center justify-end gap-3.5 pl-2">
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-[9px] font-mono text-white/40 block">ID: {log.details?.deviceId?.substring(0, 8) || 'SISTEMA'}</span>
                        <span className="text-[8px] text-white/25 font-bold uppercase mt-0.5 tracking-wider">{log.details?.type || 'WEB'}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-blue-500 group-hover:translate-x-1.5 transition-all shrink-0" />
                    </div>
                  </div>
                ))
              )
            )}
          </div>

          {/* TABLE PAGINATION PANEL */}
          {totalPages > 1 && (
            <div className="px-6 py-4.5 border-t border-white/5 flex items-center justify-between bg-white/[0.01]">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                Exibindo {currentPage} de {totalPages} Páginas
              </span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3.5 py-2 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-20 rounded-xl text-[9px] font-black text-white uppercase tracking-widest transition-all"
                >
                  Anterior
                </button>
                <div className="flex items-center gap-1 px-1.5">
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = currentPage - 2 + i;
                      if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                    }
                    if (pageNum <= 0) return null;
                    if (pageNum > totalPages) return null;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          "w-7.5 h-7.5 rounded-lg text-[9px] font-black transition-all",
                          currentPage === pageNum ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white/5 text-white/40 hover:bg-white/10"
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3.5 py-2 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-20 rounded-xl text-[9px] font-black text-white uppercase tracking-widest transition-all"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}

        </div>

        {/* LOG DETAILED PANEL */}
        {activeTab === 'audit' && selectedLog && (
          <div className="w-full lg:w-[450px] bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-6 space-y-6 flex flex-col h-fit sticky top-6 animate-in slide-in-from-right-4 duration-300 shadow-xl shadow-black/10">
            
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Rachas e Auditoria</h3>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors border border-transparent hover:border-white/5"
              >
                FECHAR
              </button>
            </div>

            <div className="space-y-4">
              
              {/* PRIMARY ACTION STATE HEADER */}
              <div className="p-4 bg-gradient-to-tr from-white/5 to-white/[0.01] border border-white/5 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Ação Auditada</span>
                  <span className="text-[8px] font-mono text-emerald-500">REF: {selectedLog.id}</span>
                </div>
                <h4 className="text-sm font-black text-white uppercase leading-snug">{selectedLog.action || selectedLog.actionType}</h4>
                <p className="text-xs font-bold text-white/70 leading-relaxed pt-1">{selectedLog.description}</p>
              </div>

              {/* TIMESTAMPS & DEVICES */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Data & Hora</span>
                  <p className="text-[10px] font-black text-white">{format(selectedLog.timestamp, 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Dispositivo / Interface</span>
                  <div className="flex items-center gap-1.5">
                    {selectedLog.device === 'Celular' ? <Smartphone className="w-3.5 h-3.5 text-blue-400" /> : <Monitor className="w-3.5 h-3.5 text-emerald-400" />}
                    <p className="text-[10px] font-black text-white">{selectedLog.device || 'Computador'}</p>
                  </div>
                </div>
              </div>

              {/* ACTION EXECUTION AUTHOR DETAILS */}
              <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Colaborador Executor</span>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">
                    <User className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-white uppercase">{selectedLog.userLogin}</p>
                    <p className="text-[9px] text-white/40 font-bold uppercase tracking-widest leading-relaxed">
                      {selectedLog.userRole} {selectedLog.userMatricula ? `| Matrícula: ${selectedLog.userMatricula}` : ''}
                    </p>
                  </div>
                </div>
                {selectedLog.userId && selectedLog.userId !== 'sistema' && (
                  <p className="text-[8px] text-white/15 font-mono pt-2 border-t border-white/5">DB_USER_ID: {selectedLog.userId}</p>
                )}
              </div>

              {/* SYSTEMS CONTEXT MODULES */}
              <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3.5">
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                  <span className="text-white/20">Módulo do Sistema</span>
                  <span className="text-white">{selectedLog.module}</span>
                </div>
                
                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest pt-2.5 border-t border-white/5">
                  <span className="text-white/20">Classificação de Risco</span>
                  {getRiskLabel(selectedLog.riskLevel)}
                </div>

                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest pt-2.5 border-t border-white/5">
                  <span className="text-white/20">Status Executivo</span>
                  {getStatusBadge(selectedLog.status)}
                </div>

                {selectedLog.method && (
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest pt-2.5 border-t border-white/5">
                    <span className="text-white/20">Método de Autenticação</span>
                    <span className="text-blue-400">{selectedLog.method}</span>
                  </div>
                )}
              </div>

              {/* VALUES BEFORE & AFTER COMPARISON STATE */}
              {(selectedLog.previousValue !== undefined || selectedLog.newValue !== undefined) && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3.5">
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-widest block">Valores de Transição Estado</span>
                  
                  <div className="grid grid-cols-1 gap-2.5">
                    {selectedLog.previousValue !== undefined && (
                      <div className="bg-black/20 p-2.5 rounded-lg border border-white/5 space-y-1">
                        <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest block">Estado Anterior</span>
                        <p className="text-[10.5px] font-mono text-white/80 break-all">{selectedLog.previousValue || 'N/A / Nulo'}</p>
                      </div>
                    )}
                    {selectedLog.newValue !== undefined && (
                      <div className="bg-emerald-500/5 p-2.5 rounded-lg border border-emerald-500/10 space-y-1">
                        <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block">Estado Atualizado</span>
                        <p className="text-[10.5px] font-mono text-white/95 break-all">{selectedLog.newValue || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AFFECTED SYSTEM ENTITIES DETAILS */}
              <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-3 leading-none text-[10px]">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block mb-1">Entidades do Sistema Afetadas</span>
                
                <div className="flex justify-between items-center uppercase py-1">
                  <span className="text-white/30 font-bold">Tipo da Entidade</span>
                  <span className="text-white font-black">{selectedLog.affectedEntity || 'Entidade Indireta'}</span>
                </div>
                
                {selectedLog.entityId && (
                  <div className="flex justify-between items-center uppercase py-1 pt-2.5 border-t border-white/5">
                    <span className="text-white/30 font-bold">ID da Entidade</span>
                    <span className="text-emerald-400 font-mono text-[9px] break-all max-w-[200px] truncate">{selectedLog.entityId}</span>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {activeTab === 'print_errors' && selectedPrintError && (
          <div className="w-full lg:w-[450px] bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-6 space-y-6 flex flex-col h-fit sticky top-6 animate-in slide-in-from-right-4 duration-300 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Diagnóstico de Impressora</h3>
              </div>
              <button 
                onClick={() => setSelectedPrintError(null)}
                className="px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors border border-transparent hover:border-white/5"
              >
                FECHAR
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-tr from-purple-500/10 to-transparent border border-purple-500/20 rounded-xl space-y-1">
                <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Falha Crítica de Spooler</span>
                <h4 className="text-sm font-black text-white uppercase leading-snug">{selectedPrintError.printerName}</h4>
                <p className="text-xs font-bold text-white/70 leading-relaxed pt-1">
                  O driver ou hardware físico retornou um código de erro durante a transmissão binária do arquivo PDF.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Data & Hora</span>
                  <p className="text-[10px] font-black text-white">{format(selectedPrintError.timestamp, 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Filial / Job ID</span>
                  <p className="text-[10px] font-mono font-black text-purple-400">JOB-{selectedPrintError.jobId || 'SISTEMA'}</p>
                </div>
              </div>

              <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Documento Solicitado</span>
                <p className="text-xs font-black text-white uppercase">{selectedPrintError.documentName}</p>
                <div className="flex items-center gap-4 text-[9px] text-white/40 font-bold uppercase tracking-wider pt-1">
                  <span>Papel: {selectedPrintError.paperSize}</span>
                  <span>Porta: USB / Rede RAW</span>
                </div>
              </div>

              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl space-y-2">
                <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest block">Código de Status & Retorno</span>
                <p className="text-[11px] font-mono font-bold text-white uppercase bg-black/25 p-2 rounded border border-white/5 break-all">
                  CÓDIGO: {selectedPrintError.errorCode}
                </p>
                <p className="text-[10px] font-medium text-rose-300 leading-relaxed pt-1">
                  RETORNO: {selectedPrintError.errorMessage}
                </p>
              </div>

              <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-2.5">
                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Instruções de Resolução</span>
                <ul className="text-[9.5px] font-bold text-white/60 space-y-1.5 list-disc pl-4 uppercase tracking-wide">
                  <li>Verifique se o cabo USB está conectado ou se a impressora possui IP na rede local.</li>
                  <li>Inspecione se o spooler do Windows está travado ou se o aplicativo SumatraPDF está instalado.</li>
                  <li>Tente limpar a fila física (painel de controle do Windows).</li>
                </ul>
              </div>

              <div className="bg-black/30 p-3 rounded-xl border border-white/5 text-[8.5px] font-mono text-white/30 truncate max-w-[400px]">
                TEXTO_BRUTO: {selectedPrintError.raw}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'pairing' && selectedPairingLog && (
          <div className="w-full lg:w-[450px] bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl p-6 space-y-6 flex flex-col h-fit sticky top-6 animate-in slide-in-from-right-4 duration-300 shadow-xl shadow-black/10">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Auditoria de Pareamento</h3>
              </div>
              <button 
                onClick={() => setSelectedPairingLog(null)}
                className="px-2.5 py-1.5 hover:bg-white/5 rounded-lg text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-colors border border-transparent hover:border-white/5"
              >
                FECHAR
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gradient-to-tr from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl space-y-1">
                <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Rastreamento de Comunicação</span>
                <h4 className="text-sm font-black text-white uppercase leading-snug">{selectedPairingLog.action}</h4>
                <p className="text-xs font-bold text-white/70 leading-relaxed pt-1">
                  {selectedPairingLog.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Data & Hora</span>
                  <p className="text-[10px] font-black text-white">{format(selectedPairingLog.timestamp, 'dd/MM/yyyy HH:mm:ss')}</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl space-y-1">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Canal / ID</span>
                  <p className="text-[10px] font-mono font-black text-blue-400">{selectedPairingLog.id}</p>
                </div>
              </div>

              {selectedPairingLog.details && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Metadados de Conectividade</span>
                  
                  <div className="space-y-2 text-[10px] font-bold text-white/60">
                    <div className="flex justify-between border-b border-white/[0.03] pb-2">
                      <span className="uppercase text-white/30">ID do Dispositivo:</span>
                      <span className="font-mono text-white break-all max-w-[200px] text-right">{selectedPairingLog.details.deviceId || 'Não informado'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/[0.03] pb-2 pt-1">
                      <span className="uppercase text-white/30">Nome Atribuído:</span>
                      <span className="text-white uppercase text-right">{selectedPairingLog.details.name || 'Dispositivo sem Nome'}</span>
                    </div>
                    <div className="flex justify-between border-b border-white/[0.03] pb-2 pt-1">
                      <span className="uppercase text-white/30">Tipo do Aparelho:</span>
                      <span className="text-white uppercase text-right">{selectedPairingLog.details.type || 'Web Client'}</span>
                    </div>
                    {selectedPairingLog.details.operator && (
                      <div className="flex justify-between pt-1">
                        <span className="uppercase text-white/30">Operador Vinculado:</span>
                        <span className="text-white uppercase text-right">{selectedPairingLog.details.operator}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fallback description when nothing is selected */}
        {((activeTab === 'audit' && !selectedLog) ||
          (activeTab === 'print_errors' && !selectedPrintError) ||
          (activeTab === 'pairing' && !selectedPairingLog)) && (
          <div className="hidden lg:flex flex-col items-center justify-center w-[450px] border border-dashed border-white/10 rounded-2xl p-12 text-center text-white/20 bg-white/[0.01]">
            <ShieldCheck className="w-10 h-10 mb-4 stroke-1 animate-pulse text-white/10" />
            <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed">
              {activeTab === 'audit' && 'Selecione um evento da trilha ao lado para detalhar sua rastreabilidade e dados de impacto'}
              {activeTab === 'print_errors' && 'Selecione uma falha de impressão física da lista ao lado para inspecionar comandos e diagnósticos de envio'}
              {activeTab === 'pairing' && 'Selecione um registro de pareamento para visualizar metadados de rede, tokens e identificadores únicos'}
            </p>
          </div>
        )}

      </div>

      {/* HIDDEN PRINT BUFFER SECTION */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div id="audit-print-buffer" className="bg-white text-black p-8 w-[210mm] font-sans">
          
          <div className="text-center mb-6 border-b-2 border-black pb-4">
            <h1 className="text-2xl font-black uppercase tracking-widest">Relatório Analítico de Auditoria</h1>
            <p className="text-[10px] uppercase font-black tracking-widest text-black/50 mt-1">Lukasfe CORE Security Framework</p>
            
            <div className="flex justify-between items-center mt-6 text-[9px] font-black uppercase tracking-wider text-black/70">
              <span>Emissão: {format(new Date(), 'dd/MM/yyyy HH:mm:ss')}</span>
              <span>Registros Listados: {filteredLogs.length}</span>
              <span>Dispositivo: Computador / Servidor</span>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-black text-[9px] font-black uppercase tracking-widest text-left">
                <th className="py-2.5 pr-2">Data/Hora</th>
                <th className="py-2.5 pr-2">Origem/ID</th>
                <th className="py-2.5 pr-2">Responsável</th>
                <th className="py-2.5 pr-2">Módulo/Entidade</th>
                <th className="py-2.5 pr-2">Nível</th>
                <th className="py-2.5">Descrição detalhada do Log</th>
              </tr>
            </thead>
            <tbody className="text-[8.5px]">
              {filteredLogs.map(log => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="py-2.5 valign-top whitespace-nowrap">
                    <span className="font-bold">{format(log.timestamp, 'dd/MM/yyyy')}</span><br />
                    <span>{format(log.timestamp, 'HH:mm:ss')}</span>
                  </td>
                  <td className="py-2.5 valign-top font-mono text-gray-500 uppercase">
                    #{log.id.substring(0, 6)}
                  </td>
                  <td className="py-2.5 valign-top">
                    <span className="font-bold uppercase">{log.userLogin}</span><br />
                    <span className="text-gray-400 uppercase tracking-widest text-[7px]">{log.userRole}</span>
                  </td>
                  <td className="py-2.5 valign-top">
                    <span className="font-bold uppercase">{log.module}</span><br />
                    <span className="text-gray-400 uppercase max-w-[100px] block truncate">{log.affectedEntity || 'Entidade'}</span>
                  </td>
                  <td className="py-2.5 valign-top uppercase font-bold text-center">
                    <span className={cn(
                      log.riskLevel === 'alto' && "text-red-600",
                      log.riskLevel === 'médio' && "text-amber-600",
                      log.riskLevel === 'baixo' && "text-emerald-600"
                    )}>
                      {log.riskLevel || 'baixo'}
                    </span>
                  </td>
                  <td className="py-2.5 valign-top leading-relaxed text-gray-700">
                    <span className="font-bold block text-black">{log.action || log.actionType}</span>
                    <span>{log.description}</span>
                    {log.previousValue && (
                      <span className="block mt-1 font-mono text-[7.5px] bg-gray-50 p-1 border border-gray-100 rounded text-black">
                        DE: {log.previousValue} | PARA: {log.newValue}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      </div>

    </div>
  );
}
