import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { 
  Tv, 
  Clock, 
  ChefHat, 
  CheckCircle2, 
  Volume2, 
  VolumeX, 
  Minimize, 
  Maximize,
  ShieldAlert,
  Play,
  Pause,
  AlertTriangle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function EmProducaoTv() {
  const sales = useStore((state) => state.sales);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Time state for the high contrast header clock
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('pt-BR'));

  // Dictionary mapping completed order ID to timestamp of when it was finished/first detected
  const [readyTimes, setReadyTimes] = useState<Record<string, number>>({});

  // Refs for tracking broadcast communication & container element
  const channelRef = useRef<BroadcastChannel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ref to hold the initially ready IDs to prevent sound alerts for existing items on reload
  const initializedReadyIds = useRef<Set<string>>(new Set());
  const hasPopulatedOnMount = useRef(false);

  useEffect(() => {
    // 1. Clock timer + tick update to drive countdowns smoothly
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('pt-BR'));
    }, 1000);

    // 2. Broadcast communication
    const channel = new BroadcastChannel('production-tv-channel');
    channelRef.current = channel;

    const token = Math.random().toString(36).substring(7);
    sessionStorage.setItem('tv_token', token);

    channel.postMessage({ type: 'TV_PING', token });

    channel.onmessage = (e) => {
      if (e.data) {
        if (e.data.type === 'TV_PING' && e.data.token !== token) {
          channel.postMessage({ type: 'TV_PONG', token });
        }
        if (e.data.type === 'TV_PONG' && e.data.token !== token) {
          setIsDuplicate(true);
        }
      }
    };

    return () => {
      clearInterval(clockInterval);
      channel.close();
    };
  }, []);

  // Web Audio Synth for custom non-blocked dual-tone chiming notifications
  const playReadyChime = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = audioCtx.currentTime;
      
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      // Industrial dual electronic synth chime
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.24); // G5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(261.63, now); // C4
      osc2.frequency.setValueAtTime(329.63, now + 0.12); // E4
      osc2.frequency.setValueAtTime(392.00, now + 0.24); // G4

      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.7);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.7);
      osc2.stop(now + 0.7);
    } catch (err) {
      console.warn('Synth trigger context blocked/inactive: ', err);
    }
  };

  // Populate initially ready orders on screen mount to bypass initial sounds
  useEffect(() => {
    if (!hasPopulatedOnMount.current && sales.length > 0) {
      sales
        .filter(sale => sale.productionStatus === 'finalizado')
        .forEach(sale => {
          initializedReadyIds.current.add(sale.id);
        });
      hasPopulatedOnMount.current = true;
    }
  }, [sales]);

  // Monitor updates to track new completed states & trigger a single audio alert
  useEffect(() => {
    const activeFinishedSales = sales.filter(sale => sale.productionStatus === 'finalizado');
    let triggerAlert = false;

    activeFinishedSales.forEach(sale => {
      // If we already went through load, any unrecorded finished ID is a true transition
      if (hasPopulatedOnMount.current && !initializedReadyIds.current.has(sale.id)) {
        initializedReadyIds.current.add(sale.id);
        triggerAlert = true;
      }
    });

    if (triggerAlert) {
      playReadyChime();
    }
  }, [sales]);

  // Track exact entry time for finished sales to support 30 second auto-cleanup
  useEffect(() => {
    const finishedSales = sales.filter(s => s.productionStatus === 'finalizado');
    
    setReadyTimes(prev => {
      const updated = { ...prev };
      let changed = false;
      const now = Date.now();
      
      finishedSales.forEach(s => {
        if (!updated[s.id]) {
          updated[s.id] = now;
          changed = true;
        }
      });
      
      return changed ? updated : prev;
    });
  }, [sales]);

  // Filters and sorting rules
  const activeProduction = sales.filter(sale => sale.status === 'em_producao');
  
  // Preparing List: orders whose substatus !== 'finalizado'
  const preparingOrdersRaw = activeProduction.filter(
    sale => !sale.productionStatus || sale.productionStatus !== 'finalizado'
  );

  // Status weight logic for intelligent priority sorting
  // 1: producing (produzindo) -> first
  // 2: in queue (em_fila) -> second
  // 3: paused (pausado) -> third
  const getSubstatusWeight = (status: string) => {
    switch (status) {
      case 'produzindo': return 1;
      case 'em_fila': return 2;
      case 'pausado': return 3;
      default: return 4;
    }
  };

  // Sorted list of active production items
  const sortedPreparingOrders = [...preparingOrdersRaw].sort((a, b) => {
    const wA = getSubstatusWeight(a.productionStatus || 'em_fila');
    const wB = getSubstatusWeight(b.productionStatus || 'em_fila');
    if (wA !== wB) return wA - wB; // Sort by status type first

    // Tie-breaker 1: order priority (High/Alta -> Medium/Média -> Low/Baixa)
    const pWeight = { alta: 1, media: 2, baixa: 3 };
    const pA = pWeight[a.productionPriority || 'media'] || 2;
    const pB = pWeight[b.productionPriority || 'media'] || 2;
    if (pA !== pB) return pA - pB;

    // Tie-breaker 2: oldest order is placed higher to prevent assembly bottleneck
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  // Ready List: finalizado items visible only for 30s. Sort descending (newest on top)
  const now = Date.now();
  const visibleReadyOrders = sales
    .filter(sale => sale.productionStatus === 'finalizado')
    .filter(sale => {
      const recordTime = readyTimes[sale.id];
      if (!recordTime) return true; // Keep visible if timestamp is pending registration
      return now - recordTime < 30000; // Stay visible for exactly 30 seconds
    })
    .sort((a, b) => {
      const timeA = readyTimes[a.id] || a.timestamp || 0;
      const timeB = readyTimes[b.id] || b.timestamp || 0;
      return timeB - timeA;
    });

  // Simple Fullscreen controller
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Fullscreen request rejected: ', err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  if (isDuplicate) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-red-950/40 border border-red-500/30 flex items-center justify-center animate-bounce">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <div className="space-y-2 max-w-md">
          <h1 className="text-xl font-black text-white uppercase tracking-wider">Painel Duplicado</h1>
          <p className="text-xs text-zinc-400 uppercase tracking-widest leading-relaxed font-semibold">
            Uma instância ativa do Painel de Transmissão de Produção já está rodando nesta rede/máquina para evitar flickering e interferência.
          </p>
        </div>
        <button
          onClick={() => setIsDuplicate(false)}
          className="bg-zinc-150 text-zinc-950 py-3 px-6 rounded-xl text-xs font-black uppercase cursor-pointer hover:bg-white transition-all transform active:scale-95"
          id="force-display-btn"
        >
          Forçar Exibição Mesmo Assim
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-black select-none overflow-hidden flex flex-col text-white font-sans"
      id="production-tv-canvas"
    >
      {/* High Contrast Top Header Panel */}
      <header className="h-24 bg-zinc-950 border-b border-white/10 px-10 flex justify-between items-center shrink-0 shadow-[0_4px_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <ChefHat className="w-8 h-8 text-amber-500 animate-pulse" />
          </div>
          <div>
            <h1 className="text-[24px] font-black tracking-[0.25em] text-white uppercase leading-none">
              NEXA PRODUÇÃO
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[10px] text-zinc-400 uppercase tracking-[0.15em] font-bold">
                PROD-TV RECEPTOR ATIVO
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Clock and Controls */}
        <div className="flex items-center gap-8">
          <div className="bg-zinc-900 border border-white/5 py-1.5 px-6 rounded-2xl shadow-inner">
            <span className="text-[32px] font-mono font-bold text-white tracking-widest">
              {currentTime}
            </span>
          </div>

          <div className="flex items-center gap-3 border-l border-white/10 pl-8">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-300 ${
                soundEnabled 
                  ? 'bg-amber-600/15 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]' 
                  : 'bg-zinc-900/50 border-white/5 text-zinc-650'
              }`}
              title={soundEnabled ? 'Silenciar alertas' : 'Ativar alertas sonoros'}
              id="sound-switch"
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-3.5 rounded-2xl border border-white/10 bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer transition-all duration-300 hover:scale-105"
              title="Tela cheia"
              id="fullscreen-toggle"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid System */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 p-10 overflow-hidden bg-[#050505]">
        
        {/* LEFT COMPARTMENT (COL 1 to 7): ACTIVE PRODUCTION QUEUE */}
        <section className="lg:col-span-7 bg-[#0b0c0e] border border-white/5 rounded-3xl p-8 flex flex-col overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          
          <div className="flex justify-between items-center pb-5 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3.5">
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
              <h2 className="text-[22px] font-black uppercase tracking-widest text-amber-500">
                LISTA DE PRODUÇÃO / FABRICANDO
              </h2>
            </div>
            <div className="bg-zinc-950 px-4.5 py-1.5 border border-white/10 rounded-xl">
              <span className="text-sm font-mono font-black text-zinc-300">
                {sortedPreparingOrders.length} PEDIDOS ATIVOS
              </span>
            </div>
          </div>

          {sortedPreparingOrders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-950 border border-white/5 rounded-full flex items-center justify-center animate-pulse">
                <ChefHat className="w-10 h-10 text-zinc-650" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black">Nenhum produto sob fabricação ativa</p>
              <span className="text-[10px] text-zinc-650 uppercase font-bold tracking-widest">Aguardando envios via PDV ou Totem</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto mt-6 pr-1 space-y-4 max-h-[calc(100vh-270px)] scrollbar-thin">
              <AnimatePresence mode="popLayout">
                {sortedPreparingOrders.map((order) => {
                  const subStatus = order.productionStatus || 'em_fila';
                  const priority = order.productionPriority || 'media';

                  // Apply visual styles driven by individual subprocess flags
                  let statusGlowStyle = "";
                  let tagStyle = "";
                  let statusLabel = "";
                  let timerPulse = false;

                  if (subStatus === 'produzindo') {
                    statusGlowStyle = "border-sky-500/45 bg-[#0f172a]/60 shadow-[rgba(14,165,233,0.1)_0px_8px_24px,inset_rgba(14,165,233,0.05)_0px_1px_3px] ring-1 ring-sky-500/20";
                    tagStyle = "bg-sky-500/20 text-sky-400 border border-sky-400/30 animate-pulse";
                    statusLabel = "FABRICANDO";
                    timerPulse = true;
                  } else if (subStatus === 'pausado') {
                    statusGlowStyle = "border-amber-500/40 bg-amber-950/20 shadow-[rgba(245,158,11,0.08)_0px_4px_16px] ring-1 ring-amber-500/10";
                    tagStyle = "bg-amber-500/20 text-amber-500 border border-amber-500/30";
                    statusLabel = "PAUSADO";
                  } else {
                    // em_fila: neutral slate
                    statusGlowStyle = "border-white/5 bg-zinc-900/40";
                    tagStyle = "bg-zinc-800 text-zinc-400 border border-white/5";
                    statusLabel = "EM FILA";
                  }

                  // Priority level highlighted indicator
                  const isHighPriority = priority === 'alta';

                  return (
                    <motion.div
                      key={order.id}
                      layoutId={`tv-${order.id}`}
                      initial={{ opacity: 0, x: -25 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      className={`p-6 rounded-2xl border transition-all duration-300 ${statusGlowStyle}`}
                    >
                      {/* Card grid structure */}
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="flex items-center gap-4">
                          <span className="text-[32px] font-mono font-black tracking-tight text-white leading-none">
                            #{order.orderNumber}
                          </span>
                          <span className={`text-[10px] font-black tracking-widest px-2.5 py-1 rounded-md ${
                            order.origin === 'Totem' ? 'bg-amber-600/15 text-amber-400' : 'bg-emerald-600/15 text-emerald-400'
                          }`}>
                            {order.origin || 'PDV'}
                          </span>
                        </div>

                        {/* Badges container */}
                        <div className="flex flex-wrap items-center gap-2">
                          {isHighPriority && (
                            <span className="bg-red-500/20 text-red-500 text-[9px] font-black tracking-widest uppercase px-2.5 py-1 rounded-md border border-red-500/30 animate-pulse">
                              🔥 URGENTE
                            </span>
                          )}
                          <span className={`text-[10px] font-black tracking-[0.15em] uppercase px-3 py-1 rounded-md flex items-center gap-1.5 ${tagStyle}`}>
                            {subStatus === 'produzindo' && <Loader2 className="w-3 h-3 animate-spin" />}
                            {subStatus === 'pausado' && <Pause className="w-3 h-3" />}
                            {subStatus === 'em_fila' && <Clock className="w-3 h-3" />}
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                      {/* Client information */}
                      <div className="mt-4 flex justify-between items-end border-t border-white/[0.05] pt-3">
                        <div>
                          <span className="text-[9px] uppercase font-black tracking-widest text-[#66666e] block">Cliente</span>
                          <span className="text-lg font-black uppercase text-white/95 tracking-wide mt-0.5 block truncate max-w-[260px]">
                            {order.clientName || 'Consumidor Final'}
                          </span>
                        </div>

                        <div className="text-right font-mono text-[10px] text-zinc-500">
                          <span>Registrado às {order.timestamp ? new Date(order.timestamp).toLocaleTimeString('pt-BR') : 'Agora'}</span>
                        </div>
                      </div>

                      {/* Beautiful highly-legible list of items in the order */}
                      <div className="mt-4 bg-black/50 p-4 rounded-xl border border-white/[0.04]">
                        <div className="text-[9px] uppercase font-black text-zinc-500 tracking-widest mb-2 border-b border-white/[0.02] pb-1">
                          Componentes do Pedido ({order.items.length})
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                          {order.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center text-zinc-300 text-sm font-semibold truncate">
                              <span className="text-amber-500 font-extrabold font-mono text-[15px] mr-2 shrink-0">x{item.quantity}</span>
                              <span className="uppercase tracking-wide truncate max-w-[200px]">{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Display custom manufacturing/production notes */}
                      {order.productionNotes && (
                        <div className="mt-3.5 bg-amber-500/5 p-3 rounded-xl border border-amber-500/15 text-[11px] text-zinc-400 flex gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5 animate-bounce" />
                          <p className="leading-relaxed">
                            <strong className="text-amber-500 uppercase tracking-widest font-black mr-1">[!] INSTRUÇÃO DETALHADA:</strong> 
                            {order.productionNotes}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* RIGHT COMPARTMENT (COL 8 to 12): HIGH CONTRAST PICKUP CORNER WITH 30S CLEANUP */}
        <section className="lg:col-span-5 bg-[#080d0a] border border-emerald-500/10 rounded-3xl p-8 flex flex-col overflow-hidden shadow-[0_12px_45px_rgba(16,185,129,0.06)]">
          
          <div className="flex justify-between items-center pb-5 border-b border-emerald-500/20 shrink-0">
            <div className="flex items-center gap-3.5">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
              <h2 className="text-[22px] font-black uppercase tracking-widest text-emerald-400">
                PRONTO / READY PICKUP
              </h2>
            </div>
            <div className="bg-emerald-950/40 px-4.5 py-1.5 border border-emerald-500/30 rounded-xl">
              <span className="text-sm font-mono font-black text-emerald-400">
                {visibleReadyOrders.length} CONCLUÍDOS
              </span>
            </div>
          </div>

          {visibleReadyOrders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-950 border border-white/5 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-zinc-850" />
              </div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold">Sem pedidos prontos na tela</p>
              <span className="text-[10px] text-zinc-650 uppercase font-semibold tracking-wider">Finalize um produto no painel de controle</span>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto mt-6 pr-1 space-y-5 max-h-[calc(100vh-270px)] scrollbar-thin">
              <AnimatePresence>
                {visibleReadyOrders.map((order) => {
                  const finishedAt = readyTimes[order.id];
                  const elapsedMs = finishedAt ? now - finishedAt : 0;
                  const secondsLeft = Math.max(0, Math.ceil((30000 - elapsedMs) / 1000));
                  
                  // Compute dynamic linear progress width representing time-to-decay
                  const progressPct = Math.min(100, Math.max(0, (secondsLeft / 30) * 100));

                  return (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, scale: 0.9, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, x: 100, transition: { duration: 0.3 } }}
                      className="p-6 rounded-2xl bg-zinc-950 border-2 border-emerald-500/40 block relative overflow-hidden shadow-[0_0_25px_rgba(16,185,129,0.12)]"
                    >
                      {/* Top section: Ready Emblem & Number */}
                      <div className="flex justify-between items-center">
                        <span className="text-[46px] font-mono font-black text-white leading-none">
                          #{order.orderNumber}
                        </span>
                        <span className="bg-emerald-500 text-black text-[10px] font-black tracking-widest px-3 py-1.5 rounded-md flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[3]" /> PRONTO
                        </span>
                      </div>

                      {/* Client row */}
                      <div className="mt-4 border-t border-emerald-500/10 pt-3">
                        <span className="text-[9px] uppercase font-bold text-emerald-500/60 tracking-wider block">Cliente para Retirada</span>
                        <span className="text-xl font-black uppercase text-emerald-400 tracking-wider block mt-0.5 truncate max-w-[280px]">
                          {order.clientName || 'Consumidor Final'}
                        </span>
                      </div>

                      <div className="mt-4 text-zinc-550 flex justify-between items-center text-[10px] font-mono bg-black/40 p-2.5 rounded-lg border border-emerald-500/5">
                        <span className="uppercase text-[8px] font-black tracking-widest">Removendo da TV em:</span>
                        <span className="text-emerald-400 font-bold font-mono animate-pulse">{secondsLeft}s</span>
                      </div>

                      {/* Visual fading progress bar indicating 30s auto-cleaning decay state */}
                      <div className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-1000" style={{ width: `${progressPct}%` }} />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </section>

      </main>

      {/* Underbar footer metadata log */}
      <footer className="h-10 bg-black border-t border-white/10 px-10 flex justify-between items-center text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-mono shrink-0">
        <span>SISTEMA DE TRANSMISSÃO AUTÔNOMO</span>
        <span className="text-[#3b82f6] font-bold">NEXA CANAL SINCRONIZADO</span>
      </footer>
    </div>
  );
}
