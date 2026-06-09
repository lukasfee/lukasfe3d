import React from 'react';
import { 
  Users, 
  Key, 
  Plus, 
  Lock, 
  Unlock, 
  QrCode, 
  Tag, 
  Download, 
  Trash2, 
  Eye, 
  EyeOff, 
  ScrollText, 
  ShieldCheck, 
  Check, 
  X,
  FileText
} from 'lucide-react';
import { useStore } from '../store';
import { format } from 'date-fns';
import { StandardQRCode } from './StandardQRCode';

interface MasterAuthorizersPanelProps {
  users: any[];
  userRoles: any[];
  masterAuthorizations: any[];
  masterBadges: any[];
  addMasterAuthorization: (auth: any) => Promise<{ success: boolean; error?: string }>;
  updateMasterAuthorization: (id: string, fields: any) => Promise<void>;
  deleteMasterAuthorization: (id: string) => Promise<void>;
  generateMasterBadge: (authId: string) => Promise<{ success: boolean; error?: string; badge?: any }>;
  updateMasterBadgeStatus: (id: string, status: 'ativo' | 'bloqueado') => void;
  deleteMasterBadge: (id: string) => void;
  nfcTags: any[];
  addNFCTag: (uid: string, tagLabel: string) => Promise<{ success: boolean; error?: string }>;
  updateNFCTag: (id: string, fields: any) => Promise<{ success: boolean; error?: string }>;
}

