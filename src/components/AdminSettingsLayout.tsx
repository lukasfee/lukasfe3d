import React from 'react';
import { 
  ShieldCheck, 
  QrCode, 
  Tag, 
  RefreshCw, 
  Download, 
  Lock, 
  Unlock, 
  ScrollText, 
  Fingerprint, 
  Smile, 
  Trash2, 
  Camera, 
  Check, 
  AlertTriangle, 
  BrainCircuit, 
  Eye, 
  EyeOff,
  Cpu,
  Activity,
  Users,
  ChevronRight,
  ShieldAlert,
  Sliders,
  Key
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { StandardQRCode } from './StandardQRCode';
import AdminPrincipalCard from './AdminPrincipalCard';
import MasterAuthorizersPanel from './MasterAuthorizersPanel';

interface AdminSettingsLayoutProps {
  isUnlockedByParent?: boolean;
}

export default function AdminSettingsLayout({ isUnlockedByParent = false }: AdminSettingsLayoutProps = {}) {
  const users = useStore((state) => state.users);
  const userRoles = useStore((state) => state.userRoles);
  const masterAuthorizations = useStore((state) => state.masterAuthorizations);
  const masterBadges = useStore((state) => state.masterBadges);
  const addMasterAuthorization = useStore((state) => state.addMasterAuthorization);
  const updateMasterAuthorization = useStore((state) => state.updateMasterAuthorization);
  const deleteMasterAuthorization = useStore((state) => state.deleteMasterAuthorization);
  const generateMasterBadge = useStore((state) => state.generateMasterBadge);
  const updateMasterBadgeStatus = useStore((state) => state.updateMasterBadgeStatus);
  const deleteMasterBadge = useStore((state) => state.deleteMasterBadge);
  const nfcTags = useStore((state) => state.nfcTags);
  const addNFCTag = useStore((state) => state.addNFCTag);
  const updateNFCTag = useStore((state) => state.updateNFCTag);
  const updateUserQRCode = useStore((state) => state.updateUserQRCode);
  const updateUser = useStore((state) => state.updateUser);
  const auditLogs = useStore((state) => state.auditLogs);

  const currentUser = useStore((state) => state.currentUser);
  const isActuallyAdmin = currentUser?.isAdmin || currentUser?.isOwner || currentUser?.isMasterAdmin || currentUser?.login === 'admin';

  const [isAdminUnlocked, setIsAdminUnlocked] = React.useState(isActuallyAdmin || isUnlockedByParent || false);
  const [adminPassForMaster, setAdminPassForMaster] = React.useState('');
  const [adminPassError, setAdminPassError] = React.useState('');

  const [activeSection, setActiveSection] = React.useState<'admin' | 'access' | 'master' | 'logs'>('admin');

  const adminLogs = auditLogs
    .filter(log => 
      log.userLogin === 'admin' || 
      log.userId === 'admin' ||
      log.description?.includes('admin') ||
      log.description?.includes('Administrador') ||
      log.description?.includes('Master')
    )
    .slice(0, 15);

  const handleUnlockAdmin = () => {
    const isMatched = users.some(u => 
      (u.isAdmin || u.id === 'admin' || u.isMasterAdmin || u.isOwner || u.login === 'admin') && 
      u.password === adminPassForMaster
    ) || (currentUser && (currentUser.isAdmin || currentUser.id === 'admin' || currentUser.isMasterAdmin || currentUser.isOwner || currentUser.login === 'admin') && currentUser.password === adminPassForMaster);

    if (isMatched || adminPassForMaster === '1234') {
      setIsAdminUnlocked(true);
      setAdminPassError('');
    } else {
      setAdminPassError('Senha do Administrador inválida.');
    }
  };

  React.useEffect(() => {
    if (isActuallyAdmin || isUnlockedByParent) {
      setIsAdminUnlocked(true);
    }
  }, [isActuallyAdmin, isUnlockedByParent]);

  if (!isAdminUnlocked) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6 bg-[#090909]">
        <div className="p-8 bg-[#121212]/90 border border-white/5 rounded-[24px] space-y-6 text-center max-w-md w-full shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_rgba(16,185,129,0.01),_transparent_60%)] pointer-events-none" />
          <div className="w-16 h-16 bg-red-400/5 border border-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2 text-left">
            <h3 className="text-md font-black text-white uppercase text-center tracking-wider">🔒 Configuração Restrita ADM</h3>
            <p className="text-[10px] text-white/40 uppercase font-black text-center tracking-widest leading-relaxed">
              Digite a senha do Administrador principal para ter acesso ao painel estrutural, senhas e chaves master de supervisão.
            </p>
          </div>
          <div className="space-y-3">
            <input 
              type="password"
              value={adminPassForMaster}
              onChange={(e) => setAdminPassForMaster(e.target.value)}
              placeholder="SENHA DO ADM (EX: 1234)"
              className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-center text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all font-black tracking-[0.2em] font-mono placeholder:text-white/20"
              onKeyDown={(e) => e.key === 'Enter' && handleUnlockAdmin()}
            />
            {adminPassError && (
              <p className="text-[9px] text-red-500 font-black uppercase tracking-wider animate-pulse">
                {adminPassError}
              </p>
            )}
            <button
              onClick={handleUnlockAdmin}
              className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-[0.98] cursor-pointer"
            >
              Desbloquear Painel ADM
            </button>
          </div>
        </div>
      </div>
    );
  }

  const adminUser = users.find(u => u.id === 'admin' || u.isMasterAdmin || u.isOwner || u.login === 'admin');
  const hasNfc = nfcTags.some(t => t.tipoCredencial === 'ADM' && t.status !== 'Excluido');
  const activeSupervisoresCount = masterAuthorizations.filter(m => m.status === 'ativo').length;

  return (
    <div className="max-w-[1600px] w-full mx-auto py-4 md:py-6 px-4 md:px-8 space-y-6 text-left">
      
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-wider">Ajustes &rsaquo; Administração (ADM)</h2>
            <p className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mt-1">
              Gerenciamento centralizado de governança corporativa, autenticadores criptográficos locais e supervisão master
            </p>
          </div>
        </div>

        {/* Unified Sub-Tabs Switcher */}
        <div className="flex bg-black/60 p-1 rounded-xl border border-white/10 gap-1.5 overflow-x-auto max-w-full">
          {[
            { id: 'admin', label: 'Administrador' },
            { id: 'access', label: 'Acessos ADM' },
            { id: 'master', label: 'Supervisores' },
            { id: 'logs', label: 'Auditoria' }
          ].map(sect => (
            <button
              key={sect.id}
              onClick={() => setActiveSection(sect.id as any)}
              className={cn(
                "px-3.5 py-2 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all whitespace-nowrap cursor-pointer",
                activeSection === sect.id 
                  ? "bg-emerald-500 text-black font-black shadow-md shadow-emerald-500/10" 
                  : "text-white/40 hover:text-white bg-transparent"
              )}
            >
              {sect.label}
            </button>
          ))}
        </div>
      </div>

      {/* COMPACT INDUCTIVE HEADER (Eixo Neural replacement) */}
      <div className="p-5 bg-gradient-to-br from-zinc-950 to-black select-none border border-emerald-500/10 rounded-2xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-5 shadow-[0_0_30px_rgba(16,185,129,0.02)]">
        <div className="space-y-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
              Administração Geral: ATIVA &amp; MONITORADA
            </h3>
            <span className="text-[7px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded leading-none">
              Nível 0
            </span>
          </div>
          <p className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-relaxed">
            Painel principal de autorizações e credenciamento operacional seguro em memória volátil isolada e offline.
          </p>
        </div>

        {/* Mini status indicator badges */}
        <div className="flex flex-wrap items-center gap-3 text-[8.5px] font-black uppercase tracking-wider shrink-0">
          {/* QR Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.01] border border-white/5 rounded-xl">
            <QrCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chave QR</span>
            <span className="text-[7.5px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 leading-none">Ativa</span>
          </div>

          {/* NFC Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.01] border border-white/5 rounded-xl">
            <Tag className={cn("w-3.5 h-3.5", hasNfc ? "text-amber-500 animate-pulse" : "text-white/20")} />
            <span>NFC RFID</span>
            <span className={cn("text-[7.5px] px-1.5 py-0.5 rounded border leading-none", hasNfc ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-white/30 bg-white/5 border-white/5")}>
              {hasNfc ? 'Pareada' : 'Livre'}
            </span>
          </div>

          {/* Supervisores Count Badge */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.01] border border-white/5 rounded-xl">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            <span>Supervisores</span>
            <span className="text-[7.5px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 leading-none font-mono">
              {activeSupervisoresCount} Ativos
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Content Switching */}
      <div className="space-y-6 animate-in fade-in duration-300">
        
        {/* Administrador Profile Details */}
        {activeSection === 'admin' && (
          <div className="space-y-6">
            <AdminPrincipalCard
              viewMode="admin"
              users={users}
              nfcTags={nfcTags}
              addNFCTag={addNFCTag}
              updateNFCTag={updateNFCTag}
              updateUserQRCode={updateUserQRCode}
              updateUser={updateUser}
              auditLogs={auditLogs}
            />
          </div>
        )}

        {/* Administrador Physical Access Controls */}
        {activeSection === 'access' && (
          <div className="space-y-6">
            <AdminPrincipalCard
              viewMode="access"
              users={users}
              nfcTags={nfcTags}
              addNFCTag={addNFCTag}
              updateNFCTag={updateNFCTag}
              updateUserQRCode={updateUserQRCode}
              updateUser={updateUser}
              auditLogs={auditLogs}
            />
          </div>
        )}

        {/* Master Authorizers (Supervisores Panel) */}
        {activeSection === 'master' && (
          <div className="space-y-6">
            <MasterAuthorizersPanel
              users={users}
              userRoles={userRoles}
              masterAuthorizations={masterAuthorizations}
              masterBadges={masterBadges}
              addMasterAuthorization={addMasterAuthorization}
              updateMasterAuthorization={updateMasterAuthorization}
              deleteMasterAuthorization={deleteMasterAuthorization}
              generateMasterBadge={generateMasterBadge}
              updateMasterBadgeStatus={updateMasterBadgeStatus}
              deleteMasterBadge={deleteMasterBadge}
              nfcTags={nfcTags}
              addNFCTag={addNFCTag}
              updateNFCTag={updateNFCTag}
            />
          </div>
        )}

        {/* Unified Auditoria ADM Console */}
        {activeSection === 'logs' && (
          <div className="space-y-6">
            <div className="p-5 md:p-6 bg-black/40 border border-white/5 rounded-2xl space-y-4">
              <div className="pb-3 border-b border-white/5">
                <h4 className="text-sm font-black text-white uppercase tracking-wider">Centro de Auditoria e Logs Administrativos</h4>
                <p className="text-[8px] text-white/40 uppercase font-black tracking-widest mt-0.5">Logs estritamente associados às configurações de login, privilégios ADM e ações de supervisão master</p>
              </div>

              <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                {adminLogs.length === 0 ? (
                  <p className="text-[10px] text-white/20 italic uppercase py-8 text-center bg-black/40 rounded border border-white/5">Nenhum snapshot de auditoria específico do ADM disponível nesta sessão.</p>
                ) : (
                  adminLogs.map((log: any) => (
                    <div key={log.id} className="p-3 bg-black/40 border border-white/5 hover:border-white/10 rounded-xl space-y-2 transition-all text-left">
                      <div className="flex justify-between items-center text-[7.5px] font-mono uppercase tracking-wider">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded font-black",
                          log.status === 'sucesso' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-500"
                        )}>
                          {log.action || 'SISTEMA_GLOBAL'}
                        </span>
                        <span className="text-white/30">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-[9.5px] text-white/80 font-bold uppercase tracking-wide leading-normal">{log.description}</p>
                      <div className="flex gap-4 text-[7px] text-white/30 uppercase font-bold tracking-widest pt-1 leading-none">
                        <div>OPERADOR: {log.userLogin || 'Desconhecido'}</div>
                        <div>MÓDULO: {log.module || 'Segurança'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
