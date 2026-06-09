import React from 'react';
import { 
  ShieldCheck, 
  QrCode, 
  Tag, 
  RefreshCw, 
  Download, 
  Lock, 
  Unlock, 
  X, 
  ScrollText, 
  Terminal, 
  ShieldAlert,
  Fingerprint,
  Smile,
  Trash2,
  Camera,
  Check,
  AlertTriangle,
  BrainCircuit,
  Eye
} from 'lucide-react';
import { useStore, User, NFCTag, AuditLog, Badge } from '../store';
import { format } from 'date-fns';
import { StandardQRCode } from './StandardQRCode';
import { AnimatePresence, motion } from 'motion/react';
import QRScanner from './QRScanner';
import { environmentService } from '../services/environmentService';

interface AdminPrincipalCardProps {
  users: any[];
  nfcTags: any[];
  addNFCTag: (uid: string, tagLabel: string) => Promise<{ success: boolean; error?: string }>;
  updateNFCTag: (id: string, fields: any) => Promise<{ success: boolean; error?: string }>;
  updateUserQRCode: (userId: string) => void;
  updateUser: (userId: string, fields: any) => Promise<void> | void;
  auditLogs: any[];
  viewMode?: 'admin' | 'access';
}

export default function AdminPrincipalCard({
  users,
  nfcTags,
  addNFCTag,
  updateNFCTag,
  updateUserQRCode,
  updateUser,
  auditLogs,
  viewMode = 'admin',
}: AdminPrincipalCardProps) {
  const adminUser = users.find(u => u.id === 'admin' || u.isMasterAdmin || u.isOwner || u.login === 'admin');
  const adminNfcTag = nfcTags.find(t => t.tipoCredencial === 'ADM' && t.status !== 'Excluido');
  
  // Specific ADM Audit logs
  const adminLogs = auditLogs
    .filter(log => 
      log.userLogin === 'admin' || 
      log.userId === 'admin' ||
      log.description?.includes('admin') ||
      log.description?.includes('Administrador')
    )
    .slice(0, 5);

  const [isLinkingNfc, setIsLinkingNfc] = React.useState(false);
  const [nfcUidInput, setNfcUidInput] = React.useState('');
  const [nfcError, setNfcError] = React.useState('');
  
  // Admin Principal data editing states
  const [isEditingAdmin, setIsEditingAdmin] = React.useState(false);
  const [editFullName, setEditFullName] = React.useState(adminUser?.fullName || '');
  const [editLogin, setEditLogin] = React.useState(adminUser?.login || '');
  const [editPassword, setEditPassword] = React.useState(adminUser?.password || '');
  const [editError, setEditError] = React.useState('');
  const [editImage, setEditImage] = React.useState(adminUser?.image || '');

  // Password change states
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmNewPassword, setConfirmNewPassword] = React.useState('');

  // Testing states
  const [isQRTesting, setIsQRTesting] = React.useState(false);
  const [isTestingNfc, setIsTestingNfc] = React.useState(false);
  const [isScanningForRegister, setIsScanningForRegister] = React.useState(false);
  const [nfcTestUid, setNfcTestUid] = React.useState('');
  const [nfcTestResult, setNfcTestResult] = React.useState<string | null>(null);
  const [scannedAdminToken, setScannedAdminToken] = React.useState<{ token: string; typeString: string } | null>(null);

  React.useEffect(() => {
    if (adminUser) {
      setEditFullName(adminUser.fullName || '');
      setEditLogin(adminUser.login || '');
      setEditPassword(adminUser.password || '');
      setEditImage(adminUser.image || '');
    }
  }, [adminUser]);

  const handleSaveAdminDetails = () => {
    setEditError('');
    const cleanName = editFullName.trim();

    if (!cleanName) {
      setEditError('O nome do administrador é obrigatório.');
      return;
    }

    const sanitizedLogin = editLogin.trim().toLowerCase();
    if (!sanitizedLogin) {
      setEditError('O login/matrícula do administrador é obrigatório.');
      return;
    }

    const duplicateLogin = users.some(
      (u) => u.id !== 'admin' && (u.login || u.matricula || '').trim().toLowerCase() === sanitizedLogin
    );

    if (duplicateLogin) {
      setEditError('Este login/matrícula já está em uso por outro colaborador.');
      return;
    }

    // Check if user is filling in password change fields
    if (currentPassword || newPassword || confirmNewPassword) {
      if (currentPassword !== adminUser?.password) {
        setEditError('A senha atual inserida está incorreta.');
        return;
      }
      if (!newPassword) {
        setEditError('A nova senha é obrigatória quando há tentativa de alteração.');
        return;
      }
      if (newPassword.length < 4) {
        setEditError('A nova senha de administrador deve conter pelo menos 4 caracteres.');
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setEditError('A confirmação da nova senha não coincide.');
        return;
      }
    }

    if (adminUser) {
      const nextPwd = newPassword ? newPassword.trim() : adminUser.password;
      
      updateUser(adminUser.id, {
        fullName: cleanName,
        login: sanitizedLogin,
        matricula: sanitizedLogin,
        password: nextPwd,
        image: editImage,
        roleId: 'administrador',
        status: 'ativo',
        isAdmin: true,
        isOwner: true,
        isMasterAdmin: true
      });

      useStore.getState().logAction({
        module: 'Segurança',
        actionType: 'security',
        action: 'Atualizar Dados ADM',
        description: `Dados cadastrais do Administrador atualizados (${cleanName}), login/matrícula alterado para: ${sanitizedLogin}${newPassword ? ' e a senha foi alterada' : ''}`,
        status: 'sucesso'
      });

      // Reset password states
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setIsEditingAdmin(false);
      alert('Dados do Administrador Principal atualizados com sucesso!');
    }
  };

  const handleTestNfc = () => {
    setNfcTestResult(null);
    const cleanUid = nfcTestUid.trim().toUpperCase();
    if (!cleanUid) {
      setNfcTestResult('ERRO: DIGITE UM UID DA TAG PARA TESTAR.');
      return;
    }

    // Is it matching the active ADM tag?
    if (adminNfcTag && adminNfcTag.uid.trim().toUpperCase() === cleanUid) {
      if (adminNfcTag.status === 'Bloqueado') {
        setNfcTestResult('FALHA: TAG CONECTADA DO ADM ENCONTRADA PORÉM ESTÁ BLOQUEADA!');
      } else {
        setNfcTestResult('SUCESSO! TAG DO ADMINISTRADOR PRINCIPAL VALIDADA COM SUCESSO (NÍVEL 0).');
      }
      return;
    }

    // Is it matching some other tag in the list?
    const foundTag = nfcTags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');
    if (foundTag) {
      if (foundTag.status === 'Bloqueado') {
        setNfcTestResult(`FALHA: TAG ENCONTRADA PARA ${foundTag.usuarioVinculado || 'OPERADOR'} MAS ESTÁ BLOQUEADA.`);
      } else {
        setNfcTestResult(`SUCESSO TRÂNSITO: TAG ENCONTRADA VINCULADA A: ${foundTag.usuarioVinculado || 'OPERADOR'} (${foundTag.tipoCredencial}).`);
      }
    } else {
      setNfcTestResult('FALHA: NENHUM VÍNCULO FÍSICO COM ESTE UID FOI DETECTADO NO BANCO DE DADOS.');
    }
  };
  
  // Extra interactive states requested
  const qrBlocked = adminUser?.qrCodeBlocked || false;
  const [showQRLarge, setShowQRLarge] = React.useState(false);
  const [attemptsInfo, setAttemptsInfo] = React.useState(0);
  const [credStatus, setCredStatus] = React.useState<'ATIVO & PROTEGIDO' | 'BLOQUEADO' | 'REQUER AUDITORIA'>('ATIVO & PROTEGIDO');

  const handleLinkNfcSubmit = async () => {
    setNfcError('');
    const cleanUid = nfcUidInput.trim().toUpperCase();
    if (!cleanUid) {
      setNfcError('UID inválido.');
      return;
    }

    const existingTag = nfcTags.find(t => t.uid.trim().toUpperCase() === cleanUid && t.status !== 'Excluido');
    if (existingTag && existingTag.usuarioVinculado && existingTag.usuarioVinculado !== 'admin') {
      setNfcError('Esta tag já está vinculada a outro usuário do sistema.');
      return;
    }

    if (existingTag) {
      const res = await updateNFCTag(existingTag.id, {
        tipoCredencial: 'ADM',
        usuarioVinculado: 'admin',
        status: 'Vinculado'
      });
      if (!res.success) {
        setNfcError(res.error || 'Erro ao vincular.');
        return;
      }
    } else {
      const addRes = await addNFCTag(cleanUid, 'Tag Administrador Principal');
      if (!addRes.success) {
        setNfcError(addRes.error || 'Erro ao cadastrar.');
        return;
      }
      
      const freshTags = useStore.getState().nfcTags || [];
      const freshTag = freshTags.find(t => t.uid.trim().toUpperCase() === cleanUid);
      if (freshTag) {
        await updateNFCTag(freshTag.id, {
          tipoCredencial: 'ADM',
          usuarioVinculado: 'admin',
          status: 'Vinculado'
        });
      }
    }

    useStore.getState().logAction({
      module: 'Segurança',
      actionType: 'security',
      action: 'Vínculo NFC ADM',
      description: `Tag NFC ADM vinculada com sucesso para administrador (UID: ${cleanUid})`,
      status: 'sucesso'
    });

    setIsLinkingNfc(false);
    setNfcUidInput('');
  };

  const handleOnScanQRRegister = (scannedToken: string) => {
    setIsScanningForRegister(false);
    const cleanCode = scannedToken.trim();
    if (!cleanCode) {
      alert('QR Code lido é vazio.');
      return;
    }

    let tokenToLink = "";
    let qrTypeString = "";
    let isCompatible = true;

    try {
      if (cleanCode.startsWith("{")) {
        const parsed = JSON.parse(cleanCode);
        if (parsed && parsed.type === "admin-badge" && parsed.tokenId) {
          tokenToLink = parsed.tokenId;
          qrTypeString = "Crachá do Administrador (Legacy JSON)";
        } else {
          isCompatible = false;
        }
      } else {
        // Simple string compatibility constraints:
        const isUrl = cleanCode.startsWith("http://") || cleanCode.startsWith("https://") || cleanCode.includes("://");
        const hasSpecialStructures = cleanCode.startsWith("<") || cleanCode.startsWith("[") || cleanCode.includes("\n") || cleanCode.includes("\r");
        const hasSpaces = cleanCode.includes(" ");
        const tooLong = cleanCode.length > 60;
        const tooShort = cleanCode.length < 4;

        if (isUrl || hasSpecialStructures || hasSpaces || tooLong || tooShort) {
          isCompatible = false;
        } else {
          tokenToLink = cleanCode;
          qrTypeString = "Token de Crachá Simples (Novo)";
        }
      }
    } catch (_) {
      isCompatible = false;
    }

    if (!isCompatible || !tokenToLink) {
      alert("Este QR Code não é compatível com login de administrador.");
      return;
    }

    if (!adminUser?.id) {
      alert("Erro: Nenhum usuário administrador selecionado!");
      return;
    }

    // Check unique registration across all modules in the store state
    const state = useStore.getState();
    const allProducts = state.products || [];
    const allSales = state.sales || [];
    const allClients = state.clients || [];

    const usedInProducts = allProducts.some(p => 
      (p.code && p.code.trim() === tokenToLink) || 
      (p.barcode && p.barcode.trim() === tokenToLink) || 
      p.id === tokenToLink
    );

    const usedInSales = allSales.some(s => 
      s.id === tokenToLink || 
      (s.orderNumber && s.orderNumber.trim() === tokenToLink)
    );

    const usedInClients = allClients.some(c => 
      c.id === tokenToLink || 
      (c.document && c.document.trim() === tokenToLink)
    );

    if (usedInProducts || usedInSales || usedInClients) {
      alert("Este código já está cadastrado no sistema (Produtos/Vendas/Clientes) e não pode ser reutilizado.");
      return;
    }

    setScannedAdminToken({
      token: tokenToLink,
      typeString: qrTypeString,
    });
  };

  const handleConfirmLinkAdminToken = () => {
    if (!scannedAdminToken || !adminUser?.id) return;

    const newToken = scannedAdminToken.token;
    const registerExistingQRCode = useStore.getState().registerExistingQRCode;
    const result = registerExistingQRCode(newToken, adminUser.id);

    if (!result.success && result.alreadyExists) {
      if (confirm(result.message)) {
        const forceRes = registerExistingQRCode(newToken, adminUser.id, true);
        if (forceRes.success) {
          alert(forceRes.message);
          setScannedAdminToken(null);
        } else {
          alert(forceRes.message || "Erro ao transferir vínculo.");
        }
      }
    } else {
      alert(result.message);
      setScannedAdminToken(null);
    }
  };

  const handleEraseQR = () => {
    if (adminUser) {
      if (confirm('Tem certeza de que deseja apagar o QR Code do Administrador? Ele não poderá mais acessar via QR Code até cadastrar um novo.')) {
        updateUser(adminUser.id, { qrCodeToken: '' });
        useStore.getState().logAction({
          module: 'Segurança',
          actionType: 'security',
          action: 'Apagar QR ADM',
          description: 'QR Code do Administrador Principal foi apagado com sucesso.',
          status: 'sucesso'
        });
        alert('QR Code apagado com sucesso!');
      }
    }
  };

  const handleBlockQR = () => {
    if (!adminUser) return;
    const nextState = !qrBlocked;
    
    // Update the user object status
    updateUser(adminUser.id, { qrCodeBlocked: nextState });

    // Synchronize and restore associated Badge link in the store state
    const storeState = useStore.getState();
    const qrToken = adminUser.qrCodeToken;
    if (qrToken) {
      const badge = (storeState.badges || []).find(b => b.codigoCracha === qrToken || b.id === adminUser.badgeId);
      if (badge) {
        storeState.updateBadge(badge.id, {
          status: nextState ? 'Bloqueado' : 'Vinculado',
          usuarioVinculado: adminUser.id,
          blocked: nextState,
          isBlocked: nextState,
          active: !nextState,
          isActive: !nextState
        });
      } else {
        // If badge not found, create one to ensure perfect system structure
        const newBadgeId = 'badge-adm-' + adminUser.id;
        const newBadge: Badge = {
          id: newBadgeId,
          codigoCracha: qrToken,
          status: nextState ? 'Bloqueado' : 'Vinculado',
          usuarioVinculado: adminUser.id,
          dataCriacao: Date.now(),
          ultimoUso: null,
          blocked: nextState,
          isBlocked: nextState,
          active: !nextState,
          isActive: !nextState
        };
        useStore.setState(state => ({
          badges: [...(state.badges || []).filter(b => b.codigoCracha !== qrToken), newBadge],
          users: state.users.map(u => u.id === adminUser.id ? { ...u, badgeId: newBadgeId } : u)
        }));
      }
    }

    useStore.getState().logAction({
      module: 'Segurança',
      actionType: 'security',
      action: nextState ? 'Bloquear QR ADM' : 'Restaurar QR ADM',
      description: `Acesso via QR Code ADM ${nextState ? 'bloqueado' : 'restaurado'} temporariamente`,
      status: 'sucesso'
    });
    alert(`QR Code ADM ${nextState ? 'bloqueado' : 'restaurado e ativo'}!`);
  };

  // Corporate design Vector printable card SVG Download
  const downloadAdminBadgeSVG = () => {
    const token = adminUser?.qrCodeToken || 'admin_emergency_token';
    const name = adminUser?.fullName || 'ADMINISTRADOR PRINCIPAL';
    const matricula = adminUser?.matricula || 'MAT-0001-ADM';

    const svgEl = document.getElementById('admin-svg-qr-source');
    let qrPath = '';
    if (svgEl) {
      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(svgEl);
      source = source.replace(/width="\d+"/i, 'width="120"');
      source = source.replace(/height="\d+"/i, 'height="120"');
      qrPath = source;
    }

    const finalSvg = `
<svg width="400" height="250" viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg">
  <!-- Fundo corporativo de segurança máxima -->
  <defs>
    <linearGradient id="backGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a0a" />
      <stop offset="100%" stop-color="#1c1c1c" />
    </linearGradient>
    <linearGradient id="neonRedBlue" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EF4444" />
      <stop offset="100%" stop-color="#F59E0B" />
    </linearGradient>
  </defs>

  <rect width="400" height="250" rx="20" fill="url(#backGrad)" stroke="url(#neonRedBlue)" stroke-width="3"/>
  <rect x="8" y="8" width="384" height="234" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.04" stroke-width="1"/>
  
  <text x="30" y="42" font-family="'Inter', sans-serif" font-size="9" font-weight="900" fill="#EF4444" letter-spacing="3">CREDENCIAL CRÍTICA ADMINISTRATIVA</text>
  <text x="30" y="68" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#FFFFFF" letter-spacing="0.5">ADMINISTRADOR PRINCIPAL</text>
  <text x="30" y="85" font-family="'Inter', sans-serif" font-size="9.5" font-weight="700" fill="#9CA3AF" letter-spacing="1.5">CONTROLE GLOBAL OPERACIONAL</text>

  <line x1="30" y1="102" x2="245" y2="102" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1"/>

  <text x="30" y="130" font-family="'Inter', sans-serif" font-size="8" font-weight="800" fill="#EF4444" letter-spacing="1">MATRÍCULA INSTITUCIONAL</text>
  <text x="30" y="148" font-family="'Fira Code', monospace" font-size="13" font-weight="800" fill="#FFFFFF">${matricula}</text>

  <text x="30" y="182" font-family="'Inter', sans-serif" font-size="8" font-weight="800" fill="#9CA3AF" letter-spacing="1">STATUS OPERACIONAL</text>
  <text x="30" y="198" font-family="'Inter', sans-serif" font-size="11" font-weight="900" fill="#10B981">AUTORIZADO &amp; ATIVO</text>

  <rect x="260" y="115" width="110" height="110" rx="12" fill="#FFFFFF"/>
  <g transform="translate(265, 120)">
    <rect width="100" height="100" fill="#FFFFFF" />
    <svg width="100" height="100" viewBox="0 0 128 128">
      <path d="M0 0h128v128H0z" fill="#FFF"/>
      <!-- Emergency dynamic payload display inside the card integration -->
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

  <text x="30" y="226" font-family="'Fira Code', monospace" font-size="7.5" fill="#EF4444" fill-opacity="0.7" font-weight="bold">AUTORIZAÇÃO MASTER LEVEL I</text>
</svg>
    `.trim();

    const blob = new Blob([finalSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `credencial-adm-principal.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleOnScanQRTest = (scannedToken: string) => {
    setIsQRTesting(false);
    const token = adminUser?.qrCodeToken || 'admin_emergency_token';
    const isMatch = scannedToken === token;
    
    useStore.getState().logAction({
      module: 'Segurança',
      actionType: 'other',
      action: isMatch ? 'Verificação QR ADM' : 'Falha QR ADM',
      description: `Teste de validação de QR Code ADM realizado pelo console: ${isMatch ? 'SUCESSO' : 'FALHA'}`,
      status: isMatch ? 'sucesso' : 'erro'
    });

    alert(isMatch 
      ? `Sucesso! QR Code do ADM validado com sucesso! Código correspondente encontrado.` 
      : `Erro! Código lido não condiz com a credencial atual deste administrador.`
    );
  };

  if (viewMode === 'admin') {
    return (
      <div className="bg-zinc-950/90 border border-emerald-500/10 rounded-2xl p-4 md:p-6 space-y-6 relative overflow-hidden shadow-[0_0_40px_rgba(16,185,129,0.03)] text-left animate-in fade-in duration-300">
        {/* Decorative subtle top border */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 animate-pulse" />

        {/* Header */}
        <div className="pb-4 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <ShieldCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Perfil Geral do Administrador</h3>
              <p className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-none mt-1">Dados cadastrais de segurança e controle estrutural</p>
            </div>
          </div>
          <span className="text-[7.5px] font-black uppercase bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full shrink-0">
            Nível de Segurança 0
          </span>
        </div>

        {/* Content Form */}
        <div className="max-w-2xl space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Admin Name */}
            <div>
              <label className="text-[8px] text-white/40 uppercase tracking-widest font-black block mb-1">Nome Completo do Administrador</label>
              <input
                type="text"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500/50 transition-all"
                placeholder="Ex: Administrador ERP Principal"
              />
            </div>

            {/* Admin Login */}
            <div>
              <label className="text-[8px] text-white/40 uppercase tracking-widest font-black block mb-1">Login / Matrícula ADM</label>
              <input
                type="text"
                value={editLogin}
                onChange={(e) => setEditLogin(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500/50 transition-all font-mono tracking-widest"
                placeholder="Ex: admin"
              />
            </div>
          </div>

          {/* Admin Photo 3x4 */}
          <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-3">
            <h4 className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5 pb-2 border-b border-white/5">
              <Camera className="w-3.5 h-3.5 text-emerald-500" />
              Foto de Identificação (Crachá ADM 3x4)
            </h4>
            
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-14 h-18 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative group">
                {editImage ? (
                  <>
                    <img
                      src={editImage}
                      alt="Administrador"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <Trash2 
                        className="w-4 h-4 text-red-500 cursor-pointer hover:scale-110 transition-transform" 
                        onClick={() => setEditImage('')}
                      />
                    </div>
                  </>
                ) : (
                  <span className="text-[8px] font-black text-white/20 uppercase tracking-widest text-center px-1 font-sans">
                    Sem Foto
                  </span>
                )}
              </div>
              <div className="flex-1 space-y-1.5 text-center sm:text-left font-sans">
                <p className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-normal">
                  Carregue a sua foto 3x4 oficial para exibição no crachá de segurança master. Proporção recomendada 3:4.
                </p>
                <div className="flex justify-center sm:justify-start gap-2.5">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setEditImage(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="hidden"
                    id="admin-profile-photo-upload"
                  />
                  <label
                    htmlFor="admin-profile-photo-upload"
                    className="px-3 py-1.5 bg-emerald-500 text-black font-black text-[8px] uppercase tracking-wider rounded-lg hover:bg-emerald-600 transition-all cursor-pointer block"
                  >
                    Fazer Upload Foto
                  </label>
                  {editImage && (
                    <button
                      type="button"
                      onClick={() => setEditImage('')}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black text-[8px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      Remover foto
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-4">
            <h4 className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] flex items-center gap-1.5 pb-2 border-b border-white/5">
              <Lock className="w-3.5 h-3.5 text-emerald-500" />
              Formulário de Alteração de Senha
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Current Password */}
              <div>
                <label className="text-[7.5px] text-white/40 uppercase tracking-widest font-black block mb-1">Senha Atual do ADM</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-black tracking-[0.1em] focus:outline-none focus:border-red-500/50 transition-all placeholder:text-white/20"
                  placeholder="••••••••"
                />
              </div>

              {/* New Password */}
              <div>
                <label className="text-[7.5px] text-white/40 uppercase tracking-widest font-black block mb-1">Nova Senha</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-black tracking-[0.1em] focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/20"
                  placeholder="Mínimo 4 dígitos"
                />
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="text-[7.5px] text-white/40 uppercase tracking-widest font-black block mb-1">Confirmar Nova Senha</label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono font-black tracking-[0.1em] focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-white/20"
                  placeholder="Repita a nova senha"
                />
              </div>
            </div>
          </div>

          {editError && (
            <p className="text-[9px] text-red-500 font-black uppercase tracking-wider animate-bounce">{editError}</p>
          )}

          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => {
                setEditFullName(adminUser?.fullName || '');
                setEditLogin(adminUser?.login || '');
                setEditImage(adminUser?.image || '');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmNewPassword('');
                setEditError('');
              }}
              className="py-2.5 px-5 bg-white/5 hover:bg-white/10 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all cursor-pointer border border-white/5"
            >
              Descartar
            </button>
            <button
              onClick={handleSaveAdminDetails}
              className="py-2.5 px-6 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[9px] uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-md"
            >
              Salvar Alterações
            </button>
          </div>
        </div>
      </div>
    );
  }

  // viewMode === 'access' (Acessos) Subtab Complete Layout
  return (
    <div className="space-y-6 text-left animate-in fade-in duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        
        {/* Access Module 1: QR Code ADM */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-emerald-500" />
                <span className="text-[9px] text-white font-black uppercase tracking-wider">Credencial QR ADM</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase border ${qrBlocked ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                {qrBlocked ? 'Crachá bloqueado' : 'Ativo'}
              </span>
            </div>

            <div className="flex gap-4 items-center">
              <div className="p-2 bg-white rounded-xl flex-shrink-0 cursor-pointer relative group" onClick={() => setShowQRLarge(true)}>
                <div id="admin-svg-qr-source" className="block">
                  <StandardQRCode value={adminUser?.qrCodeToken || 'admin_emergency_token'} size={80} />
                </div>
                <div className="absolute inset-0 bg-black/85 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all rounded-xl">
                  <span className="text-[7px] font-black text-white uppercase tracking-wider text-center">Zoom</span>
                </div>
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                <p className="text-[8px] text-white/40 leading-relaxed uppercase">
                  Código dinâmico autenticador. Use em frente à vido-câmera instalada no ponto físico.
                </p>
                <div className="font-mono text-[9px] text-emerald-400 font-bold tracking-widest bg-emerald-950/20 px-2 py-1 rounded border border-emerald-500/10 truncate">
                  {adminUser?.qrCodeToken || 'SEM TOKEN'}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-white/5">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsScanningForRegister(true)}
                className="py-2 bg-[#121212] hover:bg-white/5 text-white font-black text-[8px] uppercase tracking-wider rounded-xl transition-all border border-white/5 flex items-center justify-center gap-1 cursor-pointer"
              >
                <QrCode className="w-2.5 h-2.5" /> Cadastrar QR Code Existente
              </button>
              <button
                onClick={handleEraseQR}
                className="py-2 bg-red-400/10 hover:bg-red-500 text-red-500 hover:text-black font-black text-[8px] uppercase tracking-wider rounded-xl transition-all border border-red-500/15 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-2.5 h-2.5" /> Apagar
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleBlockQR}
                className={`py-2 font-black text-[8px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${qrBlocked ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'}`}
              >
                <Lock className="w-2.5 h-2.5" /> {qrBlocked ? 'Ativar' : 'Bloquear'}
              </button>
              <button
                onClick={downloadAdminBadgeSVG}
                className="py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[8px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-2.5 h-2.5" /> Salvar SVG
              </button>
            </div>
          </div>
        </div>

        {/* Access Module 2: NFC / RFID Admin */}
        <div className="bg-black/40 border border-white/5 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex justify-between items-center pb-2.5 border-b border-white/5">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-amber-500" />
                <span className="text-[9px] text-white font-black uppercase tracking-wider">Identidade NFC RFID</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase border ${adminNfcTag ? adminNfcTag.status === 'Bloqueado' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-white/20 border-white/5'}`}>
                {adminNfcTag ? (adminNfcTag.status === 'Bloqueado' ? 'Crachá bloqueado' : adminNfcTag.status) : 'SEM DISPOSITIVO'}
              </span>
            </div>

            {adminNfcTag ? (
              <div className="space-y-3">
                <div className="p-3 bg-zinc-950/60 border border-white/5 rounded-xl flex items-center justify-between text-left">
                  <div>
                    <span className="text-[6px] text-white/25 uppercase tracking-widest font-black block">Chave Física UID</span>
                    <p className="text-[11px] font-mono font-black text-white uppercase select-all tracking-wide">{adminNfcTag.uid}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[6.5px] text-white/25 uppercase tracking-widest font-bold block">Status</span>
                    <span className={`text-[9px] font-black uppercase ${adminNfcTag.status === 'Bloqueado' ? 'text-red-500' : 'text-emerald-400'}`}>
                      {adminNfcTag.status === 'Bloqueado' ? 'Crachá bloqueado' : (adminNfcTag.status || 'Vinculado')}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const next = adminNfcTag.status === 'Bloqueado' ? 'Vinculado' : 'Bloqueado';
                      updateNFCTag(adminNfcTag.id, { 
                        status: next,
                        usuarioVinculado: adminUser?.id || null,
                        tipoCredencial: 'ADM'
                      });
                      useStore.getState().logAction({
                        module: 'Segurança',
                        actionType: 'security',
                        action: next === 'Bloqueado' ? 'Bloquear NFC ADM' : 'Restaurar NFC ADM',
                        description: `Tag RFID ADM ${next === 'Bloqueado' ? 'Bloqueada' : 'Ativada e Restaurada'}`,
                        status: 'sucesso'
                      });
                      alert(`NFC ADM ${next === 'Bloqueado' ? 'Bloqueado' : 'Restaurado e Ativo'}!`);
                    }}
                    className={`flex-1 py-2 text-[8px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${adminNfcTag.status === 'Bloqueado' ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'}`}
                  >
                    <Lock className="w-2.5 h-2.5" /> {adminNfcTag.status === 'Bloqueado' ? 'Desbloquear' : 'Bloquear'}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Deseja realmente remover esta tag física?')) {
                        updateNFCTag(adminNfcTag.id, {
                          tipoCredencial: 'OPERADOR',
                          usuarioVinculado: null,
                          status: 'Livre'
                        });
                        useStore.getState().logAction({
                          module: 'Segurança',
                          actionType: 'security',
                          action: 'Remover NFC ADM',
                          description: 'Removido vínculo RFID físico do Administrador Principal.',
                          status: 'sucesso'
                        });
                        alert('NFC Desvinculado!');
                      }
                    }}
                    className="py-2 px-3 bg-red-400/10 hover:bg-red-500 text-red-500 hover:text-black rounded-xl text-[8px] font-black uppercase border border-red-500/10 cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {isLinkingNfc ? (
                  <div className="space-y-2">
                    <span className="text-[6.5px] text-white/30 uppercase font-black tracking-wider block"> UID Hexadecimal</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={nfcUidInput}
                        onChange={(e) => setNfcUidInput(e.target.value)}
                        placeholder="Ex: 04E27CAD"
                        className="flex-1 bg-black/60 border border-white/10 h-9 px-2.5 rounded-lg text-[10px] text-white font-mono uppercase focus:border-amber-500 outline-none"
                      />
                      <button
                        onClick={handleLinkNfcSubmit}
                        className="px-3 bg-amber-500 text-black font-black text-[8.5px] uppercase tracking-wider rounded-lg cursor-pointer"
                      >
                        Vincular
                      </button>
                    </div>

                    {nfcError && <p className="text-[7.5px] text-red-500 font-extrabold uppercase">{nfcError}</p>}

                    {/* Quick selection helper */}
                    {nfcTags.filter(t => t.status === 'Livre').length > 0 && (
                      <div className="bg-white/[0.01] p-2 rounded-lg border border-white/5 space-y-1">
                        <span className="text-[6px] text-white/20 uppercase font-black block">Módulos livres em rede:</span>
                        <div className="flex flex-wrap gap-1">
                          {nfcTags.filter(t => t.status === 'Livre').slice(0, 3).map(t => (
                            <button
                              key={t.id}
                              onClick={() => setNfcUidInput(t.uid)}
                              className="px-1.5 py-0.5 bg-white/5 rounded text-[7.5px] font-mono text-white/50 hover:text-white"
                            >
                              {t.uid}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 border border-dashed border-white/5 rounded-xl text-center space-y-2">
                    <p className="text-[8px] text-white/30 uppercase font-black leading-relaxed">Nenhuma tag RFID ativa associada.</p>
                    <button
                      onClick={() => setIsLinkingNfc(true)}
                      className="py-1.5 px-3 bg-white/5 hover:bg-amber-500 hover:text-black rounded-xl border border-white/10 text-[8px] font-black uppercase tracking-wider transition-all"
                    >
                      Cadastrar Tag NFC (RFID)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RFID Testing simulation block */}
          {(environmentService.isDevMode() || environmentService.isTestEnvironment()) && (
            <div className="p-3 bg-white/[0.01] border border-white/5 rounded-xl space-y-3">
              <h5 className="text-[7.5px] font-black text-white/30 uppercase tracking-widest flex justify-between items-center">
                <span>Simulador de Proximidade NFC</span>
                <button 
                  type="button"
                  onClick={() => {
                    setIsTestingNfc(!isTestingNfc);
                    setNfcTestResult(null);
                    setNfcTestUid('');
                  }}
                  className="text-indigo-400 hover:underline text-[6.5px] uppercase font-black"
                >
                  {isTestingNfc ? 'Recuar' : 'Ativar'}
                </button>
              </h5>

              {isTestingNfc && (
                <div className="space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={nfcTestUid}
                      onChange={(e) => setNfcTestUid(e.target.value)}
                      placeholder="DIGITE UID DA TAG"
                      className="flex-1 bg-black/60 border border-white/5 h-7 px-2 rounded text-[9px] text-white font-mono uppercase focus:border-indigo-500 outline-none"
                    />
                    <button
                      onClick={handleTestNfc}
                      className="px-2.5 bg-indigo-500 text-white font-black text-[7.5px] uppercase rounded"
                    >
                      Testar
                    </button>
                  </div>
                  {nfcTestResult && (
                    <p className={`text-[7.5px] font-black uppercase p-1.5 rounded ${nfcTestResult.includes('SUCESSO') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-500'}`}>
                      {nfcTestResult}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {showQRLarge && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4" onClick={() => setShowQRLarge(false)}>
          <div className="bg-[#121212] border border-emerald-500/20 p-6 rounded-3xl max-w-sm w-full space-y-4 text-center zoom-in-100 duration-300 relative" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
              <QrCode className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider">QR Code de Autorização ADM</h4>
            <p className="text-[8px] text-white/40 uppercase font-black font-sans leading-none">Apresente esta credencial eletrônica em frente à lente do sensor</p>
            
            <div className="p-4 bg-white rounded-2xl inline-block shadow-2xl">
              <StandardQRCode value={adminUser?.qrCodeToken || 'admin_emergency_token'} size={200} />
            </div>

            <button
              onClick={() => setShowQRLarge(false)}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-black font-black text-[9px] uppercase tracking-widest rounded-xl transition-all"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* QR testing & registering modal scanners */}
      <AnimatePresence>
        {isQRTesting && (
          <QRScanner
            mode="qr"
            onScan={handleOnScanQRTest}
            onClose={() => setIsQRTesting(false)}
            title="Escanear e Validar QR Code ADM"
            description="Apresente o QR Code gerado em frente ao leitor para certificar sua autenticidade"
          />
        )}
        {isScanningForRegister && (
          <QRScanner
            mode="qr"
            onScan={handleOnScanQRRegister}
            onClose={() => setIsScanningForRegister(false)}
            title="Cadastrar QR Code Existente"
            description="Apresente o QR Code que deseja cadastrar para o Administrador em frente à câmera"
          />
        )}
      </AnimatePresence>

      {/* Custom Confirmation Popup for Admin QR Code Link */}
      <AnimatePresence>
        {scannedAdminToken && (
          <div className="fixed inset-0 z-[10000] flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setScannedAdminToken(null)}
              className="fixed inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#0a0a0a] border border-amber-500/20 rounded-[32px] shadow-2xl overflow-hidden shadow-black/80 my-auto p-6 md:p-8 space-y-6"
            >
              <div className="space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500">
                  <QrCode className="w-5 h-5 animate-pulse" />
                </div>
                <h2 className="text-base font-black text-white uppercase tracking-widest leading-tight">
                  QR Code encontrado
                </h2>
                <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  {scannedAdminToken.typeString}
                </p>

                {/* Small QR Code preview shown in the modal */}
                <div className="py-2 flex justify-center">
                  <StandardQRCode
                    value={scannedAdminToken.token}
                    size={100}
                  />
                </div>

                <div className="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                    Token Lido
                  </span>
                  <span className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-wider truncate max-w-[200px]">
                    {scannedAdminToken.token}
                  </span>
                </div>

                <p className="text-[9px] font-bold text-white/40 uppercase tracking-tight leading-relaxed">
                  Deseja vincular este QR Code ao administrador? Ele será associado ao acesso do ADM.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setScannedAdminToken(null)}
                  className="flex-1 py-3 bg-white/5 text-white/60 text-[9px] font-black uppercase tracking-widest rounded-2xl hover:bg-white/10 transition-all font-sans border border-white/5 shrink-0"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmLinkAdminToken}
                  className="flex-1 py-3 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-2xl hover:bg-amber-400 transition-all font-sans shrink-0"
                >
                  Vincular
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
