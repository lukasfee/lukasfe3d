import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { networkService } from '../services/networkService';
import { syncService } from '../services/syncService';
import { cn } from '../lib/utils';
import { 
  Wifi, 
  WifiOff,
  Smartphone, 
  ArrowLeft, 
  QrCode, 
  RefreshCw, 
  ShieldCheck, 
  Activity,
  AlertCircle,
  CheckCircle2,
  X,
  Lock,
  Loader,
  Play,
  Trash2,
  Check
} from 'lucide-react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { feedback } from '../lib/feedback';

interface LocalServerConnectionProps {
  onBack?: () => void;
  onConnected?: () => void;
}

export default function LocalServerConnection({ onBack, onConnected }: LocalServerConnectionProps) {
  const localNetwork = useStore((state) => state.localNetwork);
  const updateLocalNetworkStatus = useStore((state) => state.updateLocalNetworkStatus);
  
  const [ip, setIp] = useState(localNetwork.remoteServer?.ip || '');
  const [port, setPort] = useState(localNetwork.remoteServer?.port.toString() || '3100');
  const [deviceName, setDeviceName] = useState(localNetwork.remoteServer?.deviceName || '');
  const [pinInput, setPinInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPairing, setPendingPairing] = useState(false);
  const [pairingMessage, setPairingMessage] = useState<string | null>(null);

  // Poll status when pairing is pending
  useEffect(() => {
    let intervalId: any = null;
    if (pendingPairing && ip && port) {
      intervalId = setInterval(async () => {
        try {
          const finalPort = parseInt(port);
          const data = await networkService.checkPairingStatus(ip, finalPort);
          if (data.success) {
            if (data.status === 'trusted') {
              setPendingPairing(false);
              setPairingMessage('Dispositivo Pareado e Autorizado! Estabelecendo conexão...');
              clearInterval(intervalId);
              
              // Trigger final connection
              setTimeout(() => {
                handleConnect(ip, finalPort);
              }, 1000);
            } else if (data.status === 'blocked') {
              setPendingPairing(false);
              setPairingMessage(null);
              setError('Sua solicitação de pareamento foi recusada ou o dispositivo foi bloqueado.');
              clearInterval(intervalId);
              updateLocalNetworkStatus({ connectionStatus: 'error' });
            }
          }
        } catch (err) {
          // Ignore connection / poll failures quietly
        }
      }, 2000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [pendingPairing, ip, port]);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { 
          fps: 30, 
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: false
          }
        },
        /* verbose= */ false
      );

      scanner.render((decodedText) => {
        try {
          const url = new URL(decodedText);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            feedback.success();
            setIp(url.hostname);
            setPort(url.port || '80');
            const qrPin = url.searchParams.get('pin') || '';
            if (qrPin) {
              setPinInput(qrPin);
            }
            scanner.clear();
            setIsScanning(false);
            
            // Trigger connection with extra parameter PIN extracted from QR Code
            setTimeout(() => {
              const finalPort = parseInt(url.port || '80');
              const finalIp = url.hostname;
              const hasTokenKey = `local_sync_token_${finalIp}_${finalPort}`;
              const hasTokenVal = !!localStorage.getItem(hasTokenKey);
              
              updateLocalNetworkStatus({ 
                connectionStatus: 'connecting',
                mode: 'client',
                remoteServer: { ip: finalIp, port: finalPort, deviceName: deviceName || 'Celular' }
              });

              if (!hasTokenVal && qrPin) {
                 setPairingMessage('Pareando automaticamente através do QR Code...');
                 networkService.requestPairing(finalIp, finalPort, qrPin, deviceName || 'Celular').then(response => {
                   if (response.success) {
                     if (response.status === 'trusted') {
                       networkService.verifyRemoteConnection().then(() => {
                         if (onConnected) onConnected();
                       });
                     } else if (response.status === 'pending') {
                       setPendingPairing(true);
                       setPairingMessage('Solicitação de Pareamento enviada! Aprove no painel do PC.');
                     }
                   } else {
                     setError(response.error || 'Falha no PIN extraído do QR Code.');
                     updateLocalNetworkStatus({ connectionStatus: 'error' });
                     setPairingMessage(null);
                   }
                 });
              } else {
                 handleConnect(finalIp, finalPort);
              }
            }, 100);

          } else {
            feedback.error();
            setError('QR Code inválido. Protocolo de transmissão inválido.');
          }
        } catch (e) {
          feedback.error();
          setError('QR Code inválido. Certifique-se de escanear o código de pareamento seguro gerado no PC Principal.');
        }
      }, (error) => {
        // Silent error for scanning
      });

      return () => {
        scanner.clear();
      };
    }
  }, [isScanning]);

  // Diagnostic and Testing States for Android Client
  const [isSimulatingOffline, setIsSimulatingOffline] = useState(false);
  const [clientTestLogs, setClientTestLogs] = useState<string[]>([]);
  const [checklistStatus, setChecklistStatus] = useState<Record<number, boolean>>({});
  const [clientTestProduct, setClientTestProduct] = useState<any>(null);

  const addClientTestLog = (message: string) => {
    setClientTestLogs(prev => [`[${new Date().toLocaleTimeString('pt-BR')}] ${message}`, ...prev]);
  };

  const handleTestClientConnection = async () => {
    const finalIp = ip || '127.0.0.1';
    const finalPort = parseInt(port) || 3100;
    addClientTestLog(`Iniciando ping de diagnóstico para o PC central em http://${finalIp}:${finalPort}...`);
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3000); // 3s timeout
      const res = await fetch(`http://${finalIp}:${finalPort}/api/health`, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        addClientTestLog(`SUCESSO COMPLETO: PC Central respondeu! Status: ${data.status} - ${data.message}`);
        setChecklistStatus(prev => ({ ...prev, 1: true, 6: true }));
      } else {
        addClientTestLog(`FALHA NO FIREWALL DA REDE: Resposta HTTP inválida do PC: ${res.status}`);
      }
    } catch (err: any) {
      addClientTestLog(`BLOQUEADO POR REDE/FIREWALL: Não foi possível estabelecer conexão física com o IP ${finalIp}. Verifique se PC e Celular estão no mesmo Wi-Fi de testes ou se o antivírus/diretiva de firewall do Windows está bloqueando conexões de entrada na porta ${finalPort}. Detalhes: ${err.message || err}`);
    }
  };

  const handleToggleSimulateOffline = () => {
    const nextSimState = !isSimulatingOffline;
    setIsSimulatingOffline(nextSimState);
    if (nextSimState) {
      addClientTestLog(`Modo Wi-Fi Desconectado (Simulado) ATIVADO. Todas as alterações locais em lote entrarão na fila offline de contingência.`);
    } else {
      addClientTestLog(`Modo Wi-Fi Desconectado DESATIVADO. Restabelecendo canal de sincronização direto...`);
      const offlineCount = useStore.getState().pendingSyncQueue.length;
      if (offlineCount > 0) {
        addClientTestLog(`Sincronização em Lote: ${offlineCount} itens de contingência encontrados. Encaminhando dados pendentes ao PC...`);
        syncService.triggerBidirectionalSync().then(() => {
          addClientTestLog(`SUCESSO DE TRANSMISSÃO: Fila offline transmitida com sucesso! Todos os tombstones e atualizações de produtos integrados no PC.`);
          setChecklistStatus(prev => ({ ...prev, 9: true }));
        }).catch((err) => {
          addClientTestLog(`Erro ao descarregar fila automática: ${err.message}`);
        });
      } else {
        addClientTestLog(`Canal reconectado com sucesso. Nenhuma pendência na fila offline detector.`);
      }
    }
  };

  const handleCreateClientTestProduct = () => {
    const state = useStore.getState();
    const id = 'prod-client-' + Date.now();
    const newProd = {
      id,
      name: `[TESTE ANDROID] Produto ${id.slice(-4)}`,
      price: 49.90,
      wholesalePrice: 39.90,
      costPrice: 25.00,
      code: "AND-" + id.slice(-4).toUpperCase(),
      stock: 12,
      minStock: 2,
      unit: "un",
      category: "Testes",
      active: true,
      lastUpdated: Date.now(),
      syncVersion: 1
    };
    
    if (isSimulatingOffline) {
       const mut: any = {
         entity: 'products',
         recordId: id,
         operation: 'u',
         data: newProd,
         timestamp: Date.now()
       };
       useStore.setState((prev) => ({
         products: [...prev.products, newProd],
         pendingSyncQueue: [...prev.pendingSyncQueue, mut]
       }));
       if (typeof window !== 'undefined' && (window as any).electron?.db) {
         (window as any).electron.db.insertSyncQueueItem(mut).catch((err: any) => {
           console.error('[SQLite] Error inserting simulated offline mutation:', err);
         });
       }
       addClientTestLog(`Item de simulação offline "${newProd.name}" adicionado. Salvo localmente, gravado na fila de contingência.`);
    } else {
       useStore.setState((prev) => ({
         products: [...prev.products, newProd]
       }));
       state.pushSyncMutation('products', id, 'u', newProd);
       addClientTestLog(`Operação Online: Produto criado localmente. Chamando pushSync...`);
       syncService.triggerBidirectionalSync().then(() => {
          addClientTestLog(`Sucesso: "${newProd.name}" sincronizado online!`);
          setChecklistStatus(prev => ({ ...prev, 8: true }));
       }).catch(err => {
          addClientTestLog(`Falha no push imediato: ${err.message}`);
       });
    }
    setClientTestProduct(newProd);
  };

  const handleTriggerConflictTest = () => {
    addClientTestLog("Simulador de Resolução de Conflitos (LWW - Last-Write-Wins)...");
    const state = useStore.getState();
    const currentProducts = state.products;
    const testItem = currentProducts.find(p => p.name.includes('[TESTE]')) || clientTestProduct;

    if (!testItem) {
      addClientTestLog("Erro: Crie um produto de teste primeiro (no PC ou no Celular) para conflitar.");
      return;
    }

    addClientTestLog(`Item alvo para concorrência de rede: "${testItem.name}"`);
    
    const olderEdit = {
      ...testItem,
      price: 250.00,
      lastUpdated: Date.now() - 5000,
      syncVersion: (testItem.syncVersion || 1) + 1,
      updatedBy: 'Android (Ação v1)'
    };

    const newerEdit = {
      ...testItem,
      price: 299.90,
      lastUpdated: Date.now(),
      syncVersion: (testItem.syncVersion || 1) + 1,
      updatedBy: 'PC Central (Ação v2)'
    };

    addClientTestLog(` -> Versão v1 (Mais antiga, celular): Preço R$ 250.00 às ${new Date(olderEdit.lastUpdated).toLocaleTimeString()}`);
    addClientTestLog(` -> Versão v2 (Mais nova, PC Central): Preço R$ 299.90 às ${new Date(newerEdit.lastUpdated).toLocaleTimeString()}`);

    const changes = {
      products: [olderEdit, newerEdit]
    };

    addClientTestLog("Rodando algoritmo merger.applyIncomingSyncChanges()...");
    state.applyIncomingSyncChanges(changes);

    const winner = useStore.getState().products.find(p => p.id === testItem.id);
    if (winner) {
      addClientTestLog(`CONDOMÍNIO E CONFLITO PROCESSADOS. Vencedor (Mais Novo Wins): R$ ${winner.price} de autoria "${winner.updatedBy}".`);
    }
  };

  const handleClearClientTestProducts = () => {
    const state = useStore.getState();
    const testProducts = state.products.filter(p => p.name.includes('[TESTE]'));
    if (testProducts.length === 0 && !clientTestProduct) {
      addClientTestLog("Nenhum produto com rótulo ou prefixo [TESTE] encontrado.");
      return;
    }
    testProducts.forEach(p => {
      state.deleteProduct(p.id, 'Limpeza Celular');
    });
    if (clientTestProduct) {
      state.deleteProduct(clientTestProduct.id, 'Limpeza Celular');
    }
    setClientTestProduct(null);
    addClientTestLog("Limpeza executada. Todos os itens de teste deletados localmente com tombstones gerados.");
  };

  const handleConnect = async (targetIp?: string, targetPort?: number) => {
    const finalIp = targetIp || ip;
    const finalPort = targetPort || parseInt(port);
    const finalDeviceName = deviceName || 'Celular';

    if (!finalIp) {
      setError('Por favor, informe o endereço IP do servidor.');
      return;
    }

    setError(null);
    setPairingMessage(null);

    updateLocalNetworkStatus({ 
      connectionStatus: 'connecting',
      mode: 'client',
      remoteServer: { ip: finalIp, port: finalPort, deviceName: finalDeviceName }
    });

    const tokenKey = `local_sync_token_${finalIp}_${finalPort}`;
    const hasToken = !!localStorage.getItem(tokenKey);

    if (!hasToken && !pinInput) {
      setError('Pareamento Seguro Obrigatório: Por favor, insira o PIN temporário de 6 dígitos gerado no painel do PC Principal.');
      updateLocalNetworkStatus({ connectionStatus: 'error' });
      return;
    }

    if (!hasToken && pinInput) {
      setPairingMessage('Enviando solicitação de pareamento seguro para o PC Central...');
      const response = await networkService.requestPairing(finalIp, finalPort, pinInput, finalDeviceName);
      if (response.success) {
        if (response.status === 'trusted') {
          setPairingMessage('Dispositivo autorizado!');
        } else if (response.status === 'pending') {
          setPendingPairing(true);
          setPairingMessage('Solicitação registrada! Aprove no PC Central para liberar este dispositivo.');
          return;
        }
      } else {
        setError(response.error || 'Erro ao realizar pareamento. Verifique se o PIN é válido e não expirou.');
        updateLocalNetworkStatus({ connectionStatus: 'error' });
        setPairingMessage(null);
        return;
      }
    }

    try {
      await networkService.verifyRemoteConnection();
      
      const currentStatus = useStore.getState().localNetwork.connectionStatus;
      if (currentStatus === 'connected') {
        if (onConnected) onConnected();
      } else {
        const hasTokenNow = localStorage.getItem(tokenKey);
        if (hasTokenNow) {
          localStorage.removeItem(tokenKey);
          setError('Acesso revogado ou recusado pelo PC Central. Digite o novo PIN temporário para conectar.');
        } else {
          setError('Não foi possível conectar ao servidor. Verifique se o endereço IP está correto e se os aparelhos estão na mesma rede Wi-Fi.');
        }
        updateLocalNetworkStatus({ connectionStatus: 'error' });
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível conectar ao servidor local.');
      updateLocalNetworkStatus({ connectionStatus: 'error' });
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-[#0A0A0A] flex flex-col font-sans animate-in fade-in duration-300 overflow-y-auto">
      {/* Header */}
      <div className="h-16 border-b border-white/5 bg-black/40 backdrop-blur-md px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all border border-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Conectar ao PC</h1>
            <p className="text-[10px] text-emerald-500 uppercase font-black tracking-widest">Sincronização via Wi-Fi</p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 flex flex-col gap-8 max-w-lg mx-auto w-full">
        {/* Status Indicator */}
        <div className={cn(
          "p-6 rounded-[2rem] border animate-in slide-in-from-top-4 duration-500",
          localNetwork.connectionStatus === 'connected' ? "bg-emerald-500/10 border-emerald-500/20" :
          localNetwork.connectionStatus === 'connecting' ? "bg-blue-500/10 border-blue-500/20" :
          localNetwork.connectionStatus === 'error' ? "bg-red-500/10 border-red-500/20" :
          "bg-white/5 border-white/5"
        )}>
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              localNetwork.connectionStatus === 'connected' ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]" :
              localNetwork.connectionStatus === 'connecting' ? "bg-blue-500 text-white animate-pulse" :
              localNetwork.connectionStatus === 'error' ? "bg-red-500 text-white" :
              "bg-white/10 text-white/40"
            )}>
              {localNetwork.connectionStatus === 'connected' ? <ShieldCheck className="w-6 h-6" /> :
               localNetwork.connectionStatus === 'connecting' ? <RefreshCw className="w-6 h-6 animate-spin" /> :
               localNetwork.connectionStatus === 'error' ? <AlertCircle className="w-6 h-6" /> :
               <Smartphone className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-[10px] text-white/20 font-black uppercase tracking-[0.2em] mb-1">Status da Conexão</p>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">
                {localNetwork.connectionStatus === 'connected' ? 'Conectado à Matriz' :
                 localNetwork.connectionStatus === 'connecting' ? 'Tentando Conectar...' :
                 localNetwork.connectionStatus === 'error' ? 'Falha na Conexão' :
                 'Aguardando Link'}
              </h3>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => setIsScanning(true)}
            className="p-6 bg-white/5 border border-white/5 rounded-[2rem] flex flex-col items-center gap-3 group hover:bg-white/10 transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-colors">
              <QrCode className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-white uppercase tracking-widest">Escanear QR</span>
          </button>
          <div className="p-6 bg-white/5 border border-white/5 rounded-[2rem] flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40">
              <Wifi className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black text-white uppercase tracking-widest text-center">Mesma Rede Wi-Fi</span>
          </div>
        </div>

        {/* Manual Input */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-white/20 rounded-full" />
            <h3 className="text-[11px] font-black text-white/40 uppercase tracking-widest">Configuração Manual</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Endereço IP</label>
              <input 
                type="text"
                placeholder="Ex: 192.168.0.15"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Porta</label>
              <input 
                type="text"
                placeholder="3100"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">Identificação do Aparelho</label>
            <input 
              type="text"
              placeholder="Ex: Samsung S21 Vendas"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[9px] font-black text-white/20 uppercase tracking-widest ml-1">PIN temporário de pareamento</label>
              <span className="text-[8px] text-emerald-400 font-bold uppercase tracking-widest">Apenas se não pareado</span>
            </div>
            <div className="relative">
              <input 
                type="text"
                maxLength={6}
                placeholder="Ex: 582914"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 pl-12 text-sm tracking-[0.2em] font-mono font-bold text-emerald-400 placeholder:tracking-normal focus:outline-none focus:border-emerald-500/50 transition-all"
              />
              <Lock className="w-4 h-4 text-white/20 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {pairingMessage && (
            <div className={cn(
              "p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 text-xs font-bold uppercase tracking-tight",
              pendingPairing ? "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
            )}>
              {pendingPairing ? <Loader className="w-4 h-4 animate-spin shrink-0" /> : <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />}
              <p className="text-[10px] leading-relaxed font-bold tracking-wide">{pairingMessage}</p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-[10px] font-bold text-red-500 uppercase leading-relaxed">{error}</p>
            </div>
          )}

          <button 
            onClick={() => handleConnect()}
            disabled={localNetwork.connectionStatus === 'connecting'}
            className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 text-black font-black rounded-3xl text-[11px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 mt-4"
          >
            {localNetwork.connectionStatus === 'connecting' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {localNetwork.connectionStatus === 'connected' ? 'Reconectar Servidor' : 'Conectar Agora'}
          </button>
        </div>

        {/* PAINEL DE DIAGNÓSTICO DO SMARTPHONE/CELULAR (APK) */}
        <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Painel de Diagnóstico do Cliente</h4>
                <p className="text-[8px] text-white/30 uppercase font-bold tracking-widest mt-0.5">Diagnóstico local e ferramentas de contingência</p>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[7px] font-black uppercase text-blue-400 tracking-wider">
              Dispositivo Cliente
            </span>
          </div>

          {/* Status Grid info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[8px] text-white/30 uppercase font-black block">Status da Conexão</span>
              <span className={`text-[10px] font-mono font-bold flex items-center gap-1.5 mt-1 ${
                isSimulatingOffline 
                  ? "text-red-400" 
                  : localNetwork.connectionStatus === 'connected' 
                  ? "text-emerald-400" 
                  : "text-amber-400"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isSimulatingOffline 
                    ? "bg-red-400" 
                    : localNetwork.connectionStatus === 'connected' 
                    ? "bg-emerald-400 animate-pulse" 
                    : "bg-amber-400"
                }`} />
                {isSimulatingOffline ? 'Wi-Fi Desconectado' : localNetwork.connectionStatus === 'connected' ? 'Conectado no PC' : 'Desconectado'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[8px] text-white/30 uppercase font-black block">IP do Servidor</span>
              <span className="text-[10px] font-mono font-bold text-white mt-1 block truncate">
                {localNetwork.remoteServer?.ip || ip || 'IP Não Cadastrado'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[8px] text-white/30 uppercase font-black block">Chave de Pareamento</span>
              <span className="text-[10px] font-mono font-bold text-emerald-400 mt-1 block uppercase">
                {localStorage.getItem(`local_sync_token_${localNetwork.remoteServer?.ip || ip}_${localNetwork.remoteServer?.port || port}`) ? 'AUTENTICADO OK' : 'SEM PAREAMENTO'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <span className="text-[8px] text-white/30 uppercase font-black block">Fila Offline</span>
              <span className="text-[10px] font-mono font-bold text-white mt-1 block">
                {useStore.getState().pendingSyncQueue.length} pendências em lote
              </span>
            </div>
          </div>

          {/* Test Controls */}
          <div className="space-y-2.5">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Módulo de Teste de Sincronização Lote</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleTestClientConnection}
                className="py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all"
              >
                Testar Conexão
              </button>
              <button
                onClick={handleToggleSimulateOffline}
                className={cn(
                  "py-2.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all border",
                  isSimulatingOffline 
                    ? "bg-red-500/20 text-red-400 border-red-500/30" 
                    : "bg-white/5 hover:bg-white/10 text-white border-transparent"
                )}
              >
                {isSimulatingOffline ? 'Modo Wi-Fi: OFF' : 'Simular Wi-Fi OFF'}
              </button>
              <button
                onClick={handleCreateClientTestProduct}
                className="py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all"
              >
                Criar Item Teste
              </button>
              <button
                onClick={handleTriggerConflictTest}
                className="py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all"
              >
                Testar Conflito
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClearClientTestProducts}
                className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-[8px] font-bold uppercase tracking-wider transition-all"
              >
                Limpar Itens Teste
              </button>
              <button
                onClick={() => { setError(null); addClientTestLog("Lista de falhas limpa."); }}
                className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[8px] font-bold uppercase tracking-wider transition-all"
              >
                Limpar Logs
              </button>
            </div>
          </div>

          {/* Console de Log */}
          <div className="space-y-1">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Console de Resposta</span>
            <div className="p-3 bg-black/40 border border-white/5 rounded-2xl h-24 overflow-y-auto font-mono text-[9px] text-zinc-400 space-y-1.5 scrollbar-thin">
              {clientTestLogs.length === 0 ? (
                <span className="text-zinc-600 block italic">Pronto para rodar teste local de dados.</span>
              ) : (
                clientTestLogs.map((log, idx) => (
                  <div key={idx} className="leading-tight border-b border-white/[0.02] pb-1">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mobile checklist onboarding */}
          <div className="space-y-3 pt-2">
            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest block">Checklist Onboarding e rede</span>
            <div className="space-y-2">
              {[
                { id: 1, label: "Confirmar PC e celular no mesmo Wi-Fi", check: checklistStatus[1] },
                { id: 4, label: "Escanear QR Code ou digitar configurações", check: !!localNetwork.remoteServer },
                { id: 5, label: "Autorizar e aprovar smartphone no PC", check: !!localStorage.getItem(`local_sync_token_${localNetwork.remoteServer?.ip || ip}_${localNetwork.remoteServer?.port || port}`) },
                { id: 6, label: "Ping / Conectividade estabelecida", check: checklistStatus[6] || localNetwork.connectionStatus === 'connected' },
                { id: 8, label: "Sincronizar dados entre os aparelhos", check: checklistStatus[8] },
                { id: 9, label: "Fila contingência offline testada", check: checklistStatus[9] }
              ].map((item) => (
                <div 
                  key={item.id}
                  onClick={() => {
                    if (item.id === 1) {
                      setChecklistStatus(prev => ({ ...prev, 1: !prev[1] }));
                    }
                  }}
                  className="flex items-center justify-between gap-3 p-2 bg-white/[0.01] hover:bg-white/[0.02] rounded-xl border border-white/5 cursor-pointer selection:bg-transparent"
                >
                  <p className="text-[9px] font-bold text-white/70 uppercase">{item.id}. {item.label}</p>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    item.check 
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-400" 
                      : "bg-black/40 border-white/10 text-white/10"
                  }`}>
                    {item.check && <Check className="w-2 h-2 stroke-[4]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* QR Scanner Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-[400] bg-black flex flex-col">
          <div className="p-6 flex items-center justify-between">
            <h2 className="text-white font-black uppercase text-sm tracking-widest">Escanear QR Code</h2>
            <button 
              onClick={() => setIsScanning(false)}
              className="p-2 bg-white/10 rounded-full text-white"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div id="qr-reader" className="w-full max-w-md bg-white/5 rounded-3xl overflow-hidden border-2 border-emerald-500/30" />
            <p className="mt-8 text-[10px] text-white/40 uppercase font-black tracking-widest max-w-xs text-center">
              Posicione o QR Code exibido no PC dentro do quadro acima
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
