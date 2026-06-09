import React, { useState, useMemo, FormEvent } from 'react';
import { useStore, User, NFCTag, TerminalOperacional, MasterAuthorization, AuditLog } from '../store';
import { environmentService } from '../services/environmentService';
import { 
  ShieldCheck, 
  KeyRound, 
  QrCode, 
  Wifi, 
  UserCheck, 
  History, 
  Monitor, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  Search, 
  Lock, 
  Unlock,
  Settings, 
  Activity, 
  Filter, 
  Smartphone, 
  Slash,
  RefreshCw,
  Clock,
  UserX,
  PlusCircle,
  Eye,
  LockKeyhole,
  Layers,
  XCircle,
  FileSpreadsheet
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { generateUUID } from '../utils/uuid';

export default function CentralAcesso() {
  const users = useStore(state => state.users);
  const nfcTags = useStore(state => state.nfcTags);
  const auditLogs = useStore(state => state.auditLogs);
  const terminals = useStore(state => state.terminals);
  const activeTerminalId = useStore(state => state.activeTerminalId);
  const masterAuthorizations = useStore(state => state.masterAuthorizations);
  const currentUser = useStore(state => state.currentUser);
  const addTerminal = useStore(state => state.addTerminal);
  const updateTerminal = useStore(state => state.updateTerminal);
  const deleteTerminal = useStore(state => state.deleteTerminal);
  const setActiveTerminalId = useStore(state => state.setActiveTerminalId);
  const validateTerminalAccess = useStore(state => state.validateTerminalAccess);
  const handleTerminalNfcLogin = useStore(state => state.handleTerminalNfcLogin);

  // Tab State
  const [activeTab, setActiveTab] = useState<'operadores' | 'nfc' | 'qr' | 'master' | 'admin' | 'bloqueados' | 'terminais' | 'sessions' | 'auditoria'>('terminais');

  // Interactive Simulator States
  const [simTerminalId, setSimTerminalId] = useState(activeTerminalId || 'term-pdv-1');
  const [simNfcUid, setSimNfcUid] = useState('');
  const [simFeedback, setSimFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search/Filters states
  const [searchQuery, setSearchQuery] = useState('');
  const [auditFilterStatus, setAuditFilterStatus] = useState<string>('TODOS');
  const [auditFilterDevice, setAuditFilterDevice] = useState<string>('TODOS');

  // Add Terminal Form
  const [showAddTerminalModal, setShowAddTerminalModal] = useState(false);
  const [newTerminalName, setNewTerminalName] = useState('');
  const [newTerminalType, setNewTerminalType] = useState<TerminalOperacional['tipoTerminal']>('PDV');
  const [newTerminalSector, setNewTerminalSector] = useState('');
  const [newTerminalDevice, setNewTerminalDevice] = useState('');
  const [newTerminalRoles, setNewTerminalRoles] = useState<string[]>([]);
  const roleOptions = ['CAIXA', 'SEPARADOR', 'ESTOQUE', 'EXPEDICAO', 'GERENTE', 'ADMINISTRADOR', 'OPERADOR'];

  // Add NFC Form
  const [showAddNfcModal, setShowAddNfcModal] = useState(false);
  const [newNfcUid, setNewNfcUid] = useState('');
  const [newNfcLabel, setNewNfcLabel] = useState('');
  const [newNfcType, setNewNfcType] = useState<'OPERADOR' | 'MASTER' | 'ADM'>('OPERADOR');
  const [newNfcDurationDays, setNewNfcDurationDays] = useState(365);

  // Selected details modal
  const [selectedUserQR, setSelectedUserQR] = useState<User | null>(null);

  // Master Authorization Form
  const [showAddMasterModal, setShowAddMasterModal] = useState(false);
  const [selectedMasterUserId, setSelectedMasterUserId] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [newMasterObs, setNewMasterObs] = useState('');

  // ────────────────────────────────────────────────────────────────────────
  // HARDWARE NFC SIMULATION CORE
  // ────────────────────────────────────────────────────────────────────────
  const triggerNfcSimulation = () => {
    if (!(environmentService.isDevMode() || environmentService.isTestEnvironment())) {
      setSimFeedback({ type: 'error', message: 'Leitura simulada de hardware bloqueada fora do ambiente de desenvolvimento.' });
      return;
    }

    if (!simTerminalId) {
      setSimFeedback({ type: 'error', message: 'Selecione um terminal operacional para o teste.' });
      return;
    }
    if (!simNfcUid) {
      setSimFeedback({ type: 'error', message: 'Selecione ou insira uma Tag NFC para simular.' });
      return;
    }

    const res = handleTerminalNfcLogin(simTerminalId, simNfcUid);
    if (res.success && res.user) {
      setSimFeedback({
        type: 'success',
        message: `Acesso LIBERADO para ${res.user.fullName} (${res.user.roleId}) no terminal selecionado!`
      });
      // Optionally link store active user for full immersive auto-login
      if (useStore.getState().loginWithNFC) {
        useStore.getState().loginWithNFC(simNfcUid);
      }
    } else {
      setSimFeedback({
        type: 'error',
        message: res.error || 'Erro na autenticação da tag no terminal.'
      });
    }

    setTimeout(() => {
      setSimFeedback(null);
    }, 6000);
  };

  // ────────────────────────────────────────────────────────────────────────
  // FORM HANDLERS
  // ────────────────────────────────────────────────────────────────────────
  const handleCreateTerminal = (e: FormEvent) => {
    e.preventDefault();
    if (!newTerminalName || !newTerminalSector) return;
    
    addTerminal({
      nomeTerminal: newTerminalName,
      tipoTerminal: newTerminalType,
      setor: newTerminalSector,
      permissoesAceitas: newTerminalRoles.length > 0 ? newTerminalRoles : ['OPERADOR'],
      dispositivo: newTerminalDevice || 'Desktop Genérico',
      modoBloqueado: false
    });

    // Reset Form
    setNewTerminalName('');
    setNewTerminalType('PDV');
    setNewTerminalSector('');
    setNewTerminalDevice('');
    setNewTerminalRoles([]);
    setShowAddTerminalModal(false);
  };

  const handleCreateNfcTag = async (e: FormEvent) => {
    e.preventDefault();
    if (!newNfcUid.trim()) return;

    const expDate = Date.now() + newNfcDurationDays * 24 * 60 * 60 * 1000;
    const res = await useStore.getState().addNFCTag(newNfcUid.trim(), newNfcLabel.trim(), expDate);

    if (res.success) {
      // Find fresh tag and update tipoCredencial
      const freshTags = useStore.getState().nfcTags || [];
      const created = freshTags.find(t => t.uid.toUpperCase() === newNfcUid.trim().toUpperCase());
      if (created) {
        await useStore.getState().updateNFCTag(created.id, { tipoCredencial: newNfcType });
      }
      setNewNfcUid('');
      setNewNfcLabel('');
      setNewNfcType('OPERADOR');
      setShowAddNfcModal(false);
    } else {
      alert(res.error || 'Erro ao registrar tag NFC.');
    }
  };

  const handleCreateMasterAuth = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedMasterUserId || !newMasterPassword) return;

    // Direct store state manipulation as standard flow
    const existing = masterAuthorizations.some(m => m.userId === selectedMasterUserId);
    if (existing) {
      alert('Este colaborador já possui uma Credencial Master configurada!');
      return;
    }

    const newAuth: MasterAuthorization = {
      id: generateUUID('mst'),
      userId: selectedMasterUserId,
      passwordMaster: newMasterPassword,
      status: 'ativo',
      createdAt: Date.now(),
      lastUsedAt: null,
      observation: newMasterObs
    };

    useStore.setState((state) => ({
      masterAuthorizations: [...(state.masterAuthorizations || []), newAuth]
    }));

    useStore.getState().logAction({
      module: 'Central de Acesso',
      actionType: 'create',
      action: 'Criação de Credencial Master',
      description: `Credencial Master atribuída ao usuário ID ${selectedMasterUserId}`,
      status: 'sucesso'
    });

    setSelectedMasterUserId('');
    setNewMasterPassword('');
    setNewMasterObs('');
    setShowAddMasterModal(false);
  };

  // ────────────────────────────────────────────────────────────────────────
  // FILTERED DATA SELECTIONS
  // ────────────────────────────────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch = u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.login.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (u.roleId || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [users, searchQuery]);

  const filteredNfcTags = useMemo(() => {
    return nfcTags.filter(t => {
      if (t.status === 'Excluido') return false;
      const label = t.tagLabel || '';
      const matchSearch = t.uid.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          label.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [nfcTags, searchQuery]);

  const filteredAccessLogs = useMemo(() => {
    let logs = auditLogs.filter(log => 
      ['Acesso', 'Controle de Terminais', 'Segmentação', 'Segurança', 'Autenticação', 'Portaria', 'Presença / Ponto'].includes(log.module) || 
      log.actionType === 'login' || 
      log.action?.includes('Ponto') ||
      log.action?.includes('Acesso')
    );

    if (searchQuery) {
      logs = logs.filter(l => 
        (l.userLogin || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (auditFilterStatus !== 'TODOS') {
      logs = logs.filter(l => l.status === auditFilterStatus.toLowerCase());
    }

    if (auditFilterDevice !== 'TODOS') {
      logs = logs.filter(l => l.device === auditFilterDevice || l.referenceId === auditFilterDevice);
    }

    return logs;
  }, [auditLogs, searchQuery, auditFilterStatus, auditFilterDevice]);

  // Status Metrics Cards calculation
  const metrics = useMemo(() => {
    return {
      activeTerminals: terminals.filter(t => t.status === 'Online').length,
      blockedTerminals: terminals.filter(t => t.status === 'Bloqueado' || t.modoBloqueado).length,
      totalNfcTags: nfcTags.filter(t => t.status !== 'Excluido').length,
      linkedNfcTags: nfcTags.filter(t => t.status === 'Vinculado').length,
      blockedNfcTags: nfcTags.filter(t => t.status === 'Bloqueado' || t.status === 'Perdido').length,
      quarantinedTags: nfcTags.filter(t => t.status === 'Quarentena').length,
      totalMasterKeys: masterAuthorizations.filter(m => m.status === 'ativo').length,
      activeSessionsCount: terminals.filter(t => t.operadorAtualId !== null).length,
      failedAttempts: auditLogs.filter(l => l.status === 'bloqueado' || l.status === 'erro').length
    };
  }, [terminals, nfcTags, masterAuthorizations, auditLogs]);

  return (
    <div className="p-4 md:p-6 space-y-6 bg-[#040404] min-h-screen text-zinc-150">
      
      {/* ────────────────────────────────────────────────────────────────────────
          WIDGET EXCLUSIVO: LEITOR / SIMULADOR ULTRA PREMIUM NFC 
          ──────────────────────────────────────────────────────────────────────── */}
      {(environmentService.isDevMode() || environmentService.isTestEnvironment()) && (
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-950/20 via-zinc-950/80 to-purple-950/20 border border-indigo-500/10 rounded-3xl p-5 shadow-2xl">
        <div className="absolute inset-0 bg-indigo-500/[0.01] pointer-events-none" />
        
        <div className="flex flex-col xl:flex-row gap-5 items-start xl:items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-450 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest leading-none">NFC Hardware Bridge Active</h3>
            </div>
            <h2 className="text-[17px] font-black text-white uppercase tracking-wider">
              Simulador Integrado de Leitura de Tag
            </h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wide leading-none">
              Aproxime tags a terminais específicos para disparar login e testar regras de escopo operacional
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {/* Terminal Dropdown Selector */}
            <div className="flex items-center gap-2 bg-[#090909] border border-zinc-900 px-3 py-1.5 rounded-xl flex-1 md:flex-none">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
              <div className="text-left font-sans">
                <span className="block text-[6px] font-black text-indigo-500 uppercase tracking-widest">ALVO</span>
                <select 
                  value={simTerminalId}
                  onChange={(e) => setSimTerminalId(e.target.value)}
                  className="bg-transparent border-none text-[10.5px] font-bold text-white uppercase tracking-wider focus:outline-none focus:ring-0 cursor-pointer w-44"
                >
                  {terminals.map(t => (
                    <option key={t.idTerminal} value={t.idTerminal} className="bg-[#101010] text-zinc-300">
                      {t.nomeTerminal} ({t.tipoTerminal})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tag Selection Dropdown Selector */}
            <div className="flex items-center gap-2 bg-[#090909] border border-zinc-900 px-3 py-1.5 rounded-xl flex-1 md:flex-none">
              <Wifi className="w-3.5 h-3.5 text-cyan-400" />
              <div className="text-left font-sans">
                <span className="block text-[6px] font-black text-cyan-500 uppercase tracking-widest">TAG NFC DISPONÍVEL</span>
                <select 
                  value={simNfcUid}
                  onChange={(e) => setSimNfcUid(e.target.value)}
                  className="bg-transparent border-none text-[10.5px] font-bold text-white focus:outline-none focus:ring-0 cursor-pointer w-44 font-mono"
                >
                  <option value="" className="bg-[#101010] text-[#71717a]">-- ESCANEIE / SELECIONE --</option>
                  {nfcTags.filter(t => t.status === 'Vinculado' && t.usuarioVinculado).map(tag => {
                    const mappedUser = users.find(u => u.id === tag.usuarioVinculado);
                    return (
                      <option key={tag.id} value={tag.uid} className="bg-[#101010] text-zinc-200">
                        {tag.uid} - {mappedUser?.fullName || 'Vago'} ({mappedUser?.roleId || 'Nenhum'})
                      </option>
                    );
                  })}
                  {nfcTags.filter(t => t.status === 'Livre').map(tag => (
                    <option key={tag.id} value={tag.uid} className="bg-[#101010] text-amber-500">
                      {tag.uid} - [LIVRE/NÃO VINCULADO]
                    </option>
                  ))}
                  {nfcTags.filter(t => t.status === 'Bloqueado' || t.status === 'Perdido' || t.status === 'Quarentena').map(tag => (
                    <option key={tag.id} value={tag.uid} className="bg-[#101010] text-rose-500">
                      {tag.uid} - [{tag.status.toUpperCase()}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Trigger Button with simulation pulse */}
            <button
               onClick={triggerNfcSimulation}
               className="bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[11px] uppercase tracking-wider py-2.5 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all select-none w-full md:w-auto text-center justify-center shrink-0 shadow-lg shadow-indigo-950/30"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Disparar Leitura
            </button>
          </div>
        </div>

        {/* Real-time Simulator Output Message Banner */}
        <AnimatePresence mode="wait">
          {simFeedback && (
            <motion.div 
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className={`p-3.5 rounded-xl text-xs flex items-center justify-between shadow-md border ${
                simFeedback.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {simFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-450 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-450 shrink-0" />
                )}
                <span className="font-extrabold uppercase tracking-wide">{simFeedback.message}</span>
              </div>
              <button 
                onClick={() => setSimFeedback(null)}
                className="text-[9px] uppercase font-black hover:underline cursor-pointer opacity-80"
              >
                Fechar
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────
          COSMETIC PREMIUM SAAS SECURITY METRICS SUMMARY CARDS
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Terminals widget */}
        <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest block leading-none">TERMINAIS OPERACIONAIS</span>
            <Monitor className="w-3.5 h-3.5 text-zinc-650" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-black text-white font-mono leading-none block">{terminals.length}</span>
            <span className="text-[7.5px] uppercase font-semibold text-emerald-400 tracking-wider font-mono block mt-0.5">
              ● {metrics.activeTerminals} Online / {metrics.blockedTerminals} Bloqueados
            </span>
          </div>
        </div>

        {/* NFC Tags details widget */}
        <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest block leading-none">TAGS INTELEGENTES NFC</span>
            <Wifi className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-black text-white font-mono leading-none block">{metrics.totalNfcTags}</span>
            <span className="text-[7.5px] uppercase font-semibold text-zinc-400 tracking-wider font-mono block mt-0.5">
              {metrics.linkedNfcTags} Ativas / {metrics.quarantinedTags} Quarentena
            </span>
          </div>
        </div>

        {/* Live sessions widget */}
        <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest block leading-none">SESSÕES ATIVAS</span>
            <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-black text-white font-mono leading-none block">{metrics.activeSessionsCount}</span>
            <span className="text-[7.5px] uppercase font-semibold text-emerald-400 tracking-wider block mt-0.5 animate-pulse">
              Operadores Logados
            </span>
          </div>
        </div>

        {/* Lost/Quarantined bad widgets */}
        <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest block leading-none">BLOQUEIOS / DESVIOS</span>
            <Lock className="w-3.5 h-3.5 text-rose-500 animate-bounce" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-black text-rose-500 font-mono leading-none block">
              {metrics.blockedNfcTags + metrics.quarantinedTags}
            </span>
            <span className="text-[7.5px] uppercase font-semibold text-rose-455 tracking-wider font-mono block mt-0.5">
              Tags Inativas e Alertas
            </span>
          </div>
        </div>

        {/* failed logins metrics widgets */}
        <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-4 flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[8.5px] font-black text-zinc-500 uppercase tracking-widest block leading-none">ALERTAS FLUXOS NEGADOS</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="mt-2.5">
            <span className="text-xl font-black text-amber-500 font-mono leading-none block">{metrics.failedAttempts}</span>
            <span className="text-[7.5px] uppercase font-semibold text-zinc-500 tracking-wider block mt-0.5">
              Auditorias com Status Bloqueado
            </span>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          MAIN ACCESS CONTROL CENTER TABS + SEARCH ROW
          ──────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 border-b border-zinc-900 pb-3">
        {/* Dynamic Nav Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button 
            onClick={() => { setActiveTab('terminais'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'terminais' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            Terminais
          </button>
          
          <button 
            onClick={() => { setActiveTab('nfc'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'nfc' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            NFC Tags
          </button>

          <button 
            onClick={() => { setActiveTab('qr'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'qr' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            QR Tokens
          </button>

          <button 
            onClick={() => { setActiveTab('master'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'master' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            Master (Supervisores)
          </button>

          <button 
            onClick={() => { setActiveTab('admin'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'admin' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Administrador
          </button>

          <button 
            onClick={() => { setActiveTab('operadores'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'operadores' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Operadores
          </button>

          <button 
            onClick={() => { setActiveTab('sessions'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'sessions' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            Sessões
          </button>

          <button 
            onClick={() => { setActiveTab('bloqueados'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'bloqueados' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <UserX className="w-3.5 h-3.5 text-rose-455" />
            Bloqueados
          </button>

          <button 
            onClick={() => { setActiveTab('auditoria'); setSearchQuery(''); }}
            className={`py-1.5 px-3 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'auditoria' ? 'bg-indigo-600 text-white shadow-md' : 'bg-zinc-950 text-zinc-400 border border-zinc-900 hover:bg-zinc-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Auditoria
          </button>
        </div>

        {/* Global/Interactive Search Field */}
        <div className="flex items-center gap-2 bg-[#090909] border border-zinc-900 px-3 py-1.5 rounded-xl w-full lg:w-72">
          <Search className="w-4 h-4 text-zinc-650 shrink-0" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Pesquisar..."
            className="bg-transparent border-none text-xs text-zinc-300 placeholder-zinc-550 w-full focus:outline-none focus:ring-0"
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          TAB CONFIGURABLE CONTENTS
          ──────────────────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="bg-[#0a0a0a] border border-zinc-900 rounded-3xl p-5 shadow-2xl relative"
        >
          
          {/* ──────────────────────────────────────────
              TAB 1: TERMINAIS OPERACIONAIS 
              ────────────────────────────────────────── */}
          {activeTab === 'terminais' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-indigo-400" /> Gerenciamento de Terminais Operacionais
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    Defina limites de acesso, setores e consulte quais perfis podem interagir com cada máquina
                  </p>
                </div>
                <button 
                  onClick={() => setShowAddTerminalModal(true)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-855 text-indigo-400 font-extrabold uppercase tracking-widest text-[9.5px] py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all select-none cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" /> Cadastrar Terminal
                </button>
              </div>

              {/* Grid of Terminals */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {terminals.map(t => {
                  const isLocked = t.modoBloqueado;
                  return (
                    <div 
                      key={t.idTerminal}
                      className={`rounded-2xl p-4 border transition-all ${
                        isLocked 
                          ? 'bg-rose-950/5 border-rose-500/20' 
                          : 'bg-[#060606] border-zinc-900 hover:border-zinc-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3 border-b border-zinc-900 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Monitor className={`w-4 h-4 ${isLocked ? 'text-rose-500' : 'text-indigo-400'}`} />
                          <div className="text-left">
                            <h4 className="text-[11.5px] font-black text-white uppercase tracking-wider leading-none mb-0.5">{t.nomeTerminal}</h4>
                            <span className="text-[8px] font-black text-zinc-550 uppercase tracking-widest font-mono">{t.idTerminal}</span>
                          </div>
                        </div>

                        {/* Lock / Unlock Toggle button */}
                        <button 
                          onClick={async () => {
                            const result = await updateTerminal(t.idTerminal, { modoBloqueado: !t.modoBloqueado });
                            if (result.success) {
                              useStore.getState().logAction({
                                module: 'Controle de Terminais',
                                actionType: 'status_change',
                                action: 'Alteração de Bloqueio do Terminal',
                                description: `Terminal ${t.nomeTerminal} (${t.idTerminal}) foi ${!t.modoBloqueado ? 'BLOQUEADO' : 'DESBLOQUEADO'}.`,
                                status: 'sucesso'
                              });
                            }
                          }}
                          className={`py-1 px-2 text-[8px] font-black uppercase tracking-widest rounded-lg flex items-center gap-1 cursor-pointer transition-all ${
                            isLocked 
                              ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/30' 
                              : 'bg-zinc-900 hover:bg-zinc-850 text-[#71717a]'
                          }`}
                        >
                          {isLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                          {isLocked ? 'Bloqueado' : 'Travar'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-left mb-3">
                        <div className="bg-[#0b0b0b] p-1.5 rounded-lg border border-zinc-900/40">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">TIPO OPERACIONAL</span>
                          <span className="text-[9.5px] font-black text-white font-mono uppercase tracking-wide inline-block mt-1 bg-indigo-500/10 px-1.5 py-0.5 rounded text-indigo-400 border border-indigo-500/10">{t.tipoTerminal}</span>
                        </div>
                        <div className="bg-[#0b0b0b] p-1.5 rounded-lg border border-zinc-900/40">
                          <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">SETOR</span>
                          <span className="text-[9.5px] font-extrabold text-zinc-300 uppercase tracking-wide mt-1 block truncate">{t.setor}</span>
                        </div>
                      </div>

                      {/* Current & Last login audit */}
                      <div className="bg-[#090909] p-2 rounded-xl text-left border border-zinc-900 space-y-1.5">
                        <div className="flex items-center justify-between text-[9px]">
                          <span className="text-zinc-500 uppercase font-bold">Operador Ativo:</span>
                          <span className="text-emerald-400 font-extrabold uppercase font-mono max-w-[140px] truncate">
                            {t.operadorAtualName ? `● ${t.operadorAtualName}` : 'NENHUM LOGADO'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] border-t border-zinc-900/60 pt-1.5">
                          <span className="text-zinc-500 uppercase font-bold">Último Operador:</span>
                          <span className="text-zinc-400 uppercase font-mono max-w-[140px] truncate">
                            {t.ultimoOperadorName || '--'}
                          </span>
                        </div>
                      </div>

                      {/* Accepted profiles badges list */}
                      <div className="mt-4 pt-3 border-t border-zinc-900/60 text-left">
                        <span className="text-[7.5px] font-black text-zinc-500 uppercase tracking-widest block mb-1.5">PERFIS DE SCOPO AUTORIZADOS</span>
                        <div className="flex flex-wrap gap-1">
                          {t.permissoesAceitas.map(perm => (
                            <span key={perm} className="text-[8px] font-black text-zinc-400 px-1.5 py-0.5 bg-zinc-900 uppercase tracking-wider rounded border border-zinc-800">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Hardware target identifier */}
                      <div className="mt-3 text-right">
                        <span className="text-[7px] font-semibold text-zinc-600 font-mono">Dispositivo: {t.dispositivo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 2: INTELIGÊNCIA DE CRASHES / NFC TAGS
              ────────────────────────────────────────── */}
          {activeTab === 'nfc' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-indigo-400" /> Cadastro e Gestão de Chaves NFC
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    Associe códigos UID de crachás físicos e controle suspensão, quarentena e credencial operacional
                  </p>
                </div>
                <button 
                  onClick={() => setShowAddNfcModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold uppercase tracking-widest text-[9.5px] py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all select-none cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Cadastrar Tag NFC
                </button>
              </div>

              {/* NFC Tags Table density layout */}
              <div className="overflow-x-auto min-h-[160px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">UID da Tag</th>
                      <th className="pb-3">Descrição / Rotulo</th>
                      <th className="pb-3 text-center">Tipo de Credencial</th>
                      <th className="pb-3">Colaborador Vinculado</th>
                      <th className="pb-3 text-center">Data Validade</th>
                      <th className="pb-3 text-center">Último Uso</th>
                      <th className="pb-3 text-center">Situação / Status</th>
                      <th className="pb-3 pr-2 text-right">Ações de Segurança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {filteredNfcTags.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-zinc-500 uppercase tracking-wider text-[10px]">
                          Nenhuma Tag NFC mapeada nos critérios atuais de pesquisa.
                        </td>
                      </tr>
                    ) : (
                      filteredNfcTags.map(tag => {
                        const linkedUser = users.find(u => u.id === tag.usuarioVinculado);
                        return (
                          <tr key={tag.id} className="hover:bg-zinc-950/30 transition-all">
                            {/* UID */}
                            <td className="py-3.5 pl-2 font-mono text-[11px] text-zinc-300 font-bold max-w-[124px] truncate">
                              <code>{tag.uid}</code>
                            </td>
                            {/* label */}
                            <td className="py-3.5 uppercase font-medium text-zinc-400 text-[10px]">
                              {tag.tagLabel || <span className="text-zinc-650 opacity-40">Sem Rótulo</span>}
                            </td>
                            {/* tipo credencial */}
                            <td className="py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-center ${
                                tag.tipoCredencial === 'MASTER' 
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/15' 
                                  : tag.tipoCredencial === 'ADM'
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/15'
                                    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15'
                              }`}>
                                {tag.tipoCredencial || 'OPERADOR'}
                              </span>
                            </td>
                            {/* user */}
                            <td className="py-3.5">
                              {linkedUser ? (
                                <div className="flex flex-col text-left">
                                  <span className="font-extrabold uppercase text-[10.5px] text-white tracking-wide">{linkedUser.fullName}</span>
                                  <span className="text-[7.5px] text-zinc-500 uppercase tracking-widest font-mono mt-0.5">{linkedUser.roleId || 'Operador'}</span>
                                </div>
                              ) : (
                                <span className="text-zinc-600 uppercase text-[9.5px] tracking-wider italic">Vago (Disponível)</span>
                              )}
                            </td>
                            {/* validade */}
                            <td className="py-3.5 text-center text-zinc-400 font-mono text-[10px]">
                              {tag.dataExpiracao 
                                ? format(tag.dataExpiracao, 'dd/MM/yyyy') 
                                : <span className="text-zinc-650">Indeterminada</span>}
                            </td>
                            {/* ultimo uso */}
                            <td className="py-3.5 text-center text-zinc-400 font-mono text-[10px]">
                              {tag.ultimoUso 
                                ? format(tag.ultimoUso, 'HH:mm:ss')
                                : <span className="text-zinc-650">--:--:--</span>}
                            </td>
                            {/* status */}
                            <td className="py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                                tag.status === 'Livre' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                                  : tag.status === 'Vinculado'
                                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/15'
                                    : tag.status === 'Quarentena'
                                      ? 'bg-amber-500/10 text-amber-500 border border-amber-505/15'
                                      : 'bg-rose-500/10 text-rose-450 border border-rose-500/15'
                              }`}>
                                {tag.status}
                              </span>
                            </td>
                            {/* actions */}
                            <td className="py-3.5 pr-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {tag.status === 'Vinculado' && (
                                  <button
                                    onClick={() => useStore.getState().unlinkNFCTagFromUser(tag.id)}
                                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 py-1 px-2 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider transition-all"
                                  >
                                    Desvincular
                                  </button>
                                )}
                                
                                {tag.status !== 'Quarentena' && tag.status !== 'Livre' && (
                                  <button
                                    onClick={() => useStore.getState().quarantineNFCTag(tag.id, 'Suspeita de perda')}
                                    className="bg-amber-500/5 hover:bg-amber-500/15 text-amber-500 border border-amber-505/20 py-1 px-2 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider transition-all"
                                  >
                                    Quarentena
                                  </button>
                                )}

                                {tag.status === 'Quarentena' && (
                                  <button
                                    onClick={() => useStore.getState().restoreNFCTag(tag.id)}
                                    className="bg-emerald-500/5 hover:bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 py-1 px-2 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider transition-all"
                                  >
                                    Liberar
                                  </button>
                                )}

                                <button
                                  onClick={() => {
                                    if (confirm('Deletar permanentemente esta tag do banco de credenciais?')) {
                                      useStore.setState((state) => ({
                                        nfcTags: (state.nfcTags || []).map(t => t.id === tag.id ? { ...t, status: 'Excluido' } : t)
                                      }));
                                    }
                                  }}
                                  className="bg-rose-500/5 hover:bg-rose-500/15 text-rose-450 border border-rose-500/10 p-1.5 rounded-lg cursor-pointer transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 3: QR CODE MASTERTOKENS
              ────────────────────────────────────────── */}
          {activeTab === 'qr' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                    <QrCode className="w-4 h-4 text-indigo-400" /> Hub Central de Token QR Codes
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    Gere, redefina ou imprima chaves ópticas seguras para autenticação celular no PDV e CFTV
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto min-h-[160px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">Login / Registro</th>
                      <th className="pb-3">Colaborador</th>
                      <th className="pb-3">Role / Cargo</th>
                      <th className="pb-3">Token de Segurança</th>
                      <th className="pb-3 text-center">Status Clínico</th>
                      <th className="pb-3 pr-2 text-right">Apoio a Emissões</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {filteredUsers.map(user => {
                      return (
                        <tr key={user.id} className="hover:bg-zinc-950/30 transition-all">
                          <td className="py-3 pl-2 font-mono text-[10.5px] font-bold text-zinc-400">
                            {user.login}
                          </td>
                          <td className="py-3 font-extrabold uppercase text-white tracking-wide text-[11px]">
                            {user.fullName}
                          </td>
                          <td className="py-3 text-zinc-505 uppercase tracking-widest font-mono text-[9px]">
                            {user.roleId || 'OPERADOR'}
                          </td>
                          <td className="py-3 font-mono text-zinc-450 tracking-wider text-[10px]">
                            {user.qrCodeToken ? (
                              <code>{user.qrCodeToken.substring(0, 15)}...</code>
                            ) : (
                              <span className="text-rose-500 italic">Sem Token Ativo</span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                              user.status === 'ativo' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                                : 'bg-rose-500/10 text-rose-450 border border-rose-500/15'
                            }`}>
                              {user.status}
                            </span>
                          </td>
                          <td className="py-3 pr-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => {
                                  setSelectedUserQR(user);
                                }}
                                className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 py-1 px-2.5 rounded-lg text-[9px] uppercase font-black inline-flex items-center gap-1 cursor-pointer tracking-wider"
                              >
                                <Eye className="w-3.5 h-3.5 text-indigo-400" /> Visualizar QR
                              </button>
                              
                              <button
                                onClick={() => {
                                  const freshToken = generateUUID('qr');
                                  useStore.setState((state) => ({
                                    users: state.users.map(u => u.id === user.id ? { ...u, qrCodeToken: freshToken } : u)
                                  }));
                                  useStore.getState().logAction({
                                    module: 'Central de Acesso',
                                    actionType: 'update',
                                    action: 'Regeneração de QR Token',
                                    description: `Token QR Code do usuário ${user.fullName} foi redefinido por administrador.`,
                                    status: 'sucesso'
                                  });
                                }}
                                className="bg-zinc-900 hover:bg-zinc-850 text-[#71717a] py-1 px-2 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider"
                              >
                                Redefinir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 4: CREDENCIAIS MASTER (SUPERVISÃO)
              ────────────────────────────────────────── */}
          {activeTab === 'master' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" /> Cofre de Credenciais Master (Supervisores)
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    Configure senhas exclusivas de supervisor para liberação especial de caixas, sangrias e faltas na separação
                  </p>
                </div>
                <button 
                  onClick={() => setShowAddMasterModal(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-extrabold uppercase tracking-widest text-[9.5px] py-2 px-4 rounded-xl flex items-center gap-1.5 transition-all select-none cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Atribuir Perfil Master
                </button>
              </div>

              <div className="overflow-x-auto min-h-[160px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">ID Autorização</th>
                      <th className="pb-3">Supervisor Autorizado</th>
                      <th className="pb-3">Senha Segura de Crise</th>
                      <th className="pb-3 text-center">Cadastro Original</th>
                      <th className="pb-3 text-center">Último Uso Operacional</th>
                      <th className="pb-3">Observações / Escopo</th>
                      <th className="pb-3 text-center">Estado</th>
                      <th className="pb-3 pr-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {masterAuthorizations.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-zinc-650 uppercase tracking-wider text-[10px]">
                          Nenhum supervisor com senha master configurada.
                        </td>
                      </tr>
                    ) : (
                      masterAuthorizations.map(auth => {
                        const matchedS = users.find(u => u.id === auth.userId);
                        return (
                          <tr key={auth.id} className="hover:bg-zinc-950/30 transition-all">
                            <td className="py-3.5 pl-2 font-mono text-[10.5px] font-bold text-zinc-500">
                              {auth.id}
                            </td>
                            <td className="py-3.5 font-extrabold uppercase text-white tracking-wide text-[11px]">
                              {matchedS?.fullName || 'Supervisor Não Localizado'}
                            </td>
                            <td className="py-3.5 font-mono text-zinc-500 text-[10px] tracking-widest">
                              <code>•••••• ({auth.passwordMaster.length} ordens)</code>
                            </td>
                            <td className="py-3.5 text-center text-zinc-400 font-mono text-[10px]">
                              {format(auth.createdAt, 'dd/MM/yyyy HH:mm')}
                            </td>
                            <td className="py-3.5 text-center text-zinc-400 font-mono text-[10px]">
                              {auth.lastUsedAt 
                                ? format(auth.lastUsedAt, 'dd/MM HH:mm:ss')
                                : <span className="text-zinc-650">Nunca</span>}
                            </td>
                            <td className="py-3.5 text-zinc-400 text-[10px] max-w-[150px] truncate">
                              {auth.observation || 'Geral'}
                            </td>
                            <td className="py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                auth.status === 'ativo' 
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/15'
                                  : 'bg-zinc-900 text-zinc-600 border border-zinc-800'
                              }`}>
                                {auth.status}
                              </span>
                            </td>
                            <td className="py-3.5 pr-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => {
                                    const nextStatus = auth.status === 'ativo' ? 'inativo' : 'ativo';
                                    useStore.setState((state) => ({
                                      masterAuthorizations: state.masterAuthorizations.map(m => m.id === auth.id ? { ...m, status: nextStatus } : m)
                                    }));
                                  }}
                                  className="bg-zinc-900 hover:bg-zinc-850 text-zinc-300 py-1 px-2 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider"
                                >
                                  Alternar Status
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Deletar credencial master deste supervisor?')) {
                                      useStore.setState((state) => ({
                                        masterAuthorizations: state.masterAuthorizations.filter(m => m.id !== auth.id)
                                      }));
                                    }
                                  }}
                                  className="bg-rose-500/5 hover:bg-rose-500/15 text-rose-450 border border-rose-500/10 p-1.5 rounded-lg cursor-pointer transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 5: CREDENCIAIS ADM (NÍVEL DE ACESSO CENTRAL)
              ────────────────────────────────────────── */}
          {activeTab === 'admin' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                  <Lock key="lock-svg" className="w-4 h-4 text-rose-500" /> Registro de Administradores Locais
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                  Consulte os logins e credenciais com níveis de permissão irrestrita no ecossistema
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">ID Usuário</th>
                      <th className="pb-3">Nome Real</th>
                      <th className="pb-3">Login de Acesso</th>
                      <th className="pb-3 text-center">NFC Associado</th>
                      <th className="pb-3 text-center">Privilégios</th>
                      <th className="pb-3 pr-2 text-right">Afiliação de Empresa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {users.filter(u => u.isAdmin || u.isOwner || u.isMasterAdmin).map(adm => {
                      const tagMatched = nfcTags.find(t => t.usuarioVinculado === adm.id && t.status !== 'Excluido');
                      return (
                        <tr key={adm.id} className="hover:bg-zinc-950/30 transition-all">
                          <td className="py-3.5 pl-2 font-mono text-[10.5px] text-zinc-500 font-bold">
                            {adm.id}
                          </td>
                          <td className="py-3.5 font-extrabold uppercase text-white tracking-wide text-[11px]">
                            {adm.fullName}
                          </td>
                          <td className="py-3.5 font-mono text-emerald-450 font-bold tracking-wider">
                            <code>{adm.login}</code>
                          </td>
                          <td className="py-3.5 text-center font-mono text-zinc-400">
                            {tagMatched ? (
                              <span className="text-indigo-400 font-extrabold text-[10px] bg-indigo-505/10 py-0.5 px-2 border border-indigo-500/10 rounded">
                                {tagMatched.uid}
                              </span>
                            ) : (
                              <span className="text-zinc-650 italic text-[9.5px]">Nenhuma Tag</span>
                            )}
                          </td>
                          <td className="py-3.5 text-center">
                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/10">
                              {adm.isOwner ? 'PROPRIETÁRIO' : 'ADMINISTRADOR'}
                            </span>
                          </td>
                          <td className="py-3.5 pr-2 text-right text-zinc-500 font-mono text-[10px]">
                            {adm.loja || 'Matriz Central'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 6: OPERADORES E SEPARADORES GERAIS
              ────────────────────────────────────────── */}
          {activeTab === 'operadores' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-450" /> Registradores e Perfis Operacionais
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                  Lista unificada de identidades funcionais e suas tags atribuídas
                </p>
              </div>

              <div className="overflow-x-auto min-h-[160px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">Login</th>
                      <th className="pb-3">Nome Real</th>
                      <th className="pb-3 text-center">Nivel/Cargo</th>
                      <th className="pb-3 text-center">NFC Ativo</th>
                      <th className="pb-3 text-center">QR Token Ativo</th>
                      <th className="pb-3">Setor Vinculado</th>
                      <th className="pb-3 pr-2 text-right">Lotação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {filteredUsers.map(u => {
                      const associatedTag = nfcTags.find(t => t.usuarioVinculado === u.id && t.status !== 'Excluido');
                      return (
                        <tr key={u.id} className="hover:bg-zinc-950/30 transition-all">
                          <td className="py-3 pl-2 font-mono text-zinc-400 text-[10.5px]">
                            {u.login}
                          </td>
                          <td className="py-3 font-extrabold uppercase text-white tracking-wide text-[11px]">
                            {u.fullName}
                          </td>
                          <td className="py-3 text-center">
                            <span className="bg-[#101010] border border-zinc-900 px-2 py-0.5 rounded text-[8.5px] font-mono uppercase text-zinc-300 font-extrabold">
                              {u.roleId || 'OPERADOR'}
                            </span>
                          </td>
                          <td className="py-3 text-center font-mono">
                            {associatedTag ? (
                              <span className="text-emerald-450 font-extrabold text-[10px] bg-emerald-500/5 px-1.5 py-0.5 border border-emerald-500/10 rounded">
                                {associatedTag.uid}
                              </span>
                            ) : (
                              <span className="text-zinc-650 italic text-[9.5px]">Pendente</span>
                            )}
                          </td>
                          <td className="py-3 text-center font-mono text-[9px] text-zinc-400">
                            {u.qrCodeToken ? '✓ Ativo' : 'Nenhum'}
                          </td>
                          <td className="py-3 text-zinc-400 uppercase tracking-wider text-[10px]">
                            {u.setor || 'Operacional'}
                          </td>
                          <td className="py-3 pr-2 text-right text-zinc-500 text-[9.5px]">
                            {u.loja || 'Sede'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 7: CHAVES BLOQUEADAS/PERDIDAS (QUARENTENA CRÍTICA)
              ────────────────────────────────────────── */}
          {activeTab === 'bloqueados' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-500" /> Quarentena e Tags Negativadas
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                  Consulte credenciais temporariamente suspensas, perdidas ou em quarentena de segurança
                </p>
              </div>

              <div className="overflow-x-auto min-h-[160px]">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8px] font-black text-zinc-500 uppercase tracking-widest">
                      <th className="pb-3 pl-2">Código UID</th>
                      <th className="pb-3">Descrição / Status</th>
                      <th className="pb-3 text-center">Tipo Crise</th>
                      <th className="pb-3">Usuário Associado na Perda</th>
                      <th className="pb-3">Razão Relatada / Histórico</th>
                      <th className="pb-3 text-center">Data Registro</th>
                      <th className="pb-3 pr-2 text-right">Liberação Segura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/50">
                    {nfcTags.filter(t => ['Bloqueado', 'Perdido', 'Quarentena'].includes(t.status)).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-zinc-600 uppercase tracking-wider text-[10px]">
                          Cofre Limpo. Nenhuma credencial negativada no momento.
                        </td>
                      </tr>
                    ) : (
                      nfcTags.filter(t => ['Bloqueado', 'Perdido', 'Quarentena'].includes(t.status)).map(tag => {
                        const linkedUser = users.find(u => u.id === tag.usuarioVinculado);
                        return (
                          <tr key={tag.id} className="hover:bg-zinc-950/30 transition-all animate-pulse">
                            <td className="py-3.5 pl-2 font-mono text-[11px] text-rose-500 font-black">
                              <code>{tag.uid}</code>
                            </td>
                            <td className="py-3.5 uppercase font-semibold text-zinc-400 text-[10px]">
                              {tag.tagLabel || 'Tag de Controle'}
                            </td>
                            <td className="py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                tag.status === 'Quarentena' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                              }`}>
                                {tag.status}
                              </span>
                            </td>
                            <td className="py-3.5 font-bold uppercase text-[10.5px]">
                              {linkedUser?.fullName || 'Sem Usuário Atribuído'}
                            </td>
                            <td className="py-3.5 text-zinc-500 text-[10px]">
                              {tag.quarantineReason || 'Suspeita de sinistro ou redefinição de segurança'}
                            </td>
                            <td className="py-3.5 text-center font-mono text-zinc-500 text-[10px]">
                              {tag.quarantineAt ? format(tag.quarantineAt, 'dd/MM/yyyy HH:mm') : '--'}
                            </td>
                            <td className="py-3.5 pr-2 text-right">
                              <button
                                onClick={async () => {
                                  const res = await useStore.getState().restoreNFCTag(tag.id);
                                  if (res.success) {
                                    alert('Credencial reativada com sucesso para status Livre.');
                                  } else {
                                    alert(res.error);
                                  }
                                }}
                                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 py-1 px-2.5 rounded-lg text-[9px] uppercase font-black cursor-pointer tracking-wider transition-all"
                              >
                                Reativar Chave
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 8: AUDITORIA DE ACESSO COMPLETA (HISTÓRICO REAL)
              ────────────────────────────────────────── */}
          {activeTab === 'auditoria' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
                <div>
                  <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" /> Registro de Atividade e Tentativas de Login
                  </h3>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                    Histórico detalhado de leituras NFC, autorizações negadas por incompatibilidade de terminal e logins tradicionais
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Status log filter */}
                  <div className="flex items-center gap-1.5 bg-[#030303] border border-zinc-850 px-2 py-1 rounded-xl">
                    <Filter className="w-3.5 h-3.5 text-zinc-500" />
                    <select 
                      value={auditFilterStatus}
                      onChange={(e) => setAuditFilterStatus(e.target.value)}
                      className="bg-transparent border-none text-[9px] font-black uppercase tracking-wider text-white focus:ring-0 focus:outline-none cursor-pointer"
                    >
                      <option value="TODOS" className="bg-[#101010] text-zinc-300">TODOS STATUS</option>
                      <option value="SUCESSO" className="bg-[#101010] text-[#10b981]">SUCESSO</option>
                      <option value="BLOQUEADO" className="bg-[#101010] text-[#ef4444]">BLOQUEADO / NEGADO</option>
                      <option value="ERRO" className="bg-[#101010] text-amber-500">ERRO</option>
                    </select>
                  </div>

                  {/* Device log filter */}
                  <div className="flex items-center gap-1.5 bg-[#030303] border border-zinc-850 px-2 py-1 rounded-xl">
                    <Monitor className="w-3.5 h-3.5 text-zinc-500" />
                    <select 
                      value={auditFilterDevice}
                      onChange={(e) => setAuditFilterDevice(e.target.value)}
                      className="bg-transparent border-none text-[9px] font-black uppercase tracking-wider text-white focus:ring-0 focus:outline-none cursor-pointer"
                    >
                      <option value="TODOS" className="bg-[#101010] text-zinc-300">TODOS DISPOSITIVOS</option>
                      {terminals.map(t => (
                        <option key={t.idTerminal} value={t.idTerminal} className="bg-[#101010] text-zinc-300">{t.nomeTerminal}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* logs body */}
              <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-900 text-[8.5px] font-black text-zinc-500 uppercase tracking-widest sticky top-0 bg-[#0e0e0e] z-10 pb-2">
                      <th className="pb-3 pl-2">Horário</th>
                      <th className="pb-3">Módulo</th>
                      <th className="pb-3">Operador</th>
                      <th className="pb-3">Ação</th>
                      <th className="pb-3 text-center">Status</th>
                      <th className="pb-3 pr-2 text-right">Descrição Log</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/40">
                    {filteredAccessLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">
                          Nenhum log de acesso correspondente aos canais selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredAccessLogs.map(log => {
                        return (
                          <tr key={log.id} className="hover:bg-zinc-950/30 transition-all font-sans">
                            <td className="py-3 pl-2 font-mono text-zinc-500 text-[10px] max-w-[100px] truncate">
                              {format(log.timestamp, 'dd/MM HH:mm:ss')}
                            </td>
                            <td className="py-3 text-zinc-400 font-extrabold uppercase text-[9px] font-mono tracking-wider">
                              {log.module}
                            </td>
                            <td className="py-3 font-bold uppercase text-[10.5px]">
                              {log.userLogin || 'Anônimo'} ({log.userRole || 'Operador'})
                            </td>
                            <td className="py-3 text-zinc-300 font-medium uppercase text-[9.5px]">
                              {log.action || log.actionType}
                            </td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
                                log.status === 'sucesso' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10'
                                  : 'bg-rose-500/10 text-rose-450 border border-rose-500/10'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="py-3 pr-2 text-right text-zinc-450 text-[10px] max-w-[280px] truncate" title={log.description}>
                              {log.description}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────
              TAB 9: SESSÕES OPERACIONAIS E TERMINAL BUSY
              ────────────────────────────────────────── */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-extrabold uppercase text-[12.5px] tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400 animate-pulse" /> Sessões em Tempo Real (Active Clients)
                </h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
                  Consulte quem está operando as máquinas em tempo real e proceda com logouts forçados de segurança
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Principal application user logged in */}
                <div className="bg-[#060606] border border-zinc-900 rounded-2xl p-5 text-left space-y-4">
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest block leading-none">PRINCIPAL FRAME USER (SESSÃO DO NAVEGADOR)</span>
                  
                  {currentUser ? (
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 font-sans font-black text-lg">
                        {currentUser.fullName.charAt(0)}
                      </div>
                      <div className="text-left space-y-1">
                        <h4 className="text-sm font-black uppercase text-white leading-none">{currentUser.fullName}</h4>
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-mono">ID: {currentUser.id} • Perfil: {currentUser.roleId}</p>
                        <span className="text-[8px] font-black text-emerald-400 bg-emerald-500/10 py-0.5 px-2 rounded-full">
                          ✓ Sessão Autenticada
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-zinc-650 uppercase font-black tracking-wider text-xs py-4 text-center">
                      Nenhum usuário logado na sessão principal do WMS.
                    </div>
                  )}

                  {currentUser?.nfcTagId && (
                    <div className="bg-[#0a0a0a] border border-zinc-900 p-2 rounded-xl flex items-center justify-between text-[10px] font-mono">
                      <span className="text-zinc-500 uppercase font-bold">Tag Autenticante:</span>
                      <code className="text-indigo-400 font-bold">{currentUser.nfcTagId}</code>
                    </div>
                  )}
                  
                  {currentUser && (
                    <button
                      onClick={() => {
                        if (confirm('Fazer logout forçado desta sessão principal?')) {
                          useStore.getState().logoutLocal && useStore.getState().logoutLocal();
                        }
                      }}
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-450 border border-rose-500/10 py-2.5 px-4 font-black uppercase tracking-wider text-[10px] rounded-xl transition-all select-none cursor-pointer text-center block"
                    >
                      Derrubar Sessão do Navegador
                    </button>
                  )}
                </div>

                {/* Terminals operators active state */}
                <div className="bg-[#060606] border border-zinc-900 rounded-2xl p-5 text-left space-y-4">
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest block leading-none">OPERADORES LOCALIZADOS NOS TERMINAIS</span>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto custom-scrollbar">
                    {terminals.map(term => (
                      <div key={term.idTerminal} className="border border-zinc-900 p-3 rounded-xl flex items-center justify-between bg-[#0a0a0a]">
                        <div className="text-left space-y-0.5">
                          <span className="block text-[8px] font-black text-zinc-600 uppercase tracking-widest">{term.idTerminal}</span>
                          <h5 className="text-[11px] font-black text-white uppercase tracking-wider leading-none">{term.nomeTerminal}</h5>
                          <span className="text-[9px] text-zinc-450 block truncate max-w-[170px]">
                            {term.operadorAtualName ? `Ativo: ${term.operadorAtualName}` : 'Sem operador ativo'}
                          </span>
                        </div>

                        {term.operadorAtualId && (
                          <button
                            onClick={() => {
                              updateTerminal(term.idTerminal, {
                                operadorAtualId: null,
                                operadorAtualName: null,
                                ultimoOperadorId: term.operadorAtualId,
                                ultimoOperadorName: term.operadorAtualName
                              });
                              useStore.getState().logAction({
                                module: 'Controle de Terminais',
                                actionType: 'status_change',
                                action: 'Logout Forçado de Terminal',
                                description: `Operador do terminal ${term.nomeTerminal} foi desconectado pelo administrador central.`,
                                status: 'sucesso'
                              });
                            }}
                            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 py-1 px-2.5 rounded-lg text-[8.5px] uppercase font-black cursor-pointer tracking-wider"
                          >
                            Forçar Desconexão
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ────────────────────────────────────────────────────────────────────────
          MODALS SECTION (CADASTROS DE ACESSO)
          ──────────────────────────────────────────────────────────────────────── */}
      {/* 1. Add Terminal Modal */}
      {showAddTerminalModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0b0b0b] border border-zinc-855 rounded-3xl p-6 max-w-md w-full text-left space-y-5 shadow-2xl relative"
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="text-white font-extrabold uppercase text-xs tracking-wider flex items-center gap-2">
                <Monitor className="w-4.5 h-4.5 text-indigo-400" /> Cadastrar Novo Terminal
              </h3>
              <button 
                onClick={() => setShowAddTerminalModal(false)}
                className="text-zinc-500 hover:text-white uppercase font-black tracking-widest text-[9px] cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateTerminal} className="space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Nome do Terminal</label>
                <input 
                  type="text"
                  required
                  value={newTerminalName}
                  onChange={(e) => setNewTerminalName(e.target.value)}
                  placeholder="Ex: Frente de Caixa 02"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Tipo de Terminal</label>
                  <select
                    value={newTerminalType}
                    onChange={(e) => setNewTerminalType(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="PDV">PDV (Caixa)</option>
                    <option value="SEPARACAO">Separação</option>
                    <option value="ESTOQUE">Estoque</option>
                    <option value="EXPEDICAO">Expedição</option>
                    <option value="ADMINISTRATIVO">Administrativo</option>
                    <option value="FINANCEIRO">Financeiro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Setor</label>
                  <input 
                    type="text"
                    required
                    value={newTerminalSector}
                    onChange={(e) => setNewTerminalSector(e.target.value)}
                    placeholder="Ex: Salão"
                    className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Dispositivo Hardware Física</label>
                <input 
                  type="text"
                  value={newTerminalDevice}
                  onChange={(e) => setNewTerminalDevice(e.target.value)}
                  placeholder="Ex: Computer PDV-02"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700"
                />
              </div>

              {/* Roles checkbox list */}
              <div className="space-y-1.5">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none">Perfis Autorizados na Máquina</label>
                <div className="grid grid-cols-3 gap-2 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-900">
                  {roleOptions.map(rOpt => {
                    const active = newTerminalRoles.includes(rOpt);
                    return (
                      <button
                        type="button"
                        key={rOpt}
                        onClick={() => {
                          if (active) {
                            setNewTerminalRoles(newTerminalRoles.filter(b => b !== rOpt));
                          } else {
                            setNewTerminalRoles([...newTerminalRoles, rOpt]);
                          }
                        }}
                        className={`p-1.5 rounded-lg border text-[8.5px] font-black uppercase text-center transition-all ${
                          active 
                            ? 'bg-indigo-600/15 border-indigo-500/20 text-indigo-400' 
                            : 'bg-zinc-900 border-zinc-850 text-zinc-500'
                        }`}
                      >
                        {rOpt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-505 py-3 text-[10.5px] uppercase font-black tracking-wider text-white rounded-xl select-none transition-all cursor-pointer shadow-lg shadow-indigo-950/20"
              >
                Efetivar Terminal
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* 2. Add NFC Tag Modal */}
      {showAddNfcModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0b0b0b] border border-zinc-855 rounded-3xl p-6 max-w-sm w-full text-left space-y-5 shadow-2xl relative"
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="text-white font-extrabold uppercase text-xs tracking-wider flex items-center gap-2">
                <Wifi className="w-4.5 h-4.5 text-indigo-450" /> Cadastrar Crachá NFC
              </h3>
              <button 
                onClick={() => setShowAddNfcModal(false)}
                className="text-zinc-500 hover:text-white uppercase font-black tracking-widest text-[9px] cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateNfcTag} className="space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">UID Código Físico</label>
                <input 
                  type="text"
                  required
                  value={newNfcUid}
                  onChange={(e) => setNewNfcUid(e.target.value)}
                  placeholder="Ex: 53:02:FA:11"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-mono tracking-widest text-center uppercase focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Descrição / Rótulo da Chave</label>
                <input 
                  type="text"
                  value={newNfcLabel}
                  onChange={(e) => setNewNfcLabel(e.target.value)}
                  placeholder="Ex: Crachá Reserva Caixa B"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Tipo Credencial</label>
                  <select
                    value={newNfcType}
                    onChange={(e) => setNewNfcType(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none cursor-pointer"
                  >
                    <option value="OPERADOR">Operador</option>
                    <option value="MASTER">Master (Supervisor)</option>
                    <option value="ADM">Admin</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Validade (Dias)</label>
                  <input 
                    type="number"
                    value={newNfcDurationDays}
                    onChange={(e) => setNewNfcDurationDays(parseInt(e.target.value) || 365)}
                    className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-505 py-3 text-[10.5px] uppercase font-black tracking-wider text-white rounded-xl select-none transition-all cursor-pointer text-center"
              >
                Cadastrar Chave NFC
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* 4. Display Printable QR Token Modal */}
      {selectedUserQR && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0b0b0b] border border-zinc-855 rounded-3xl p-6 max-w-sm w-full text-center space-y-5 shadow-2xl relative"
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3 text-left">
              <h3 className="text-white font-extrabold uppercase text-xs tracking-wider flex items-center gap-2">
                <QrCode className="w-4.5 h-4.5 text-indigo-400" /> Token QR Impresso
              </h3>
              <button 
                onClick={() => setSelectedUserQR(null)}
                className="text-zinc-500 hover:text-white uppercase font-black tracking-widest text-[9px] cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <div className="bg-white p-5 rounded-3xl max-w-[200px] mx-auto shadow-inner flex flex-col items-center justify-center">
              {/* Virtual vector visual mockup qr */}
              <div className="w-40 h-40 bg-zinc-100 flex flex-col items-center justify-center border-4 border-zinc-950 relative overflow-hidden">
                <QrCode className="w-36 h-36 text-zinc-950" />
                <div className="absolute inset-x-0 bottom-1 flex justify-center">
                  <span className="text-[6.5px] font-mono text-zinc-900 font-extrabold bg-white px-1 border border-zinc-300">
                    {selectedUserQR.login}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-black uppercase text-white leading-none">{selectedUserQR.fullName}</h4>
              <p className="text-[9.5px] text-zinc-550 uppercase font-mono">{selectedUserQR.roleId || 'OPERADOR'}</p>
            </div>

            <p className="text-[9.5px] text-zinc-500 uppercase leading-relaxed text-center bg-zinc-950 p-2 rounded-xl border border-zinc-900 font-mono">
              TOKEN: {selectedUserQR.qrCodeToken || 'SEM TOKEN ATRIBUTOR'}
            </p>

            <button
              onClick={() => {
                alert("A função de impressão física foi desativada em conformidade com as novas diretrizes corporativas de segurança.");
              }}
              className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 py-2 text-[10px] uppercase font-black tracking-widest rounded-xl transition-all cursor-pointer"
            >
              Imprimir Crachá / Token QR
            </button>
          </motion.div>
        </div>
      )}

      {/* 5. Add Master Password Authorization Modal */}
      {showAddMasterModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-[#0b0b0b] border border-zinc-855 rounded-3xl p-6 max-w-sm w-full text-left space-y-5 shadow-2xl relative"
          >
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="text-white font-extrabold uppercase text-xs tracking-wider flex items-center gap-2">
                <KeyRound className="w-4.5 h-4.5 text-amber-500" /> Cadastrar Supervisor Master
              </h3>
              <button 
                onClick={() => setShowAddMasterModal(false)}
                className="text-zinc-500 hover:text-white uppercase font-black tracking-widest text-[9px] cursor-pointer"
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleCreateMasterAuth} className="space-y-4 font-sans text-xs">
              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Supervisor Ativo</label>
                <select 
                  required
                  value={selectedMasterUserId} 
                  onChange={(e) => setSelectedMasterUserId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="">-- Selecione o Colaborador --</option>
                  {users.filter(u => u.isAdmin || u.roleId === 'Supervisor' || u.roleId === 'admin' || u.roleId === 'GERENTE').map(u => (
                    <option key={u.id} value={u.id}>{u.fullName} ({u.roleId || 'Supervisor'})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Senha Master Exclusiva</label>
                <input 
                  type="password"
                  required
                  value={newMasterPassword}
                  onChange={(e) => setNewMasterPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-550 block font-bold uppercase tracking-wider text-[8px] leading-none mb-1">Observações de Alçada / Abrangência</label>
                <textarea 
                  value={newMasterObs}
                  onChange={(e) => setNewMasterObs(e.target.value)}
                  placeholder="Ex: Supervisor Geral de Vendas e Liberador de Sangrias"
                  className="w-full bg-zinc-950 border border-zinc-850 py-2.5 px-3 rounded-xl text-white font-semibold focus:outline-none focus:border-zinc-700 h-16 resize-none"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-505 py-3 text-[10.5px] uppercase font-black tracking-wider text-white rounded-xl select-none transition-all cursor-pointer text-center shadow-lg shadow-amber-950/20"
              >
                Efetivar Credencial Supervisor
              </button>
            </form>
          </motion.div>
        </div>
      )}

    </div>
  );
}
