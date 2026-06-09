import React, { useState, useEffect, useRef, useMemo, FormEvent } from 'react';
import { useStore, NFCPresenceRecord, NFCTag, User } from '../store';
import { environmentService } from '../services/environmentService';
import { credentialValidationService } from '../services/credentialValidationService';
import { nfcServiceFactory } from '../services/NFCServiceFactory';
import { 
  Clock, 
  User2, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Calendar, 
  Filter, 
  RefreshCw, 
  Wifi, 
  ArrowUpRight, 
  ArrowDownRight, 
  Pause, 
  Play, 
  Smartphone,
  Smartphone as TerminalIcon,
  Tag
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

export default function NFCPresenceModule() {
  const users = useStore(state => state.users) || [];
  const nfcTags = useStore(state => state.nfcTags) || [];
  const nfcPresenceRecords = useStore(state => state.nfcPresenceRecords) || [];
  const addNFCPresenceRecord = useStore(state => state.addNFCPresenceRecord);

  // States
  const [selectedEventType, setSelectedEventType] = useState<'ENTRADA' | 'SAIDA' | 'PAUSA' | 'RETORNO' | 'PRESENCA_OPERACIONAL'>('ENTRADA');
  const [manualUid, setManualUid] = useState('');
  const [selectedSimulatedUserId, setSelectedSimulatedUserId] = useState('');
  const [activeTerminal, setActiveTerminal] = useState('Terminal Portaria A');
  
  // Filtering states
  const [filterUser, setFilterUser] = useState('');
  const [filterDate, setFilterDate] = useState(format(Date.now(), 'yyyy-MM-dd'));
  const [filterType, setFilterType] = useState('TODOS');

  // Interactive feedback state
  const [presenceFeedback, setPresenceFeedback] = useState<{
    status: 'success' | 'error';
    message: string;
    employeeName?: string;
    timestamp?: number;
    eventType?: string;
  } | null>(null);



  // Integrated hardware NFC listener via factory
  useEffect(() => {
    const service = nfcServiceFactory.getService();
    console.log(`[Presence/NFC] Engaging scan capabilities via: ${service.getPlatformName()}`);

    service.startScanning(
      (uid: string) => {
        triggerPresenceRegister(uid);
      },
      (errMessage: string) => {
        console.warn(`[Presence/NFC Hardware Failure]: ${errMessage}`);
      }
    );

    return () => {
      service.stopScanning();
    };
  }, [selectedEventType, activeTerminal]);



  const triggerPresenceRegister = (uid: string) => {
    if (!uid) return;
    const validationCheck = credentialValidationService.validateCredential(uid, 'NFC', 'PONTO');
    if (!validationCheck.success) {
      setPresenceFeedback({
        status: 'error',
        message: validationCheck.error || 'Credencial NFC inválida ou bloqueada.',
        employeeName: 'Acesso Recusado',
        timestamp: Date.now()
      });
      setTimeout(() => setPresenceFeedback(null), 6000);
      return;
    }

    const res = addNFCPresenceRecord(uid, selectedEventType, activeTerminal);
    if (res.success && res.record) {
      setPresenceFeedback({
        status: 'success',
        message: 'Presença registrada e confirmada com sucesso via NFC!',
        employeeName: res.record.userFullName,
        timestamp: res.record.timestamp,
        eventType: res.record.tipoEvento
      });
      // Clear after 6 seconds
      setTimeout(() => setPresenceFeedback(null), 6000);
    } else {
      // Find user to display extra info in error if tags match
      const tag = nfcTags.find(t => t.uid.toUpperCase() === uid.trim().toUpperCase());
      const linkedUser = tag ? users.find(u => u.id === tag.usuarioVinculado) : null;
      
      setPresenceFeedback({
        status: 'error',
        message: res.error || 'Erro desconhecido ao registrar ponto por NFC.',
        employeeName: linkedUser ? linkedUser.fullName : 'Tag não identificada',
        timestamp: Date.now()
      });
      setTimeout(() => setPresenceFeedback(null), 6000);
    }
  };

  const handleSimulateTagApproach = () => {
    if (!selectedSimulatedUserId) {
      alert('Selecione um colaborador para simular a tag NFC.');
      return;
    }

    // Find the tag corresponding to the selected user
    const user = users.find(u => u.id === selectedSimulatedUserId);
    if (!user) return;

    if (!user.nfcTagId) {
      // Create user linked tag mock or tell the user
      // No code tag found: check if there's any tag linked to this user's ID
      const userTag = nfcTags.find(t => t.usuarioVinculado === user.id);
      if (userTag) {
        triggerPresenceRegister(userTag.uid);
      } else {
        alert(`O colaborador ${user.fullName} não possui nenhuma Tag NFC ativa vinculada.`);
      }
    } else {
      const userTag = nfcTags.find(t => t.id === user.nfcTagId);
      if (userTag) {
        triggerPresenceRegister(userTag.uid);
      } else {
        alert('A tag NFC vinculada a este colaborador não foi encontrada na lista de tags.');
      }
    }
  };

  const handleManualUidSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualUid.trim()) return;
    triggerPresenceRegister(manualUid.trim());
    setManualUid('');
  };

  // Filtered record list
  const filteredRecords = useMemo(() => {
    let list = [...nfcPresenceRecords];

    if (filterUser) {
      list = list.filter(r => r.userId === filterUser);
    }

    if (filterDate) {
      list = list.filter(r => {
        const itemDate = format(r.timestamp, 'yyyy-MM-dd');
        return itemDate === filterDate;
      });
    }

    if (filterType !== 'TODOS') {
      list = list.filter(r => r.tipoEvento === filterType);
    }

    return list;
  }, [nfcPresenceRecords, filterUser, filterDate, filterType]);

  // Users who have recorded any presence today
  const dailyCollabStatus = useMemo(() => {
    const todayStr = format(Date.now(), 'yyyy-MM-dd');
    const todayRecords = nfcPresenceRecords.filter(r => format(r.timestamp, 'yyyy-MM-dd') === todayStr);

    const userStatusMap: { [userId: string]: { 
      user: User; 
      entrada: string | null; 
      saida: string | null; 
      pausa: string | null; 
      retorno: string | null;
      ultimoEvento: string | null;
    }} = {};

    // Base initial state with active users
    users.filter(u => u.status === 'ativo').forEach(u => {
      userStatusMap[u.id] = {
        user: u,
        entrada: null,
        saida: null,
        pausa: null,
        retorno: null,
        ultimoEvento: null
      };
    });

    // Populate with actual records sorted chronologically so later overwrites earlier
    const sortedToday = [...todayRecords].sort((a, b) => a.timestamp - b.timestamp);
    sortedToday.forEach(r => {
      if (userStatusMap[r.userId]) {
        const timeStr = format(r.timestamp, 'HH:mm:ss');
        if (r.tipoEvento === 'ENTRADA') userStatusMap[r.userId].entrada = timeStr;
        if (r.tipoEvento === 'SAIDA') userStatusMap[r.userId].saida = timeStr;
        if (r.tipoEvento === 'PAUSA') userStatusMap[r.userId].pausa = timeStr;
        if (r.tipoEvento === 'RETORNO') userStatusMap[r.userId].retorno = timeStr;
        
        userStatusMap[r.userId].ultimoEvento = `${r.tipoEvento} às ${timeStr}`;
      }
    });

    return Object.values(userStatusMap);
  }, [nfcPresenceRecords, users]);

  // Color functions for event types
  const getEventBadgeColor = (type: string) => {
    switch (type) {
      case 'ENTRADA': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
      case 'SAIDA': return 'bg-rose-500/15 text-rose-450 border border-rose-500/25';
      case 'PAUSA': return 'bg-amber-500/15 text-amber-450 border border-amber-500/25';
      case 'RETORNO': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25';
      case 'PRESENCA_OPERACIONAL': return 'bg-purple-500/15 text-purple-400 border border-purple-500/25';
      default: return 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/25';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'ENTRADA': return <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />;
      case 'SAIDA': return <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />;
      case 'PAUSA': return <Pause className="w-3.5 h-3.5 text-amber-400 font-bold" />;
      case 'RETORNO': return <Play className="w-3.5 h-3.5 text-cyan-400" />;
      default: return <Clock className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-[#070707] min-h-screen text-zinc-100">
      {/* Background design and layout heading */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-5">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-500" /> Ponto / Presença por NFC
          </h2>
          <p className="text-xs text-zinc-500 uppercase tracking-wide mt-1">
            Registro de entrada, saída, pausas e presença operacional com aproximação de crachá inteligente NFC
          </p>
        </div>
        
        {/* Terminal/Device selection */}
        <div className="flex items-center gap-2 bg-[#0e0e0e] border border-zinc-900 px-3 py-1.5 rounded-xl self-start md:self-auto">
          <TerminalIcon className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="text-left font-sans">
            <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">TERMINAL ATIVO</span>
            <select 
              value={activeTerminal} 
              onChange={(e) => setActiveTerminal(e.target.value)}
              className="bg-transparent border-none text-[10.5px] font-bold text-white uppercase tracking-wider focus:outline-none focus:ring-0 cursor-pointer text-ellipsis w-48 mt-0.5"
            >
              <option value="Terminal Portaria A" className="bg-[#101010] text-zinc-300">Terminal Portaria A</option>
              <option value="Terminal Almoxarifado B" className="bg-[#101010] text-zinc-300">Terminal Almoxarifado B</option>
              <option value="Terminal Administrativo" className="bg-[#101010] text-zinc-300">Terminal Administrativo</option>
              <option value="PDV Coletor Móvel" className="bg-[#101010] text-zinc-300">PDV Coletor Móvel</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* REGISTRADOR DE PONTO (PAINEL FÍSICO / SIMULADOR) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
            {/* Status light */}
            <div className="absolute top-5 right-5 flex items-center gap-1.5 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[8px] font-black uppercase rounded-full tracking-widest animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
              Aguardando Leitura
            </div>
            
            <h3 className="text-sm font-black text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Wifi className="w-4.5 h-4.5 text-indigo-505" /> Painel de Registro (NFC Wedge)
            </h3>
            
            {/* Event Type selector button group */}
            <div className="space-y-2 mb-5">
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-1">Passo 1: Selecione o Tipo de Evento</span>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setSelectedEventType('ENTRADA')}
                  className={`py-3 px-4 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    selectedEventType === 'ENTRADA' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-black shadow-lg shadow-emerald-950/10' 
                      : 'bg-zinc-950/50 text-zinc-500 border-transparent hover:bg-zinc-900'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 shrink-0" />
                  Entrada
                </button>
                <button 
                  onClick={() => setSelectedEventType('SAIDA')}
                  className={`py-3 px-4 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    selectedEventType === 'SAIDA' 
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30 font-black shadow-lg shadow-rose-950/10' 
                      : 'bg-zinc-950/50 text-zinc-500 border-transparent hover:bg-zinc-900'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4 shrink-0" />
                  Saída
                </button>
                <button 
                  onClick={() => setSelectedEventType('PAUSA')}
                  className={`py-3 px-4 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    selectedEventType === 'PAUSA' 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 font-black shadow-lg shadow-amber-950/10' 
                      : 'bg-zinc-950/50 text-zinc-500 border-transparent hover:bg-zinc-900'
                  }`}
                >
                  <Pause className="w-4 h-4 shrink-0" />
                  Pausa
                </button>
                <button 
                  onClick={() => setSelectedEventType('RETORNO')}
                  className={`py-3 px-4 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    selectedEventType === 'RETORNO' 
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 font-black shadow-lg shadow-cyan-950/10' 
                      : 'bg-zinc-950/50 text-zinc-500 border-transparent hover:bg-zinc-900'
                  }`}
                >
                  <Play className="w-4 h-4 shrink-0" />
                  Retorno
                </button>
              </div>

              <div className="pt-1.5">
                <button 
                  onClick={() => setSelectedEventType('PRESENCA_OPERACIONAL')}
                  className={`w-full py-3 px-4 rounded-xl text-[10.5px] font-black uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    selectedEventType === 'PRESENCA_OPERACIONAL' 
                      ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 font-black shadow-lg shadow-purple-950/10' 
                      : 'bg-zinc-950/50 text-zinc-500 border-transparent hover:bg-zinc-900'
                  }`}
                >
                  <Clock className="w-4 h-4 shrink-0" />
                  Presença Operacional
                </button>
              </div>
            </div>

            {/* Simulated approach tag section */}
            <div className={"border-t border-zinc-900 pt-5 space-y-4 " + (!(environmentService.isDevMode() || environmentService.isTestEnvironment()) ? "hidden" : "")}>
              <div className="space-y-1">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">Passo 2 (Simulado): Testar Sem Crachá Físico</span>
                <p className="text-[9.5px] text-zinc-650 font-normal leading-relaxed">
                  Caso não possua um hardware NFC integrado, selecione um colaborador ativo abaixo para enviar uma aproximação simulada de sua Tag NFC vinculada.
                </p>
              </div>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <select 
                    value={selectedSimulatedUserId} 
                    onChange={(e) => setSelectedSimulatedUserId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-3 text-xs text-white focus:outline-none focus:border-zinc-700 font-semibold"
                  >
                    <option value="">-- Selecione o Colaborador --</option>
                    {users.filter(u => u.status === 'ativo').map(u => {
                      const tag = nfcTags.find(t => t.id === u.nfcTagId || t.usuarioVinculado === u.id);
                      const hasTag = !!tag;
                      return (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.roleId || 'Funcional'}) {!hasTag ? '⚠️ Sem Tag' : `✅ (${tag.uid})`}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button 
                  onClick={handleSimulateTagApproach}
                  className="px-5 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-1.5 select-none"
                >
                  <Tag className="w-4 h-4" />
                  Aproximar Tag
                </button>
              </div>
            </div>

            {/* Direct Input fallback */}
            <form onSubmit={handleManualUidSubmit} className={"border-t border-zinc-900 pt-5 mt-5 " + (!(environmentService.isDevMode() || environmentService.isTestEnvironment()) ? "hidden" : "")}>
              <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Alternativa: Digitar código UID da Tag manualmente</span>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={manualUid}
                  onChange={(e) => setManualUid(e.target.value)}
                  placeholder="Ex: AB:CD:12:34"
                  className="flex-1 bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-zinc-750 font-mono tracking-widest"
                />
                <button 
                  type="submit"
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold px-4 py-2 text-xs rounded-xl transition-all cursor-pointer"
                >
                  Registrar
                </button>
              </div>
            </form>
          </div>

          {/* DYNAMIC CONFIRMATION FEEDBACK */}
          <AnimatePresence mode="wait">
            {presenceFeedback && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className={`rounded-3xl border p-5 flex flex-col items-center text-center space-y-3 relative overflow-hidden ${
                  presenceFeedback.status === 'success' 
                    ? 'bg-emerald-950/10 border-emerald-500/20 text-emerald-400' 
                    : 'bg-rose-950/10 border-rose-500/20 text-rose-450'
                }`}
              >
                {presenceFeedback.status === 'success' ? (
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-450">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                )}
                
                <div className="space-y-0.5">
                  <h4 className="text-sm font-black uppercase tracking-wider">{presenceFeedback.message}</h4>
                  <p className="text-xs font-black text-white">{presenceFeedback.employeeName}</p>
                </div>

                {presenceFeedback.status === 'success' && presenceFeedback.eventType && (
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getEventBadgeColor(presenceFeedback.eventType)}`}>
                    {presenceFeedback.eventType}
                  </span>
                )}

                <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-mono">
                  {format(presenceFeedback.timestamp || Date.now(), "dd 'de' MMMM 'às' HH:mm:ss", { locale: ptBR })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* STATUS DIÁRIO DE PONTO DOS ATIVOS */}
        <div className="lg:col-span-7 bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-5 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <User2 className="w-4.5 h-4.5 text-emerald-450" /> Monitoramento de Ponto (Hoje)
            </h3>
            <span className="text-[9px] font-black font-semibold text-zinc-400 font-mono tracking-widest bg-zinc-950 py-1 px-2.5 rounded-full border border-zinc-900">
              {format(Date.now(), 'dd/MM/yyyy')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-900 text-[8.5px] font-black text-zinc-500 uppercase tracking-widest">
                  <th className="pb-3 pl-2">Colaborador</th>
                  <th className="pb-3 text-center">Entrada</th>
                  <th className="pb-3 text-center">Pausa</th>
                  <th className="pb-3 text-center">Retorno</th>
                  <th className="pb-3 text-center">Saída</th>
                  <th className="pb-3 pr-2 text-right">Último Evento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/40">
                {dailyCollabStatus.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-zinc-650 uppercase tracking-wider text-[10px]">
                      Nenhum colaborador ativo cadastrado no sistema.
                    </td>
                  </tr>
                ) : (
                  dailyCollabStatus.map(status => (
                    <tr key={status.user.id} className="hover:bg-white/[0.01] transition-all">
                      <td className="py-3.5 pl-2">
                        <div className="flex flex-col text-left">
                          <span className="font-bold text-white uppercase tracking-wider text-[10.5px]">{status.user.fullName}</span>
                          <span className="text-[8.5px] text-zinc-500 uppercase tracking-widest font-mono mt-0.5">{status.user.cargo || 'OPERADOR'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 text-center font-mono text-[10.5px]">
                        {status.entrada ? (
                          <span className="text-emerald-400 font-bold">{status.entrada}</span>
                        ) : (
                          <span className="text-zinc-700">--:--</span>
                        )}
                      </td>
                      <td className="py-3.5 text-center font-mono text-[10.5px]">
                        {status.pausa ? (
                          <span className="text-amber-500 font-bold">{status.pausa}</span>
                        ) : (
                          <span className="text-zinc-700">--:--</span>
                        )}
                      </td>
                      <td className="py-3.5 text-center font-mono text-[10.5px]">
                        {status.retorno ? (
                          <span className="text-cyan-400 font-bold">{status.retorno}</span>
                        ) : (
                          <span className="text-zinc-700">--:--</span>
                        )}
                      </td>
                      <td className="py-3.5 text-center font-mono text-[10.5px]">
                        {status.saida ? (
                          <span className="text-rose-400 font-bold">{status.saida}</span>
                        ) : (
                          <span className="text-zinc-700">--:--</span>
                        )}
                      </td>
                      <td className="py-3.5 pr-2 text-right">
                        {status.ultimoEvento ? (
                          <span className="text-[9px] font-black uppercase text-emerald-400 bg-emerald-500/5 px-2 py-0.5 border border-emerald-500/10 rounded-md">
                            {status.ultimoEvento}
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase text-zinc-500 tracking-wider">Sem Registro</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* QUADRO GERAL / HISTORICO DE PONTOS */}
      <div className="bg-[#0e0e0e] border border-zinc-900 rounded-3xl p-5 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-900 pb-4">
          <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4.5 h-4.5 text-indigo-400" /> Histórico de Presença do Dia / Filtros
          </h3>
          
          {/* Real-time search filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Collab filter dropdown */}
            <div className="flex items-center gap-1.5 bg-[#070707] border border-zinc-850 px-2.5 py-1 rounded-xl">
              <User2 className="w-3.5 h-3.5 text-zinc-500" />
              <select 
                value={filterUser} 
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-wider text-white focus:ring-0 focus:outline-none cursor-pointer w-40"
              >
                <option value="" className="bg-[#101010] text-[#71717a]">TODOS OPERADORES</option>
                {users.map(u => (
                  <option key={u.id} value={u.id} className="bg-[#101010] text-zinc-300">{u.fullName}</option>
                ))}
              </select>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-1.5 bg-[#070707] border border-zinc-850 px-2.5 py-1 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-zinc-500" />
              <input 
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-wider text-white focus:ring-0 focus:outline-none w-28 cursor-pointer"
              />
            </div>

            {/* Event code list filter */}
            <div className="flex items-center gap-1.5 bg-[#070707] border border-zinc-850 px-2.5 py-1 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-zinc-500" />
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-wider text-white focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="TODOS" className="bg-[#101010] text-[#71717a]">TODOS EVENTOS</option>
                <option value="ENTRADA" className="bg-[#101010] text-zinc-300">ENTRADA</option>
                <option value="SAIDA" className="bg-[#101010] text-zinc-300">SAIDA</option>
                <option value="PAUSA" className="bg-[#101010] text-zinc-300">PAUSA</option>
                <option value="RETORNO" className="bg-[#101010] text-zinc-300">RETORNO</option>
                <option value="PRESENCA_OPERACIONAL" className="bg-[#101010] text-zinc-300">PRESENÇA OPERACIONAL</option>
              </select>
            </div>
          </div>
        </div>

        {/* LOG HISTORY GRID/TABLE */}
        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-900 text-[8.5px] font-black text-zinc-500 uppercase tracking-widest sticky top-0 bg-[#0e0e0e] z-10 pb-2">
                <th className="pb-3 pl-2">Horário</th>
                <th className="pb-3">Funcionário</th>
                <th className="pb-3">Cargo/Função</th>
                <th className="pb-3 text-center">Código da Tag</th>
                <th className="pb-3 text-center">Tipo de Ponto</th>
                <th className="pb-3 pr-2 text-right">Dispositivo/Terminal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/40">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-zinc-500 uppercase tracking-wider text-[10px] font-bold">
                    Nenhum registro encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(record => (
                  <tr key={record.id} className="hover:bg-white/[0.01] transition-all">
                    <td className="py-3.5 pl-2 font-mono text-zinc-400">
                      {format(record.timestamp, 'HH:mm:ss')}
                    </td>
                    <td className="py-3.5 font-bold uppercase tracking-wide text-white text-[11px]">
                      {record.userFullName}
                    </td>
                    <td className="py-3.5 text-zinc-500 uppercase tracking-widest font-mono text-[9px]">
                      {users.find(u => u.id === record.userId)?.roleId || 'OPERADOR'}
                    </td>
                    <td className="py-3.5 text-center font-mono text-[10px] text-zinc-400">
                      <code>{record.nfcUid}</code>
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center justify-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1 leading-none ${getEventBadgeColor(record.tipoEvento)}`}>
                          {getEventIcon(record.tipoEvento)}
                          <span>{record.tipoEvento}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 pr-2 text-right font-mono text-zinc-500 text-[9.5px]">
                      {record.device || 'Terminal'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