export default function MasterAuthorizersPanel({
  users,
  userRoles,
  masterAuthorizations,
  masterBadges,
  addMasterAuthorization,
  updateMasterAuthorization,
  deleteMasterAuthorization,
  generateMasterBadge,
  updateMasterBadgeStatus,
  deleteMasterBadge,
  nfcTags,
  addNFCTag,
  updateNFCTag,
}: MasterAuthorizersPanelProps) {
  
  // States
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingAuthId, setEditingAuthId] = React.useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [pMaster, setPMaster] = React.useState('');
  const [confirmPMaster, setConfirmPMaster] = React.useState('');
  const [authStatus, setAuthStatus] = React.useState<'ativo' | 'inativo'>('ativo');
  const [authObservation, setAuthObservation] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [showPMaster, setShowPMaster] = React.useState(false);
  
  // Custom critical permissions allowed
  const [critPerms, setCritPerms] = React.useState<string[]>(['cancelamento', 'desconto_master']);

  // NFC Binding variables for individual master row
  const [linkingNfcAuthId, setLinkingNfcAuthId] = React.useState<string | null>(null);
  const [nfcUidInput, setNfcUidInput] = React.useState('');
  const [nfcError, setNfcError] = React.useState('');
  
  // Individual user audit logs modal
  const [auditUserObj, setAuditUserObj] = React.useState<any>(null);

  // Computes active available users to configure as Master
  const availableUsers = users.filter((u) => 
    u.status === 'ativo' && 
    u.id !== 'admin' && !u.isMasterAdmin && !u.isOwner && u.login !== 'ADM' && 
    (!masterAuthorizations.some((a) => a.userId === u.id) || (editingAuthId && masterAuthorizations.find(a => a.id === editingAuthId)?.userId === u.id))
  );

  const handleSaveForm = async () => {
    if (!selectedUserId) {
      setFormError('Selecione um usuário.');
      return;
    }
    if (!pMaster) {
      setFormError('A Senha Master não deve ser vazia.');
      return;
    }
    if (pMaster !== confirmPMaster) {
      setFormError('Confirmação de senha incorreta.');
      return;
    }
    if (pMaster.length < 4) {
      setFormError('A Senha deve possuir pelo menos 4 dígitos numéricos.');
      return;
    }

    // Embed critical permissions list into observation field securely as serialized string or friendly note
    const observationPayload = `${authObservation || 'N/A'} [Perms: ${critPerms.join(',')}]`;

    if (editingAuthId) {
      await updateMasterAuthorization(editingAuthId, {
        userId: selectedUserId,
        passwordMaster: pMaster,
        status: authStatus,
        observation: observationPayload
      });
      
      useStore.getState().logAction({
        module: 'Segurança',
        actionType: 'security',
        action: 'Atualizar Master',
        description: `Credencial Master de supervisão atualizada para usuário ID ${selectedUserId}`,
        status: 'sucesso'
      });
      alert('Autorização master atualizada com sucesso!');
    } else {
      const res = await addMasterAuthorization({
        userId: selectedUserId,
        passwordMaster: pMaster,
        status: authStatus,
        observation: observationPayload
      });
      if (!res.success) {
        setFormError(res.error || 'Erro ao cadastrar.');
        return;
      }
      
      useStore.getState().logAction({
        module: 'Segurança',
        actionType: 'security',
        action: 'Promoção Master',
        description: `Usuário ${users.find(u => u.id === selectedUserId)?.fullName} promovido para nível Supervisor Master`,
        status: 'sucesso'
      });
      alert('Autorização master cadastrada com sucesso!');
    }

    // Reset Form
    setIsFormOpen(false);
    setEditingAuthId(null);
    setSelectedUserId('');
    setPMaster('');
    setConfirmPMaster('');
    setAuthStatus('ativo');
    setAuthObservation('');
    setFormError('');
  };

  const handleEdit = (auth: any) => {
    setEditingAuthId(auth.id);
    setSelectedUserId(auth.userId);
    setPMaster(auth.passwordMaster);
    setConfirmPMaster(auth.passwordMaster);
    setAuthStatus(auth.status);

    // Parse existing perms from observation string if possible
    let baseObs = auth.observation || '';
    if (baseObs.includes('[Perms:')) {
      const parts = baseObs.split(' [Perms: ');
      baseObs = parts[0];
      const pString = parts[1]?.replace(']', '') || '';
      setCritPerms(pString.split(',').filter(Boolean));
    }
    setAuthObservation(baseObs);
    setFormError('');
    setIsFormOpen(true);
  };

  // Physical styled SVG card generated for dynamic QR (Membro Master)
  const downloadMasterBadgeSVG = (codigoMaster: string, userName: string) => {
    const svgEl = document.getElementById(`qr-master-${codigoMaster}`);
    if (!svgEl) {
      alert("Elemento QR Code não encontrado.");
      return;
    }
    try {
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);
      source = source.replace(/width="\d+"/i, 'width="120"');
      source = source.replace(/height="\d+"/i, 'height="120"');

      const finalSvg = `
<svg width="380" height="235" viewBox="0 0 380 235" xmlns="http://www.w3.org/2000/svg">
  <rect width="380" height="235" rx="20" fill="#0D0d0d" stroke="#10B981" stroke-width="2.5"/>
  <rect x="6" y="6" width="368" height="223" rx="15" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
  <circle cx="295" cy="115" r="90" fill="#10B981" fill-opacity="0.03"/>
  <circle cx="295" cy="115" r="60" fill="none" stroke="#10B981" stroke-opacity="0.04" stroke-width="1"/>
  
  <text x="32" y="44" font-family="'Inter', sans-serif" font-size="9" font-weight="900" fill="#10B981" letter-spacing="3">SISTEMA RESTRITO OPERACIONAL</text>
  <text x="32" y="68" font-family="'Inter', sans-serif" font-size="16" font-weight="950" fill="#FFFFFF" letter-spacing="0.5">CHAVE DE LIBERAÇÃO MASTER</text>
  <text x="32" y="86" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#9CA3AF" letter-spacing="2.5">SUPERVISOR AUTORIZADO</text>
  
  <line x1="32" y1="105" x2="245" y2="105" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>

  <text x="32" y="135" font-family="'Inter', sans-serif" font-size="8" font-weight="800" fill="#10B981" letter-spacing="1">MEMBRO DETENTOR</text>
  <text x="32" y="156" font-family="'Inter', sans-serif" font-size="13" font-weight="900" fill="#FFFFFF">${userName.toUpperCase()}</text>
  <text x="32" y="176" font-family="'Fira Code', monospace" font-size="10" font-weight="700" fill="#10B981" fill-opacity="0.8" letter-spacing="1">${codigoMaster}</text>
  
  <rect x="250" y="115" width="100" height="100" rx="12" fill="#FFFFFF"/>
  <g transform="translate(255, 120)">
    <rect width="90" height="90" fill="#FFFFFF" />
    <svg width="90" height="90" viewBox="0 0 128 128">
      <path d="M0 0h128v128H0z" fill="#FFF"/>
      <g transform="scale(3.125)" fill="#000">
        <rect x="2" y="2" width="6" height="6" fill="#000"/>
        <rect x="3" y="3" width="4" height="4" fill="#FFF"/>
        <rect x="24" y="2" width="6" height="6" fill="#000"/>
        <rect x="25" y="3" width="4" height="4" fill="#FFF"/>
        <rect x="2" y="24" width="6" height="6" fill="#000"/>
        <rect x="3" y="25" width="4" height="4" fill="#FFF"/>
      </g>
    </svg>
  </g>
  
  <text x="32" y="210" font-family="'Fira Code', monospace" font-size="7.5" fill="#10B981" fill-opacity="0.6">NÍVEL DE ACESSO II • SEGURANÇA FISICA</text>
</svg>
      `.trim();

      const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement("a");
      downloadLink.href = svgUrl;
      downloadLink.download = `chave-master-${codigoMaster}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(svgUrl);
    } catch (err: any) {
      alert(`Falha ao exportar SVG: ${err.message}`);
    }
  };

  const handleLinkNfcRowSubmit = async (authId: string, userId: string) => {
    setNfcError('');
    const cleanUid = nfcUidInput.trim().toUpperCase();
    if (!cleanUid) {
      setNfcError('UID inválido.');
      return;
    }

    const existingTag = nfcTags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');
    if (existingTag && existingTag.usuarioVinculado && existingTag.usuarioVinculado !== userId) {
      setNfcError('Tag vinculada a outro usuário do sistema.');
      return;
    }

    if (existingTag) {
      await updateNFCTag(existingTag.id, {
        tipoCredencial: 'MASTER',
        usuarioVinculado: userId,
        status: 'Vinculado'
      });
    } else {
      const res = await addNFCTag(cleanUid, `Master Card`);
      if (!res.success) {
        setNfcError(res.error || 'Erro ao criar.');
        return;
      }
      const freshTags = useStore.getState().nfcTags || [];
      const freshTag = freshTags.find(t => t.uid.trim().toUpperCase() === cleanUid);
      if (freshTag) {
        await updateNFCTag(freshTag.id, {
          tipoCredencial: 'MASTER',
          usuarioVinculado: userId,
          status: 'Vinculado'
        });
      }
    }

    useStore.getState().logAction({
      module: 'Segurança',
      actionType: 'security',
      action: 'Vínculo NFC Master',
      description: `Tag NFC Master vinculada para usuário ID ${userId} (UID: ${cleanUid})`,
      status: 'sucesso'
    });

    setLinkingNfcAuthId(null);
    setNfcUidInput('');
  };

  const toggleCritPerm = (perm: string) => {
    if (critPerms.includes(perm)) {
      setCritPerms(critPerms.filter(p => p !== perm));
    } else {
      setCritPerms([...critPerms, perm]);
    }
  };

  return (
    <div className="bg-[#0f0f0f] border border-emerald-500/10 rounded-2xl p-4 md:p-6 space-y-6 relative overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.02)]">
      
      {/* Dynamic neon line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 animate-pulse" />

      {/* Header section with add button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5 text-left">
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Múltiplos Usuários Autorizadores Master</h3>
            <p className="text-[8px] text-white/40 uppercase font-black tracking-widest mt-1 leading-none">Gestão de Operadores Autorizados para Liberações Críticas sem Acesso ADM</p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingAuthId(null);
            setSelectedUserId('');
            setPMaster('');
            setConfirmPMaster('');
            setAuthStatus('ativo');
            setAuthObservation('');
            setCritPerms(['cancelamento', 'desconto_master']);
            setIsFormOpen(true);
          }}
          className="py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[9px] uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
        >
          <Plus className="w-3 h-3 stroke-[3]" /> Nova Chave Master
        </button>
      </div>

      {/* Slide-out / Down configuration form */}
      {isFormOpen && (
        <div className="p-5 bg-black/80 border border-emerald-500/20 rounded-xl space-y-4 animate-in slide-in-from-top-4 duration-300 text-left">
          <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 animate-bounce" />
            {editingAuthId ? 'Editar Credenciais Master de Supervisão' : 'Promover Operador a Nível Autorizador Master'}
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">Selecionar Operador Beneficiário</label>
              <select
                value={selectedUserId}
                disabled={!!editingAuthId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-zinc-950/90 border border-white/10 rounded-lg h-9 px-3 text-[10px] text-white focus:outline-none focus:border-emerald-500 transition-all font-semibold uppercase"
              >
                <option value="">-- SELECIONAR OPERADOR --</option>
                {availableUsers.map((u) => {
                  const roleName = userRoles.find((r) => r.id === u.roleId)?.name || 'OPERACIONAL';
                  return (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.login}) • Fun: {roleName}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">Chave Master Numérica</label>
                <div className="relative">
                  <input
                    type={showPMaster ? "text" : "password"}
                    value={pMaster}
                    maxLength={10}
                    onChange={(e) => setPMaster(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-zinc-950/90 border border-white/10 rounded-lg h-9 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold tracking-widest font-mono"
                    placeholder="Min 4 dígitos"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPMaster(!showPMaster)}
                    className="absolute right-2.5 top-2.5 text-white/40 hover:text-white"
                  >
                    {showPMaster ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">Confirmar Chave</label>
                <input
                  type="password"
                  value={confirmPMaster}
                  maxLength={10}
                  onChange={(e) => setConfirmPMaster(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-zinc-950/90 border border-white/10 rounded-lg h-9 px-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-bold tracking-widest font-mono"
                  placeholder="Dígitos"
                />
              </div>
            </div>
          </div>

          {/* Area of checkboxes for critical actions allowed on the master user */}
          <div className="p-3.5 bg-zinc-950/50 border border-white/5 rounded-lg space-y-2">
            <span className="text-[7.5px] font-black text-emerald-500 uppercase tracking-widest block">Definir Escopo de Autorização Crítica</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'cancelamento', label: 'Estornos/Cancelamentos' },
                { id: 'desconto_master', label: 'Descontos Altos' },
                { id: 'preco_venda', label: 'Cadastro de Preço' },
                { id: 'remessas', label: 'Lojistas & Remessas' },
                { id: 'suporte_master', label: 'Suporte & Setup' },
                { id: 'limpezas', label: 'Purgar Lojas/Logs' },
                { id: 'completo', label: 'Mesa de Comando' },
                { id: 'gerencia_cx', label: 'Acolhimento de Caixa' }
              ].map(p => (
                <div 
                  key={p.id} 
                  onClick={() => toggleCritPerm(p.id)}
                  className={`p-2 border rounded-lg flex items-center justify-between cursor-pointer transition-all ${critPerms.includes(p.id) ? 'bg-emerald-500/10 border-emerald-500/40 text-white' : 'bg-black/40 border-white/5 text-white/40 hover:bg-black/60'}`}
                >
                  <span className="text-[9px] font-semibold tracking-tight">{p.label}</span>
                  {critPerms.includes(p.id) && <Check className="w-3 h-3 text-emerald-400" />}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">Cargo / Status Customizado</label>
              <input
                type="text"
                value={authObservation}
                onChange={(e) => setAuthObservation(e.target.value)}
                className="w-full bg-zinc-950/90 border border-white/10 rounded-lg h-9 px-3 text-[10px] text-white focus:outline-none focus:border-emerald-500"
                placeholder="Ex: Gerente Geral / Operador de Pista Líder"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[7.5px] font-black text-white/40 uppercase tracking-widest block">Status da Credencial</label>
              <select
                value={authStatus}
                onChange={(e) => setAuthStatus(e.target.value as 'ativo' | 'inativo')}
                className="w-full bg-zinc-950/90 border border-white/10 rounded-lg h-9 px-3 text-[10px] text-white focus:outline-none focus:border-emerald-500 font-bold"
              >
                <option value="ativo">OPERACIONAL &amp; AUTORIZADO</option>
                <option value="inativo">BLOQUEADO / SUSPENSO</option>
              </select>
            </div>
          </div>

          {formError && <p className="text-[8px] text-red-500 font-extrabold uppercase text-center animate-pulse">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsFormOpen(false)}
              className="px-3.5 h-8 bg-white/5 hover:bg-white/10 rounded-lg text-[8.5px] font-black uppercase tracking-widest text-white/50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveForm}
              className="px-5 h-8 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-[8.5px] font-black uppercase tracking-widest text-black shadow-lg"
            >
              Salvar Promovido Master
            </button>
          </div>
        </div>
      )}

      {/* Main Authorizations Grid Table */}
      <div className="space-y-3">
        <h4 className="text-[9px] font-black text-white/30 uppercase tracking-[0.25em] text-left">Pessoas Promovidas (Operadores com Chaves Master)</h4>

        {masterAuthorizations.length === 0 ? (
          <div className="p-8 text-center bg-black/40 border border-white/5 rounded-xl">
            <p className="text-[9.5px] text-white/20 font-bold lowercase tracking-widest italic uppercase">Nenhum operador promovido a nível Master de liberação no momento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/5 text-[7.5px] font-black text-white/30 uppercase tracking-widest">
                  <th className="pb-3 text-left">Supervisor / Detalhes</th>
                  <th className="pb-3 text-left">Função no Sistema</th>
                  <th className="pb-3 text-left">Chaves Proximidade NFC</th>
                  <th className="pb-3 text-left">Chaves QR Codes</th>
                  <th className="pb-3 text-left">Status</th>
                  <th className="pb-3 text-left">Escopos Permitidos</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {masterAuthorizations.map((auth) => {
                  const user = users.find(u => u.id === auth.userId);
                  if (!user) return null;
                  const roleName = userRoles.find((r) => r.id === user.roleId)?.name || 'Operacional';
                  const userBadges = masterBadges.filter(b => b.authorizationId === auth.id);
                  
                  // Query user NFC tags
                  const userNfcs = nfcTags.filter(t => t.usuarioVinculado === user.id && t.status !== 'Excluido');

                  // Decrypt scope perms
                  let cleanObs = auth.observation || '';
                  let loadedPerms: string[] = ['cancelamento'];
                  if (cleanObs.includes('[Perms:')) {
                    const parts = cleanObs.split(' [Perms: ');
                    cleanObs = parts[0];
                    loadedPerms = parts[1]?.replace(']', '').split(',') || [];
                  }

                  return (
                    <tr key={auth.id} className="group hover:bg-white/[0.01]">
                      {/* Name / profile block */}
                      <td className="py-3.5 pr-3">
                        <div className="flex flex-col text-left">
                          <span className="text-[11px] font-black text-white uppercase tracking-wider">{user.fullName}</span>
                          <span className="text-[8px] text-white/30 font-mono tracking-wide mt-0.5">ID: {user.login} {cleanObs && `• ${cleanObs}`}</span>
                        </div>
                      </td>

                      {/* Cargo */}
                      <td className="py-3.5 pr-2">
                        <span className="text-[9px] font-mono font-bold text-white/50 uppercase tracking-wider">{roleName}</span>
                      </td>

                      {/* NFC badge link status (Fase 3: NFC vinculado) */}
                      <td className="py-3.5 pr-2">
                        {userNfcs.length > 0 ? (
                          <div className="space-y-1 text-left">
                            {userNfcs.map(nfc => (
                              <div key={nfc.id} className="flex items-center gap-1.5 p-1 bg-white/[0.01] border border-white/5 rounded">
                                <Tag className="w-2.5 h-2.5 text-emerald-400" />
                                <span className="font-mono text-[8px] text-white uppercase tracking-wide">{nfc.uid}</span>
                                <button
                                  onClick={() => {
                                    if(confirm('Desvincular NFC Master deste usuário?')) {
                                      updateNFCTag(nfc.id, {
                                        usuarioVinculado: null,
                                        tipoCredencial: 'OPERADOR',
                                        status: 'Livre'
                                      });
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded bg-transparent hover:bg-red-500/10 flex items-center justify-center text-white/20 hover:text-red-400 transition-colors ml-auto"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-left">
                            {linkingNfcAuthId === auth.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="Digite UID"
                                  value={nfcUidInput}
                                  onChange={(e) => setNfcUidInput(e.target.value)}
                                  className="w-16 h-6 px-1.5 bg-black border border-white/10 rounded text-[7.5px] font-mono text-white outline-none focus:border-emerald-500 uppercase"
                                />
                                <button
                                  onClick={() => handleLinkNfcRowSubmit(auth.id, user.id)}
                                  className="px-1.5 h-6 bg-emerald-500 text-black rounded text-[7px] font-black uppercase"
                                >
                                  Ok
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setLinkingNfcAuthId(auth.id);
                                  setNfcUidInput('');
                                }}
                                className="py-1 px-2.5 bg-white/5 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/20 text-[7px] font-black uppercase tracking-wider rounded text-emerald-400 transition-all cursor-pointer"
                              >
                                + Vincular RFID
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* QR badge link status & control */}
                      <td className="py-3.5 pr-2">
                        <div className="space-y-1 text-left">
                          
                          {/* Standard system QR fallback linkage */}
                          {user.qrCodeToken && (
                            <div className="text-[7.5px] font-bold text-white/30 flex items-center gap-1 pb-1">
                              <span className="w-1 h-1 rounded-full bg-emerald-400" />
                              QR Padrão Liberado ({user.qrCodeToken})
                            </div>
                          )}

                          {/* Created master separate keys */}
                          {userBadges.map(badge => (
                            <div key={badge.id} className="flex items-center justify-between gap-1 p-1 bg-black/40 border border-white/5 rounded">
                              <div className="hidden">
                                <StandardQRCode id={`qr-master-${badge.codigoMaster}`} value={badge.codigoMaster} size={90} />
                              </div>
                              <span className="font-mono text-[8.5px] font-bold text-white tracking-wide">{badge.codigoMaster}</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  onClick={() => updateMasterBadgeStatus(badge.id, badge.status === 'ativo' ? 'bloqueado' : 'ativo')}
                                  className="p-0.5 text-white/30 hover:text-white"
                                  title={badge.status === 'ativo' ? 'Bloquear Crachá' : 'Ativar Crachá'}
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={() => downloadMasterBadgeSVG(badge.codigoMaster, user.fullName)}
                                  className="p-0.5 text-emerald-400 hover:text-emerald-300"
                                  title="Baixar Crachá SVG Físico"
                                >
                                  <Download className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  onClick={() => deleteMasterBadge(badge.id)}
                                  className="p-0.5 text-red-500 hover:text-red-400"
                                >
                                  <Trash2 className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {userBadges.length < 3 && auth.status === 'ativo' && (
                            <button
                              onClick={async () => {
                                const res = await generateMasterBadge(auth.id);
                                if (!res.success) alert(res.error);
                              }}
                              className="py-0.5 px-2 bg-emerald-500/10 hover:bg-emerald-500 hover:text-black transition-all rounded text-[6.5px] font-black uppercase text-emerald-400 block border border-emerald-500/15"
                            >
                              + Gerar QR Master ({userBadges.length}/3)
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 pr-2">
                        <span className={`px-1.5 py-0.5 text-[6.5px] font-black uppercase rounded border ${auth.status === 'ativo' ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20' : 'bg-red-500/15 text-red-500 border-red-500/20'}`}>
                          {auth.status === 'ativo' ? 'OPERATIVO' : 'SUSPENSO'}
                        </span>
                      </td>

                      {/* Escopos de liberação */}
                      <td className="py-3.5 pr-2 max-w-[150px]">
                        <div className="flex flex-wrap gap-1">
                          {loadedPerms.map(pName => (
                            <span key={pName} className="px-1 py-0.5 bg-neutral-900 border border-white/5 rounded text-[6.5px] font-black text-white/50 uppercase">
                              {pName?.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Controls */}
                      <td className="py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                          
                          {/* Feed auditoria do usuario supervisor (Fase 3: auditoria) */}
                          <button
                            onClick={() => setAuditUserObj(user)}
                            className="p-1 bg-white/5 hover:bg-white/10 rounded text-white/40 hover:text-white"
                            title="Ver Auditoria do Supervisor"
                          >
                            <ScrollText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleEdit(auth)}
                            className="p-1 bg-white/5 hover:bg-white/10 rounded text-amber-500 hover:text-amber-400"
                            title="Editar Atribuição"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => updateMasterAuthorization(auth.id, { status: auth.status === 'ativo' ? 'inativo' : 'ativo' })}
                            className="p-1 bg-white/5 hover:bg-white/10 rounded text-white/40 hover:text-white"
                            title={auth.status === 'ativo' ? 'Bloquear temporário' : 'Ativar credencial'}
                          >
                            <Lock className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              if (confirm(`Revogar em caráter irrevogável todas as credenciais e acessos Master de ${user.fullName}?`)) {
                                deleteMasterAuthorization(auth.id);
                              }
                            }}
                            className="p-1 bg-white/5 hover:bg-red-500/20 border border-transparent hover:border-red-500/10 rounded text-red-500"
                            title="Revogar Privilégios Master"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Drawer Modal */}
      {auditUserObj && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={() => setAuditUserObj(null)}>
          <div className="bg-[#121212] border border-emerald-500/20 p-5 rounded-2xl max-w-lg w-full space-y-4 text-left duration-300 zoom-in-100" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-white/5">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Histórico de Auditoria do Supervisor</h4>
                <p className="text-[8px] text-white/40 uppercase mt-0.5">{auditUserObj.fullName} ({auditUserObj.login})</p>
              </div>
              <button onClick={() => setAuditUserObj(null)} className="text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {useStore.getState().auditLogs
                .filter(log => log.userId === auditUserObj.id || log.userLogin === auditUserObj.login || log.description?.includes(auditUserObj.fullName))
                .length === 0 ? (
                  <p className="text-[8.5px] text-white/20 italic uppercase py-8 text-center bg-black/30 rounded border border-white/5">Nenhum evento registrado para este supervisor master nesta base de auditoria.</p>
                ) : (
                  useStore.getState().auditLogs
                    .filter(log => log.userId === auditUserObj.id || log.userLogin === auditUserObj.login || log.description?.includes(auditUserObj.fullName))
                    .map((log: any) => (
                      <div key={log.id} className="p-2 bg-black border border-white/5 rounded text-[8px] leading-relaxed uppercase">
                        <div className="flex justify-between text-white/30 text-[7px] pb-1 font-mono">
                          <span className="text-emerald-400 font-bold">{log.action || 'AÇÃO MASTER'}</span>
                          <span>{new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                        </div>
                        <p className="text-white/80">{log.description}</p>
                      </div>
                    ))
                )}
            </div>

            <button
              onClick={() => setAuditUserObj(null)}
              className="w-full py-2 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-600 transition-colors"
            >
              Fechar Auditoria
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
