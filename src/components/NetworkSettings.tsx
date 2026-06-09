import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { networkService } from '../services/networkService';
import { cn } from '../lib/utils';
import { 
  Globe, 
  Shield, 
  RefreshCw, 
  Smartphone, 
  Laptop, 
  Share2, 
  Server, 
  QrCode, 
  Key, 
  Check, 
  X, 
  Trash2, 
  Edit2, 
  Lock, 
  Clock, 
  ShieldAlert, 
  History, 
  FileText,
  UserCheck,
  Activity
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getElectronBridge } from '../lib/environment';

interface NetworkSettingsProps {
  isEmbedded?: boolean;
}

export default function NetworkSettings({ isEmbedded = false }: NetworkSettingsProps) {
  const localNetwork = useStore((state) => state.localNetwork);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showQR, setShowQR] = useState(false);
  
  // Real Local Devices & Security PIN states
  const [devices, setDevices] = useState<any[]>([]);
  const [activePin, setActivePin] = useState<{ pin: string | null; expiresAt: number } | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isGeneratingPin, setIsGeneratingPin] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [pinTimeLeft, setPinTimeLeft] = useState<string>('');

  const [portInput, setPortInput] = useState(localNetwork.port?.toString() || '3100');
  const [isChangingPort, setIsChangingPort] = useState(false);

  useEffect(() => {
    if (localNetwork.port) {
      setPortInput(localNetwork.port.toString());
    }
  }, [localNetwork.port]);

  const handleChangePort = async () => {
    setIsChangingPort(true);
    const newPort = parseInt(portInput);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
      alert('Porta inválida! Digite um número entre 1024 e 65535.');
      setIsChangingPort(false);
      return;
    }
    useStore.getState().updateLocalNetworkStatus({ port: newPort });
    await networkService.startLocalServer();
    await loadNetworkSecurityInfo();
    setIsChangingPort(false);
  };

  // Diagnostic states
  const [testProduct, setTestProduct] = useState<any>(null);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [checklistStatus, setChecklistStatus] = useState<Record<number, boolean>>({});

  const addTestLog = (message: string) => {
    setTestLogs(prev => [`[${new Date().toLocaleTimeString('pt-BR')}] ${message}`, ...prev]);
  };

  const runLocalLoopbackTest = async () => {
    addTestLog('Analisando conexões. Iniciando Ping Loopback ao Servidor PC...');
    try {
      const res = await fetch(`http://127.0.0.1:${localNetwork.port || 3100}/api/health`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        addTestLog(`MENSAGEM DE SUCESSO: Servidor respondeu com sucesso! Status: ${data.status} - ${data.message}`);
      } else {
        addTestLog(`FALHA NO PING: Servidor respondeu com código de erro HTTP ${res.status}`);
      }
    } catch (err: any) {
      addTestLog(`BLOQUEIO DE REDE OU FIREWALL: Falha ao alcançar servidor local loopback: ${err.message || err}.`);
    }
  };

  const handleCreatePCProductTest = () => {
    const state = useStore.getState();
    const id = 'prod-test-' + Date.now();
    const newProd = {
      id,
      name: `[TESTE] Produto de Teste PC -> Mobile`,
      price: 199.90,
      wholesalePrice: 179.90,
      costPrice: 120.00,
      code: "TEST-" + id.slice(-4).toUpperCase(),
      stock: 50,
      minStock: 5,
      unit: "un",
      category: "Testes",
      active: true,
      lastUpdated: Date.now(),
      syncVersion: 1
    };
    useStore.setState((prev) => ({
      products: [...prev.products, newProd]
    }));
    state.pushSyncMutation('products', id, 'u', newProd);
    setTestProduct(newProd);
    addTestLog(`Sucesso: Criou produto "${newProd.name}" e gerou mutação. Sincronizando...`);
  };

  const handleChangePCProductStockTest = () => {
    if (!testProduct) {
      addTestLog("Erro: Crie o produto de teste primeiro.");
      return;
    }
    const state = useStore.getState();
    const updatedProduct = {
      ...testProduct,
      stock: Math.floor(Math.random() * 100) + 1,
      lastUpdated: Date.now(),
      syncVersion: (testProduct.syncVersion || 1) + 1
    };
    useStore.setState((prev) => ({
      products: prev.products.map(p => p.id === testProduct.id ? updatedProduct : p)
    }));
    state.pushSyncMutation('products', testProduct.id, 'u', updatedProduct);
    setTestProduct(updatedProduct);
    addTestLog(`Sucesso: Estoque atualizado para ${updatedProduct.stock}. Enviando dados ao celular sincronizado...`);
  };

  const handleCleanupPCTestProduct = () => {
    if (!testProduct) {
      addTestLog("Erro: Escolha ou crie primeiro o produto de teste.");
      return;
    }
    const state = useStore.getState();
    state.deleteProduct(testProduct.id, 'Diagnóstico PC');
    setTestProduct(null);
    addTestLog("Sucesso: Produto de teste limpo e excluído da base com tombstone gerado.");
  };

  const bridge = getElectronBridge();

  // Load real devices, PIN, and audit trail from Electron backend
  const loadNetworkSecurityInfo = async () => {
    if (bridge) {
      try {
        const deviceList = await bridge.getLocalDevices();
        setDevices(deviceList || []);
        
        const pinObj = await bridge.getPairingPin();
        setActivePin(pinObj);

        const logs = await bridge.getPairingAuditLogs();
        setAuditLogs(logs || []);
      } catch (err) {
        console.error('[NetworkSettings] Failed to poll network info:', err);
      }
    }
  };

  // Keep polling network pairing state every 15 seconds for immediate synchrony
  useEffect(() => {
    loadNetworkSecurityInfo();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadNetworkSecurityInfo();
    }, 15000);

    let unsubRequest: (() => void) | null = null;
    let unsubAudit: (() => void) | null = null;

    // Listen to live events if available on the model bridge
    if (bridge) {
      if (bridge.onNewPairingRequest) {
        unsubRequest = bridge.onNewPairingRequest(() => {
          loadNetworkSecurityInfo();
        });
      }
      if (bridge.onNewPairingAudit) {
        unsubAudit = bridge.onNewPairingAudit(() => {
          loadNetworkSecurityInfo();
        });
      }
    }

    return () => {
      clearInterval(interval);
      if (unsubRequest) unsubRequest();
      if (unsubAudit) unsubAudit();
    };
  }, []);

  // Handle local active PIN expiration countdown logic
  useEffect(() => {
    const timeInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (activePin && activePin.pin && activePin.expiresAt) {
        const diff = activePin.expiresAt - Date.now();
        if (diff <= 0) {
          setPinTimeLeft('Expirado');
          setActivePin(null);
        } else {
          const secs = Math.floor(diff / 1000);
          const mins = Math.floor(secs / 60);
          const remSecs = secs % 60;
          setPinTimeLeft(`${mins}:${remSecs.toString().padStart(2, '0')}`);
        }
      } else {
        setPinTimeLeft('');
      }
    }, 1000);

    return () => clearInterval(timeInterval);
  }, [activePin]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await networkService.startLocalServer();
    await loadNetworkSecurityInfo();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleGeneratePin = async () => {
    if (bridge) {
      setIsGeneratingPin(true);
      try {
        const pinObj = await bridge.generatePairingPin();
        setActivePin(pinObj);
        setShowQR(true); // Open QR side automatically to help client scanning
      } catch (err) {
        console.error('Failed to generate secure pin:', err);
      } finally {
        setIsGeneratingPin(false);
      }
    }
  };

  const handleDeviceAction = async (deviceId: string, action: string, deviceToken?: string) => {
    if (bridge) {
      try {
        const customName = editingDeviceId === deviceId ? newName : undefined;
        const response = await bridge.setDeviceStatus(deviceId, action, deviceToken, customName);
        if (response && response.success) {
          setDevices(response.devices || []);
          setEditingDeviceId(null);
          setNewName('');
          // Force immediate re-evaluation of security logs
          const logs = await bridge.getPairingAuditLogs();
          setAuditLogs(logs || []);
        }
      } catch (err) {
        console.error('Action failed:', err);
      }
    }
  };

  // Base parameters
  const serverUrl = `http://${localNetwork.ip || '127.0.0.1'}:${localNetwork.port || 3100}`;
  // Append PIN code parameter if valid
  const isPinValid = activePin && activePin.pin && Date.now() < activePin.expiresAt;
  const qrUrl = isPinValid 
    ? `${serverUrl}?pin=${activePin?.pin}`
    : serverUrl;

  const pendingDevices = devices.filter(d => d.status === 'pending');
  const trustedDevices = devices.filter(d => d.status === 'trusted');
  const blockedDevices = devices.filter(d => d.status === 'blocked');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 font-sans">
      
      {/* Header Context */}
      {!isEmbedded && (
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-black text-white uppercase tracking-tight">Sincronização Local e Pareamento Seguro</h2>
          <p className="text-[10px] text-white/30 uppercase font-black tracking-[0.2em]">Controle de credenciais, auditoria e pareamento seguro com PIN</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Server status & settings */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6 lg:col-span-2">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-xl transition-colors",
                localNetwork.isActive ? "bg-emerald-500/20 text-emerald-500" : "bg-red-500/20 text-red-500"
              )}>
                <Server className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight font-sans">Status do Servidor</h3>
                <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">
                  {localNetwork.isActive ? 'Servidor Ativo na Rede' : 'Servidor Inativo'}
                </p>
              </div>
            </div>

            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 hover:bg-white/5 rounded-xl border border-white/5 hover:border-white/10 text-white/40 hover:text-white transition-all disabled:opacity-30"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Endereço IP Local</span>
              <p className="text-sm font-mono font-bold text-white uppercase tracking-wider">{localNetwork.ip || '0.0.0.0'}</p>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
              <span className="text-[9px] font-black text-white/20 uppercase tracking-widest block">Porta TCP de Início</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={portInput}
                  onChange={(e) => setPortInput(e.target.value.replace(/\D/g, ''))}
                  className="bg-black/40 border border-white/10 text-xs font-mono font-bold text-emerald-400 rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 w-24"
                />
                <button
                  type="button"
                  onClick={handleChangePort}
                  disabled={isChangingPort || parseInt(portInput) === localNetwork.port}
                  className="px-3 py-1.5 bg-white/10 hover:bg-emerald-500 hover:text-black rounded-lg text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-30"
                >
                  {isChangingPort ? 'Aplicando' : 'Mudar'}
                </button>
              </div>
            </div>
          </div>

          {/* Secure Pairing PIN Panel */}
          <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400 mt-1">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">Pareamento por PIN Temporário</h4>
                  <p className="text-[9px] text-white/40 leading-relaxed font-bold uppercase mt-1">
                    Gere um PIN randômico expirável para autorizar conexões de novos celulares de vendas.
                  </p>
                </div>
              </div>
              <button
                onClick={handleGeneratePin}
                disabled={isGeneratingPin}
                className="shrink-0 px-5 py-3 bg-white/10 hover:bg-emerald-500 hover:text-black disabled:opacity-30 rounded-2xl text-[9px] font-black text-white uppercase tracking-wider transition-all border border-white/5"
              >
                {isGeneratingPin ? 'Gerando PIN...' : 'Gerar PIN de pareamento'}
              </button>
            </div>

            {isPinValid ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in zoom-in-95 duration-300">
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">PIN de Segurança Ativo</span>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-mono font-black text-white tracking-widest">{activePin?.pin}</span>
                    <span className="px-2 py-0.5 rounded bg-black/40 text-[8px] font-mono text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Expirando em {pinTimeLeft}
                    </span>
                  </div>
                </div>
                <p className="text-[9px] text-white/50 leading-relaxed max-w-xs font-bold uppercase">
                  Insira este código ou escaneie o QR Code ao lado para parear celulares secundários.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white/5 border border-dashed border-white/10 flex items-center gap-3">
                <Lock className="w-4 h-4 text-white/20 shrink-0" />
                <p className="text-[9px] text-white/40 uppercase font-black tracking-wider">
                  Nenhum PIN ativo. Clique no botão acima para permitir conexões de novos dispositivos.
                </p>
              </div>
            )}
          </div>

        </div>

        {/* QR Code Segment */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-xl text-blue-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-tight">QR Code Dinâmico</h3>
                <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">Escaneie pelo aplicativo cliente</p>
              </div>
            </div>
            
            <p className="text-[9px] text-white/40 uppercase font-bold leading-relaxed">
              O QR Code abaixo carrega o IP, a Porta e o PIN de pareamento (se houver um PIN ativo) para configuração automática em um toque.
            </p>
          </div>

          <div className="flex justify-center py-4 bg-white/[0.02] border border-white/5 rounded-2xl">
            <QRCodeSVG 
              value={qrUrl} 
              size={144} 
              level="M" 
              includeMargin 
              bgColor="#ffffff"
              fgColor="#000000"
              className="rounded-xl border border-white/10 shadow-lg"
            />
          </div>

          <div className="text-center">
            <span className="text-[8px] font-mono text-white/30 truncate block max-w-full uppercase font-bold tracking-widest">
              URL: {qrUrl}
            </span>
          </div>
        </div>

      </div>

      {/* Real Local Device List Section */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 rounded-xl text-emerald-400 border border-emerald-500/10">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Gerenciamento de Dispositivos Pareados</h3>
              <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">Autorize ou bloqueie o tráfego de aparelhos sincronizados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
              {trustedDevices.length} Confiáveis
            </span>
            {pendingDevices.length > 0 && (
              <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest animate-pulse">
                {pendingDevices.length} Solicitando Pareamento
              </span>
            )}
          </div>
        </div>

        {/* Categories: PENDENTES */}
        {pendingDevices.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-3 py-2 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Solicitações Pendentes (Aguardando Pareamento)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pendingDevices.map((device) => (
                <div key={device.deviceId} className="p-5 rounded-3xl bg-amber-500/[0.02] border border-amber-500/20 flex flex-col justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-3">
                      <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400">
                        {device.type === 'Desktop' ? <Laptop className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-tight">{device.name}</h4>
                        <div className="flex flex-col gap-0.5 mt-1">
                          <span className="text-[8px] font-mono text-white/40 uppercase font-black">ID: {device.deviceId}</span>
                          <span className="text-[8px] text-amber-400/80 font-bold uppercase tracking-widest flex items-center gap-1">
                            Operador: {device.operator || 'Indefinido'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[7px] font-black text-amber-400 uppercase tracking-widest">
                      Aguardando Pareamento
                    </span>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-amber-500/10 pt-3">
                    <button
                      onClick={() => handleDeviceAction(device.deviceId, 'decline')}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-[9px] font-black text-red-400 uppercase tracking-wider transition-all flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Recusar
                    </button>
                    <button
                      onClick={() => handleDeviceAction(device.deviceId, 'approve')}
                      className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprovar Pareamento
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trusted & Blocked Devices in a Structured List */}
        <div className="space-y-4">
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1 block">Dispositivos Cadastrados e Históricos</span>
          
          {trustedDevices.length === 0 && blockedDevices.length === 0 ? (
            <div className="p-8 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-3xl">
              <Shield className="w-6 h-6 text-white/10 mx-auto mb-2" />
              <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest">Nenhum dispositivo sincronizado foi registrado no PC até o momento.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {/* Combine trusted & blocked in visual layout */}
              {[...trustedDevices, ...blockedDevices].map((device) => {
                const isTrusted = device.status === 'trusted';
                const isEditing = editingDeviceId === device.deviceId;
                
                return (
                  <div key={device.deviceId} className={cn(
                    "p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all",
                    isTrusted ? "bg-white/5 border-white/10" : "bg-red-500/[0.01] border-red-500/10 opacity-75"
                  )}>
                    
                    {/* Device header info */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-3">
                        <div className={cn(
                          "p-2 rounded-xl border",
                          isTrusted ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                        )}>
                          {device.type === 'Desktop' ? <Laptop className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
                        </div>
                        <div className="space-y-1">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input 
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="bg-black/40 border border-white/20 text-xs text-white rounded px-2 py-1 focus:outline-none focus:border-emerald-500 font-bold"
                                placeholder={device.name}
                                autoFocus
                              />
                              <button 
                                onClick={() => handleDeviceAction(device.deviceId, 'rename')}
                                className="p-1 bg-emerald-500 text-black rounded"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button 
                                onClick={() => { setEditingDeviceId(null); setNewName(''); }}
                                className="p-1 bg-white/10 text-white rounded"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-black text-white uppercase tracking-tight">{device.name}</h4>
                              <button
                                onClick={() => { setEditingDeviceId(device.deviceId); setNewName(device.name); }}
                                className="p-1 hover:bg-white/10 rounded text-white/30 hover:text-white transition-colors"
                                title="Renomear dispositivo"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-mono text-white/30 uppercase font-black tracking-wider">ID: {device.deviceId}</span>
                            <span className="text-[8.5px] text-white/40 uppercase font-bold flex items-center gap-1 mt-0.5">
                              Canal: {device.type || 'Web'}
                            </span>
                            {isTrusted && device.token && (
                              <div className="flex items-center gap-1.5 mt-0.5 select-none" title="Token de sincronização autorizado">
                                <UserCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                                <span className="text-[8px] font-mono text-emerald-400 uppercase font-bold tracking-wider truncate max-w-[120px]">
                                  Autenticado: {device.token.substring(0, 10)}...
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <span className={cn(
                        "px-2.5 py-0.5 rounded text-[7px] font-mono font-bold uppercase tracking-wider",
                        isTrusted ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                      )}>
                        {isTrusted ? 'Autorizado' : 'Bloqueado'}
                      </span>
                    </div>

                    {/* Access meta footer */}
                    <div className="border-t border-white/5 pt-3 flex items-center justify-between gap-2.5">
                      <span className="text-[8.5px] font-semibold text-white/30 uppercase">
                        Último Acesso:{' '}
                        {device.lastAccessed 
                          ? new Date(device.lastAccessed).toLocaleTimeString('pt-BR') 
                          : 'Nunca conectado'}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        {isTrusted ? (
                          <button
                            onClick={() => handleDeviceAction(device.deviceId, 'block')}
                            className="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 text-red-400 hover:text-white text-[8px] font-black uppercase tracking-wider rounded-lg transition-colors"
                          >
                            Bloquear
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDeviceAction(device.deviceId, 'unblock')}
                            className="px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-black text-[8px] font-black uppercase tracking-wider rounded-lg transition-all"
                          >
                            Desbloquear
                          </button>
                        )}
                        <button
                          onClick={() => handleDeviceAction(device.deviceId, 'delete')}
                          className="p-1.5 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/10 hover:text-red-400 rounded-lg text-white/30 transition-colors"
                          title="Remover dispositivo do banco"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* PAINEL DE DIAGNÓSTICO E CHECKLIST DE TESTE LOCAL */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 border border-emerald-500/10">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Painel de Diagnóstico e Checklist de Rede</h3>
              <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">Valide a conectividade PC ↔ Celular e administre testes sem afetar o caixa</p>
            </div>
          </div>
          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
            PC MODO SERVIDOR
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status e Controle de Testes */}
          <div className="space-y-4">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Status do Servidor Local</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                <span className="text-[8px] text-white/30 uppercase font-black block">Servidor HTTP</span>
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ativo e Ouvindo
                </span>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                <span className="text-[8px] text-white/30 uppercase font-black block">Porta de Escuta</span>
                <span className="text-xs font-mono font-bold text-white mt-1 block">
                  {localNetwork.port || 3100} (TCP)
                </span>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                <span className="text-[8px] text-white/30 uppercase font-black block">Protocolo de Ligação</span>
                <span className="text-xs font-mono font-bold text-emerald-400 mt-1 block uppercase">
                  WebSocket (ws://)
                </span>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
                <span className="text-[8px] text-white/30 uppercase font-black block">Clientes Pareados</span>
                <span className="text-xs font-mono font-bold text-white mt-1 block">
                  {devices.filter(d => d.status === 'trusted').length} Conectados
                </span>
              </div>
            </div>

            <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
              <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Módulo de Teste de Dados Controlados (PC → Celular)</span>
              
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runLocalLoopbackTest}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[9px] font-mono font-bold uppercase transition-colors"
                >
                  Testar Ping Loopback
                </button>
                <button
                  onClick={handleCreatePCProductTest}
                  disabled={!!testProduct}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[9px] font-mono font-bold uppercase transition-colors disabled:opacity-30"
                >
                  Criar Produto de Teste
                </button>
                <button
                  onClick={handleChangePCProductStockTest}
                  disabled={!testProduct}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[9px] font-mono font-bold uppercase transition-colors disabled:opacity-30"
                >
                  Atualizar Estoque
                </button>
                <button
                  onClick={handleCleanupPCTestProduct}
                  disabled={!testProduct}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-[9px] font-mono font-bold uppercase transition-colors disabled:opacity-30"
                >
                  Limpar Teste
                </button>
              </div>

              {testProduct && (
                <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Produto em Processo</span>
                    <span className="text-[8px] font-mono text-white/40">ID: {testProduct.id.slice(-6)}</span>
                  </div>
                  <p className="text-xs font-bold text-white uppercase">{testProduct.name}</p>
                  <div className="flex gap-4">
                    <span className="text-[9px] font-mono text-white/50">Estoque: <strong className="text-white">{testProduct.stock}</strong></span>
                    <span className="text-[9px] font-mono text-white/50">Versão: <strong className="text-white">v{testProduct.syncVersion}</strong></span>
                    <span className="text-[9px] font-mono text-white/50">Mutação: <strong className="text-emerald-400 font-bold">GERADA</strong></span>
                  </div>
                </div>
              )}

              {/* Console de Log de Teste */}
              <div className="space-y-1">
                <span className="text-[8px] font-black text-white/30 uppercase tracking-widest block">Console de Resposta</span>
                <div className="p-3 bg-black/40 border border-white/5 rounded-xl h-24 overflow-y-auto font-mono text-[9px] text-zinc-400 space-y-1 scrollbar-thin">
                  {testLogs.length === 0 ? (
                    <span className="text-zinc-600 block italic">Aguardando execução de testes...</span>
                  ) : (
                    testLogs.map((log, idx) => (
                      <div key={idx} className="leading-tight break-all">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Checklist de Teste Local */}
          <div className="space-y-4">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Checklist de Conformidade de Rede Local</span>
            <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-3">
              {[
                { id: 1, label: "PC e Celular conectados ao mesmo Wi-Fi", check: checklistStatus[1] },
                { id: 2, label: "Servidor local iniciado no PC", check: localNetwork.isActive },
                { id: 3, label: "Firewall do Windows liberou as portas", check: checklistStatus[3] },
                { id: 4, label: "Celular escaneou o QR Code do PC", check: checklistStatus[4] },
                { id: 5, label: "Dispositivo autenticado e aprovado no PC", check: devices.filter(d => d.status === 'trusted').length > 0 },
                { id: 6, label: "Ping / Teste de conexão bem Sucedido", check: checklistStatus[6] },
                { id: 7, label: "Sincronização PC → Celular testada", check: checklistStatus[7] },
                { id: 8, label: "Sincronização Celular → PC testada", check: checklistStatus[8] },
                { id: 9, label: "Fila Offline no celular sincronizada após religar rede", check: checklistStatus[9] }
              ].map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => {
                    // Permit manual toggle override except for those automatically detected
                    if (item.id !== 2 && item.id !== 5) {
                      setChecklistStatus(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                    }
                  }}
                  className="flex items-center justify-between gap-3 p-2 bg-white/[0.01] hover:bg-white/[0.03] rounded-xl border border-white/5 cursor-pointer transition-all select-none"
                >
                  <p className="text-[10px] font-bold text-white/80 uppercase leading-normal">{item.id}. {item.label}</p>
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                    item.check 
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-400" 
                      : "bg-black/40 border-white/10 text-white/10"
                  }`}>
                    {item.check && <Check className="w-2.5 h-2.5 stroke-[4]" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Security Audit Trail Panel */}
      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-xl text-amber-500">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-tight">Registro de Segurança (Auditoria Local)</h3>
              <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-0.5">Rastreabilidade completa de logins, pareamentos e acessos</p>
            </div>
          </div>
          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> {auditLogs.length} Entradas
          </span>
        </div>

        <div className="max-h-60 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 space-y-2">
          {auditLogs.length === 0 ? (
            <p className="text-center text-[10px] uppercase font-bold text-white/20 py-8">Auditoria limpa. Nenhuma atividade local registrada.</p>
          ) : (
            auditLogs.slice(0, 50).map((log) => {
              // Color map matches pairing log categories
              const isDanger = log.action === 'unauthorized_attempt' || log.action === 'token_revoked';
              const isApproved = log.action === 'device_approved' || log.action === 'pairing_request_validated';
              const isWarning = log.action === 'device_declined' || log.action === 'pairing_request';
              
              return (
                <div key={log.id} className="p-3.5 bg-white/[0.01] border border-white/5 hover:bg-white/5 hover:border-white/10 rounded-2xl flex items-center justify-between gap-4 transition-all text-xs font-medium">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      isDanger ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" :
                      isApproved ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" :
                      isWarning ? "bg-amber-400" : "bg-white/20"
                    )} />
                    <div className="min-w-0">
                      <p className="text-white/80 font-bold uppercase text-[10px] tracking-wide truncate">{log.description}</p>
                      {log.details && (
                        <span className="text-[8.5px] font-mono text-white/30 uppercase font-bold tracking-wider mt-0.5 block truncate">
                          Detalhes: {JSON.stringify(log.details)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[8.5px] font-mono text-white/30 uppercase shrink-0 font-bold tracking-widest">
                    {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

    </div>
  );
}
