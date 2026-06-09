import React, { useState } from "react";
import {
  Users,
  Shield,
  Lock,
  History,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Eye,
  Save,
  UserPlus,
  Search,
  MoreVertical,
  Activity,
  AlertCircle,
  QrCode,
  RefreshCw,
  MinusCircle,
  Download,
  Settings,
  Printer,
  IdCard,
  Cpu,
} from "lucide-react";
import {
  useStore,
  User,
  UserRole,
  RolePermission,
  AuditLog,
  Badge,
  NFCTag,
} from "../store";
import { StandardQRCode } from "./StandardQRCode";
import { MODULES as APP_MODULES } from "../modules";
import { SETTINGS_TABS } from "./SettingsDrawer";
import { cn } from "../lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import MasterPasswordModal from "./MasterPasswordModal";
import QRScanner from "./QRScanner";
import { generateUUID } from "../utils/uuid";

// Get unique settings modules from settings tabs dynamically to avoid hardcoding labels
const SETTINGS_MODULES = Array.from(
  new Set(SETTINGS_TABS.map((t) => t.module)),
);

const MODULES = Array.from(
  new Set([...APP_MODULES.map((m) => m.name), ...SETTINGS_MODULES]),
).sort();

const PERMISSION_KEYS = [
  { key: "acessar", label: "Acessar" },
  { key: "visualizar", label: "Ver" },
  { key: "cadastrar", label: "Add" },
  { key: "editar", label: "Edit" },
  { key: "excluir", label: "Del" },
  { key: "cancelar", label: "Canc" },
  { key: "verValores", label: "$" },
  { key: "alterarStatus", label: "Status" },
  { key: "configurar", label: "Config" },
] as const;

interface PermissionCheckbox {
  key: keyof RolePermission["actions"];
  label: string;
}

export function getRelevantActionsForModule(
  moduleId: string,
  moduleName: string,
): PermissionCheckbox[] {
  const idLower = moduleId.toLowerCase();

  if (idLower === "dashboard") {
    return [{ key: "visualizar", label: "Ver Painel General" }];
  }

  if (idLower === "abrir-caixa") {
    return [
      { key: "visualizar", label: "Ver Painel de Caixa" },
      { key: "cadastrar", label: "Abrir Caixa" },
      { key: "configurar", label: "Fechar Caixa" },
    ];
  }

  if (idLower === "pdv") {
    return [
      { key: "visualizar", label: "Acessar Caixa/Atendimento" },
      { key: "cadastrar", label: "Vender (Registrar Vendas)" },
      { key: "configurar", label: "Finalizar Pedido" },
    ];
  }

  if (idLower === "separacao") {
    return [
      { key: "visualizar", label: "Acessar Lista de Entrega" },
      { key: "editar", label: "Separar Pedido" },
      { key: "configurar", label: "Embalar Pedido" },
    ];
  }

  if (idLower === "gestao-pedidos") {
    return [
      { key: "visualizar", label: "Consultar Histórico" },
      { key: "editar", label: "Editar Informações" },
      { key: "cancelar", label: "Cancelar Pedido" },
    ];
  }

  if (idLower === "devolucao") {
    return [
      { key: "visualizar", label: "Ver Devoluções" },
      { key: "cadastrar", label: "Registrar Devolução" },
      { key: "cancelar", label: "Cancelar Devolução" },
    ];
  }

  if (idLower === "ocorrencias") {
    return [
      { key: "visualizar", label: "Ver Ocorrências" },
      { key: "cadastrar", label: "Registrar Nova" },
      { key: "editar", label: "Atualizar e Agir" },
    ];
  }

  if (idLower === "clientes") {
    return [
      { key: "visualizar", label: "Ver Listagem de Clientes" },
      { key: "cadastrar", label: "Registrar Novo Cliente" },
      { key: "editar", label: "Modificar Informações" },
      { key: "excluir", label: "Excluir Registro" },
    ];
  }

  if (idLower === "lojistas") {
    return [
      { key: "visualizar", label: "Ver Lista de Lojistas" },
      { key: "cadastrar", label: "Adicionar Lojista" },
      { key: "editar", label: "Modificar Lojista" },
      { key: "excluir", label: "Remover Lojista" },
    ];
  }

  if (idLower === "catalogo") {
    return [
      { key: "visualizar", label: "Ver Catálogo Completo" },
      { key: "cadastrar", label: "Criar Novo Item" },
      { key: "editar", label: "Editar Preços/Layout" },
      { key: "excluir", label: "Remover Item Catálogo" },
    ];
  }

  if (idLower === "estoque") {
    return [
      { key: "visualizar", label: "Ver Lista de Inventário" },
      { key: "cadastrar", label: "Acrescentar Balanço/Item" },
      { key: "editar", label: "Ajustar Inventário" },
      { key: "excluir", label: "Zerar ou Deletar Item" },
    ];
  }

  if (
    idLower === "financeiro" ||
    idLower === "custos" ||
    idLower === "historico-caixa" ||
    idLower === "pagamentos"
  ) {
    return [
      { key: "visualizar", label: "Medir e Visualizar" },
      { key: "cadastrar", label: "Lançar Valores/Entrada" },
      { key: "cancelar", label: "Fazer Reversões" },
    ];
  }

  if (
    idLower === "ia" ||
    idLower === "automacao" ||
    idLower === "auditoria" ||
    idLower === "performance-operacional"
  ) {
    return [
      { key: "visualizar", label: "Exibir Painéis de Insights" },
      { key: "configurar", label: "Parâmetros / Desligamento" },
    ];
  }

  return [
    { key: "visualizar", label: "Ver" },
    { key: "cadastrar", label: "Criar" },
    { key: "editar", label: "Editar" },
    { key: "excluir", label: "Excluir" },
    { key: "cancelar", label: "Cancelar" },
  ];
}

export const UserManagement: React.FC = () => {
  const users = useStore((state) => state.users);
  const userRoles = useStore((state) => state.userRoles);
  const auditLogs = useStore((state) => state.auditLogs);
  const addUser = useStore((state) => state.addUser);
  const updateUser = useStore((state) => state.updateUser);
  const addUserRole = useStore((state) => state.addUserRole);
  const updateUserRole = useStore((state) => state.updateUserRole);
  const currentUser = useStore((state) => state.currentUser);
  const enrolledByUserId = currentUser?.id || "admin";
  const enrollFaceBiometric = useStore((state) => state.enrollFaceBiometric);
  const removeFaceBiometric = useStore((state) => state.removeFaceBiometric);
  const updateUserQRCode = useStore((state) => state.updateUserQRCode);
  const logAction = useStore((state) => state.logAction);
  const setBadgeSelectedUserId = useStore((state) => state.setBadgeSelectedUserId);
  const setActiveSettingModule = useStore((state) => state.setActiveSettingModule);
  const setIsSettingsOpen = useStore((state) => state.setIsSettingsOpen);

  const badges = useStore((state) => state.badges) || [];
  const addBadge = useStore((state) => state.addBadge);
  const updateBadge = useStore((state) => state.updateBadge);
  const deleteBadge = useStore((state) => state.deleteBadge);
  const regenerateBadgeCode = useStore((state) => state.regenerateBadgeCode);
  const vincularBadge = useStore((state) => state.vincularBadge);
  const desvincularBadge = useStore((state) => state.desvincularBadge);
  const addBadgeWithCode = useStore((state) => state.addBadgeWithCode);

  const nfcTags = useStore((state) => state.nfcTags) || [];
  const addNFCTag = useStore((state) => state.addNFCTag);
  const updateNFCTag = useStore((state) => state.updateNFCTag);
  const linkNFCTagToUser = useStore((state) => state.linkNFCTagToUser);
  const unlinkNFCTagFromUser = useStore((state) => state.unlinkNFCTagFromUser);
  const quarantineNFCTag = useStore((state) => state.quarantineNFCTag);
  const restoreNFCTag = useStore((state) => state.restoreNFCTag);
  const permanentlyDeleteExpiredNFCTags = useStore((state) => state.permanentlyDeleteExpiredNFCTags);

  const [activeTab, setActiveTab] = useState<
    "users" | "roles" | "badges" | "nfc" | "history"
  >("users");
  const [isScanning, setIsScanning] = useState(false);
  const [scanTarget, setScanTarget] = useState<
    "new_badge" | "edit_badge" | "admin_badge"
  >("new_badge");
  const [scannedAdminToken, setScannedAdminToken] = useState<{ token: string; typeString: string } | null>(null);

  const hasBadgePermission = () => {
    if (!currentUser) return false;
    if (currentUser.isAdmin || currentUser.login.toUpperCase() === "ADM")
      return true;

    const role = userRoles.find((r) => r.id === currentUser.roleId);
    if (!role) return false;

    const permission = role.permissions.find(
      (p) => p.module === "Usuários e Funções",
    );
    if (permission) {
      const actions = permission.actions;
      return !!(actions.editar || actions.cadastrar || actions.configurar);
    }
    return false;
  };

  const handleScanResult = async (code: string) => {
    setIsScanning(false);

    if (!code || code.trim() === "") {
      alert("QR Code inválido ou vazio!");
      return;
    }

    const cleanCode = code.trim();

    if (scanTarget === "new_badge") {
      const result = await addBadgeWithCode(cleanCode);
      if (result.success) {
        alert(`Crachá "${cleanCode}" cadastrado com sucesso!`);
      } else {
        alert(
          result.error ||
            `Erro ao cadastrar crachá com o código "${cleanCode}".`,
        );
      }
    } else if (scanTarget === "edit_badge") {
      if (!editingBadge) return;

      const alreadyExists = badges.some(
        (b) =>
          b.id !== editingBadge.id &&
          b.codigoCracha.toUpperCase() === cleanCode.toUpperCase(),
      );
      if (alreadyExists) {
        alert(
          `Este QR Code "${cleanCode}" já está cadastrado em outro crachá!`,
        );
        return;
      }

      updateBadge(editingBadge.id, { codigoCracha: cleanCode });
      setEditingBadge((prev) =>
        prev ? { ...prev, codigoCracha: cleanCode } : null,
      );
      alert(`Código do crachá atualizado para "${cleanCode}" com sucesso!`);
    } else if (scanTarget === "admin_badge") {
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

      if (!selectedUser?.id) {
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
    }
  };

  const handleConfirmLinkAdminToken = () => {
    if (!scannedAdminToken || !selectedUser?.id) return;

    const newToken = scannedAdminToken.token;
    const registerExistingQRCode = useStore.getState().registerExistingQRCode;
    const result = registerExistingQRCode(newToken, selectedUser.id);

    if (!result.success && result.alreadyExists) {
      if (confirm(result.message)) {
        const forceRes = registerExistingQRCode(newToken, selectedUser.id, true);
        if (forceRes.success) {
          // Update selected user state locally in component for consistency
          setSelectedUser((prev) => {
            const updatedUserRef = useStore.getState().users.find(u => u.id === selectedUser.id);
            return updatedUserRef ? { ...prev, ...updatedUserRef } : prev;
          });
          alert(forceRes.message);
          setScannedAdminToken(null);
        } else {
          alert(forceRes.message || "Erro ao transferir vínculo.");
        }
      }
    } else {
      if (result.success) {
        // Update selected user state locally in component for consistency
        setSelectedUser((prev) => {
          const updatedUserRef = useStore.getState().users.find(u => u.id === selectedUser.id);
          return updatedUserRef ? { ...prev, ...updatedUserRef } : prev;
        });
      }
      alert(result.message);
      setScannedAdminToken(null);
    }
  };
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [isEditingRole, setIsEditingRole] = useState(false);
  const [editingBadge, setEditingBadge] = useState<Badge | null>(null);
  const [badgeToDelete, setBadgeToDelete] = useState<Badge | null>(null);
  const [badgeToRegenerate, setBadgeToRegenerate] = useState<Badge | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = useState<Partial<User> | null>(null);

  const [newlyCreatedUser, setNewlyCreatedUser] = useState<{
    fullName: string;
    matricula: string;
  } | null>(null);
  const [selectedRole, setSelectedRole] = useState<Partial<UserRole> | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isLinkingNFC, setIsLinkingNFC] = useState(false);
  const [manualNfcUid, setManualNfcUid] = useState("");
  const [nfcError, setNfcError] = useState("");
  const [selectedNfcTagIdToLink, setSelectedNfcTagIdToLink] = useState("");

  const [isAddingNfc, setIsAddingNfc] = useState(false);
  const [newNfcUid, setNewNfcUid] = useState("");
  const [newNfcLabel, setNewNfcLabel] = useState("");
  const [newNfcError, setNewNfcError] = useState("");

  const [editingNfcTag, setEditingNfcTag] = useState<NFCTag | null>(null);
  const [editingNfcLabel, setEditingNfcLabel] = useState("");
  const [editingNfcType, setEditingNfcType] = useState<'OPERADOR' | 'MASTER' | 'ADM'>('OPERADOR');

  const [quarantiningNfcTag, setQuarantiningNfcTag] = useState<NFCTag | null>(null);
  const [quarantineReasonText, setQuarantineReasonText] = useState("");

  React.useEffect(() => {
    if (!isEditingUser) {
      setIsLinkingNFC(false);
      setManualNfcUid("");
      setNfcError("");
      setSelectedNfcTagIdToLink("");
    }
  }, [isEditingUser]);

  const handleLinkNfcToSelectedUser = async () => {
    setNfcError("");
    const trimmedUid = manualNfcUid.trim().toUpperCase();
    if (!trimmedUid) {
      setNfcError("O UID da Tag NFC não pode ser vazio!");
      return;
    }
    
    // Check if tag is already in use by someone else
    const allTags = useStore.getState().nfcTags || [];
    let targetTag = allTags.find(t => t.uid.toUpperCase() === trimmedUid);
    
    if (targetTag) {
      if (targetTag.status === 'Excluido') {
        const restoreRes = await useStore.getState().restoreNFCTag(targetTag.id);
        if (!restoreRes.success) {
          setNfcError(restoreRes.error || "Erro ao reativar Tag NFC excluída.");
          return;
        }
      } else if (['Bloqueado', 'Perdido', 'Quarentena'].includes(targetTag.status)) {
        setNfcError(`Esta Tag NFC está com o status "${targetTag.status}" e não pode ser vinculada.`);
        return;
      } else if (targetTag.usuarioVinculado && targetTag.usuarioVinculado !== selectedUser?.id) {
        const boundUser = users.find(u => u.id === targetTag.usuarioVinculado);
        setNfcError(`Esta Tag NFC já está vinculada ao usuário: ${boundUser?.fullName || targetTag.usuarioVinculado}.`);
        return;
      }
    } else {
      // Create new tag
      const registerRes = await addNFCTag(trimmedUid, `Tag Gerada no Cadastro: ${selectedUser?.fullName || 'Colaborador'}`);
      if (!registerRes.success) {
        setNfcError(registerRes.error || "Erro ao registrar a Tag NFC.");
        return;
      }
      // Re-fetch the tag
      const updatedTags = useStore.getState().nfcTags || [];
      targetTag = updatedTags.find(t => t.uid.toUpperCase() === trimmedUid);
    }
    
    if (!targetTag) {
      setNfcError("Falha inesperada ao obter a Tag NFC.");
      return;
    }
    
    setSelectedUser(prev => prev ? { ...prev, nfcTagId: targetTag.id } : null);
    
    // If editing existing user, link it immediately so it is written
    if (selectedUser?.id) {
      await linkNFCTagToUser(targetTag.id, selectedUser.id);
    }
    
    setIsLinkingNFC(false);
    setManualNfcUid("");
    setNfcError("");
  };

  const handleUnlinkNfcFromSelectedUser = () => {
    if (!selectedUser) return;
    const currentTagId = selectedUser.nfcTagId;
    if (currentTagId) {
      unlinkNFCTagFromUser(currentTagId);
    }
    setSelectedUser(prev => prev ? { ...prev, nfcTagId: undefined } : null);
  };
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [userFormError, setUserFormError] = useState("");
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] =
    useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: "user" | "role" | "permission";
    data: any;
  } | null>(null);

  const isSelectedUserMasterAdmin =
    selectedUser?.id === "admin" ||
    selectedUser?.isMasterAdmin ||
    selectedUser?.isOwner ||
    selectedUser?.login?.toUpperCase() === "ADM";

  // History Pagination
  const [logPage, setLogPage] = useState(1);
  const logsPerPage = 20;

  const filteredUsers = React.useMemo(() => {
    return users.filter(
      (u) => {
        const isAdm = u.id === "admin" || u.isMasterAdmin || u.isOwner || u.login?.toUpperCase() === "ADM" || u.login?.toUpperCase() === "ADMIN";
        if (isAdm) return false;

        return (
          (u.fullName || "")
            .toLowerCase()
            .includes((searchTerm || "").toLowerCase()) ||
          (u.matricula || "")
            .toLowerCase()
            .includes((searchTerm || "").toLowerCase()) ||
          (u.login || "")
            .toLowerCase()
            .includes((searchTerm || "").toLowerCase())
        );
      }
    );
  }, [users, searchTerm]);

  const pagedLogs = React.useMemo(() => {
    const sorted = [...auditLogs].sort((a, b) => b.timestamp - a.timestamp);
    return sorted.slice((logPage - 1) * logsPerPage, logPage * logsPerPage);
  }, [auditLogs, logPage]);

  const totalLogPages = Math.ceil(auditLogs.length / logsPerPage);

  const handleEditUser = (user?: User) => {
    if (user && (user.id === "admin" || user.isMasterAdmin || user.isOwner || user.login?.toUpperCase() === "ADM" || user.login?.toUpperCase() === "ADMIN")) {
      alert("O Administrador Principal deve ser gerenciado na aba Segurança.");
      return;
    }

    if (!user) {
      // Auto-generate safe unique 8-digit matricula for logins
      const existingLogins = new Set(
        users.map((u) => (u.matricula || u.login || "").trim().toLowerCase()),
      );
      let generated = "";
      while (true) {
        generated = Math.floor(10000000 + Math.random() * 90000000).toString();
        if (!existingLogins.has(generated)) {
          break;
        }
      }

      setSelectedUser({
        fullName: "",
        login: generated,
        matricula: generated,
        password: "",
        roleId: userRoles.find(r => r.id !== 'administrador' && !r.name.toLowerCase().includes('administrador'))?.id || userRoles[0]?.id || "",
        status: "ativo",
        isAdmin: false,
        qrCodeToken: generateUUID(),
      });
    } else {
      setSelectedUser({
        ...user,
        matricula: user.matricula || user.login,
      });
    }
    setOldPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordError("");
    setUserFormError("");
    setIsEditingUser(true);
  };

  const downloadAdminQRCodePNG = () => {
    let svgEl: any = document.getElementById("admin-badge-svg");
    if (!svgEl) return;
    try {
      // If the targeted element is a wrapper div containing the svg child, extract the nested svg
      if (svgEl.tagName.toLowerCase() !== 'svg') {
        const nestedSvg = svgEl.querySelector('svg');
        if (nestedSvg) {
          svgEl = nestedSvg;
        }
      }

      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const blobURL = window.URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 300;
        canvas.height = 300;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, 300, 300);
          context.drawImage(image, 25, 25, 250, 250);
          const pngURL = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = pngURL;
          downloadLink.download = "cracha-admin-adm.png";
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        window.URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (e) {
      console.error(e);
      alert("Erro ao baixar PNG do QR Code.");
    }
  };

  const downloadAdminQRCodeSVG = () => {
    let svgEl: any = document.getElementById("admin-badge-svg");
    if (!svgEl) return;
    try {
      // If the targeted element is a wrapper div containing the svg child, extract the nested svg
      if (svgEl.tagName.toLowerCase() !== 'svg') {
        const nestedSvg = svgEl.querySelector('svg');
        if (nestedSvg) {
          svgEl = nestedSvg;
        }
      }

      const svgString = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      const blobURL = window.URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobURL;
      downloadLink.download = "cracha-admin-adm.svg";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      window.URL.revokeObjectURL(blobURL);
    } catch (e) {
      console.error(e);
      alert("Erro ao baixar SVG do QR Code.");
    }
  };

  const handleRegenerateAdminQR = () => {
    if (!selectedUser?.id) return;
    const newToken = generateUUID();
    updateUser(selectedUser.id, { qrCodeToken: newToken });
    setSelectedUser((prev) =>
      prev ? { ...prev, qrCodeToken: newToken } : null,
    );
    logAction({
      module: "Usuários e Funções",
      actionType: "update",
      description: `QR Code administrativo do ADM regenerado sob demanda`,
      status: "sucesso",
      referenceId: selectedUser.id,
    });
    alert("Novo QR Code administrativo gerado com sucesso!");
  };

  const handleStartScanAdminQR = () => {
    setScanTarget("admin_badge");
    setIsScanning(true);
  };

  const handleSaveUser = () => {
    const isMasterAdmin =
      selectedUser?.id === "admin" ||
      selectedUser?.isMasterAdmin ||
      selectedUser?.isOwner ||
      selectedUser?.login?.toUpperCase() === "ADM";
    if (isMasterAdmin) {
      const originalUser = users.find(
        (u) =>
          u.id === selectedUser.id ||
          u.id === "admin" ||
          u.isMasterAdmin ||
          u.isOwner,
      );
      if (!originalUser) return;

      if (!selectedUser?.fullName?.trim()) {
        setPasswordError("O Nome Completo do administrador é obrigatório!");
        return;
      }

      let passwordUpdated = false;
      let passwordToSave = originalUser.password;
      let tokenToSave = selectedUser.qrCodeToken || originalUser.qrCodeToken || generateUUID();

      if (oldPassword || newPassword || confirmNewPassword) {
        if (!oldPassword) {
          setPasswordError("Por favor, informe a senha atual para alterar!");
          return;
        }
        if (oldPassword !== originalUser.password) {
          setPasswordError("A senha atual informada está incorreta!");
          return;
        }
        if (!newPassword) {
          setPasswordError("A nova senha não pode ser vazia!");
          return;
        }
        if (newPassword !== confirmNewPassword) {
          setPasswordError("A confirmação da nova senha não coincide!");
          return;
        }
        passwordToSave = newPassword;
        passwordUpdated = true;
      }

      // Atualiza os dados no store
      updateUser(selectedUser.id, {
        fullName: selectedUser.fullName.trim(),
        image: selectedUser.image || undefined,
        primaryFunction: selectedUser.primaryFunction || undefined,
        loja: selectedUser.loja || undefined,
        setor: selectedUser.setor || undefined,
        password: passwordToSave,
        qrCodeToken: tokenToSave,
        badgeId: selectedUser.badgeId || undefined,
        nfcTagId: selectedUser.nfcTagId || undefined,
      });

      if (selectedUser.nfcTagId) {
        linkNFCTagToUser(selectedUser.nfcTagId, selectedUser.id);
      }

      logAction({
        module: "Usuários e Funções",
        actionType: "update",
        description: passwordUpdated
          ? "Dados e senha do administrador principal ADM alterados com sucesso. QR Code administrativo regenerado."
          : "Dados do administrador principal ADM alterados com sucesso.",
        status: "sucesso",
        referenceId: selectedUser.id,
      });

      setIsEditingUser(false);
      setSelectedUser(null);
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordError("");
      alert(
        passwordUpdated
          ? "Dados e senha alterados, e novo QR Code administrativo gerado com sucesso!"
          : "Dados do administrador atualizados com sucesso!"
      );
      return;
    }

    setUserFormError("");

    if (!isSelectedUserMasterAdmin) {
      if (!selectedUser?.fullName?.trim()) {
        setUserFormError("Nome Completo é obrigatório.");
        return;
      }

      const userLogin = selectedUser?.login || selectedUser?.matricula;
      if (!userLogin) {
        setUserFormError(
          "Ocorreu um erro ao gerar a matrícula deste colaborador. Tente abrir o formulário novamente.",
        );
        return;
      }

      const duplicateLogin = users.some(
        (u) =>
          (u.login || "").toLowerCase().trim() ===
            userLogin.toLowerCase().trim() && u.id !== selectedUser?.id,
      );
      if (duplicateLogin) {
        setUserFormError(
          `A matrícula "${userLogin}" já está sendo usada por outro colaborador.`,
        );
        return;
      }

      const hasRole = selectedUser?.roleId || selectedUser?.isAdmin;
      if (!hasRole) {
        setUserFormError(
          "O usuário precisa possuir uma Função/Cargo ou ter privilégios de Administrador.",
        );
        return;
      }

      const isUserActive =
        selectedUser?.status === "ativo" || !selectedUser?.status;
      if (isUserActive) {
        const role = userRoles.find((r) => r.id === selectedUser?.roleId);
        const hasRolePermissions =
          role &&
          role.permissions &&
          role.permissions.some((p) =>
            Object.values(p.actions).some((v) => v === true),
          );
        const hasDirectPermissions =
          selectedUser?.allowedModules &&
          selectedUser.allowedModules.length > 0;

        if (
          !selectedUser?.isAdmin &&
          !hasRolePermissions &&
          !hasDirectPermissions
        ) {
          setUserFormError(
            "Um usuário ativo não pode ficar sem permissões definidas. Atribua-lhe uma função com permissões ou libere módulos diretamente.",
          );
          return;
        }
      }
    }

    if (selectedUser.id) {
      updateUser(selectedUser.id, selectedUser);
      if (selectedUser.nfcTagId) {
        linkNFCTagToUser(selectedUser.nfcTagId, selectedUser.id);
      }
    } else {
      const generatedUserId = generateUUID();
      const userToSave = { ...selectedUser, id: generatedUserId };
      const finalMatricula = selectedUser.matricula || selectedUser.login;
      
      addUser(userToSave as Omit<User, "id">);
      
      if (selectedUser.nfcTagId) {
        linkNFCTagToUser(selectedUser.nfcTagId, generatedUserId);
      }

      setNewlyCreatedUser({
        fullName: selectedUser.fullName || "",
        matricula: finalMatricula || "",
      });
    }
    setIsEditingUser(false);
    setSelectedUser(null);
  };

  const handleEditRole = (role?: UserRole) => {
    const defaultPermissions = MODULES.map((module) => ({
      module,
      actions: {
        acessar: false,
        visualizar: false,
        cadastrar: false,
        editar: false,
        excluir: false,
        cancelar: false,
        imprimir: false,
        gerarPDF: false,
        verValores: false,
        alterarStatus: false,
        configurar: false,
      },
    }));

    if (role) {
      // Merge role's existing permissions with default complete list to ensure all modules are editable
      const rolePermissions = defaultPermissions.map((defPerm) => {
        const existing = role.permissions?.find(
          (p) => p.module === defPerm.module,
        );
        if (existing) {
          return {
            ...defPerm,
            ...existing,
            actions: {
              ...defPerm.actions,
              ...existing.actions,
            },
          };
        }
        return defPerm;
      });

      setSelectedRole({
        ...role,
        permissions: rolePermissions,
      });
    } else {
      setSelectedRole({
        name: "",
        description: "",
        status: "ativo",
        permissions: defaultPermissions,
      });
    }
    setIsEditingRole(true);
  };

  const togglePermission = (
    moduleName: string,
    permissionKey: keyof RolePermission["actions"],
  ) => {
    if (!selectedRole) return;

    const exists = selectedRole.permissions?.some(
      (p) => p.module === moduleName,
    );

    let updatedPermissions = [];
    if (exists) {
      updatedPermissions =
        selectedRole.permissions?.map((p) => {
          if (p.module === moduleName) {
            return {
              ...p,
              actions: {
                ...p.actions,
                [permissionKey]: !p.actions[permissionKey],
              },
            };
          }
          return p;
        }) || [];
    } else {
      const newPermission: RolePermission = {
        module: moduleName,
        actions: {
          acessar: false,
          visualizar: false,
          cadastrar: false,
          editar: false,
          excluir: false,
          cancelar: false,
          imprimir: false,
          gerarPDF: false,
          verValores: false,
          alterarStatus: false,
          configurar: false,
          [permissionKey]: true,
        },
      };
      updatedPermissions = [...(selectedRole.permissions || []), newPermission];
    }

    setSelectedRole({ ...selectedRole, permissions: updatedPermissions });
  };

  const handleSaveRole = () => {
    if (!selectedRole?.name) return;
    if (selectedRole.id) {
      updateUserRole(selectedRole.id, selectedRole);
    } else {
      addUserRole(selectedRole as Omit<UserRole, "id">);
    }
    setIsEditingRole(false);
    setSelectedRole(null);
  };

  const handleDownloadQR = (codigoCracha: string) => {
    let svgEl: any = document.getElementById(`qr-badge-${codigoCracha}`);
    if (!svgEl) {
      alert("Não foi possível encontrar o QR Code original para download.");
      return;
    }

    try {
      // If the targeted element is a wrapper div containing the svg child, extract the nested svg
      if (svgEl.tagName.toLowerCase() !== 'svg') {
        const nestedSvg = svgEl.querySelector('svg');
        if (nestedSvg) {
          svgEl = nestedSvg;
        }
      }

      // Clona o SVG para podermos manipulá-lo sem alterar o que é exibido em tela
      const clonedSvg = svgEl.cloneNode(true) as SVGElement;

      // Remove qualquer retângulo ou path que sirva como fundo (geralmente branco / #ffffff)
      const children = Array.from(clonedSvg.querySelectorAll("rect, path"));
      children.forEach((el) => {
        const fill = el.getAttribute("fill");
        if (fill) {
          const fillLower = fill.toLowerCase().replace(/\s+/g, "");
          if (
            fillLower === "#ffffff" ||
            fillLower === "white" ||
            fillLower === "rgb(255,255,255)" ||
            fillLower === "#fff"
          ) {
            el.remove();
          }
        }
      });

      // Garante que o próprio container SVG tenha fundo transparente e sem estilos de fundo
      clonedSvg.removeAttribute("style");
      clonedSvg.style.backgroundColor = "transparent";
      clonedSvg.style.background = "none";

      const serializer = new XMLSerializer();
      let source = serializer.serializeToString(clonedSvg);

      // Ajustar dimensões padrão do SVG para 256x256 mantendo aspecto vetorial
      source = source.replace(/width="\d+"/i, 'width="256"');
      source = source.replace(/height="\d+"/i, 'height="256"');

      if (
        !source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/i)
      ) {
        source = source.replace(
          /^<svg/i,
          '<svg xmlns="http://www.w3.org/2000/svg"',
        );
      }

      const svgUrl =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(
          '<?xml version="1.0" standalone="no"?>\r\n' + source,
        );
      const downloadLink = document.createElement("a");
      downloadLink.href = svgUrl;
      downloadLink.download = `${codigoCracha}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err: any) {
      alert(`Falha ao exportar SVG: ${err.message}`);
    }
  };

  const handleMasterPasswordConfirm = () => {
    if (pendingAction?.type === "user") {
      const data = pendingAction.data;
      if (data.id) {
        updateUser(data.id, data);
      } else {
        addUser(data as Omit<User, "id">);
      }
      setIsEditingUser(false);
      setSelectedUser(null);
    } else if (pendingAction?.type === "role") {
      const data = pendingAction.data;
      if (data.id) {
        updateUserRole(data.id, data);
      } else {
        addUserRole(data as Omit<UserRole, "id">);
      }
      setIsEditingRole(false);
      setSelectedRole(null);
    }
    setPendingAction(null);
    setIsMasterPasswordModalOpen(false);
  };

  return (
    <div className="space-y-6 pb-12 text-white">
      {/* Header Tabs with Horizontal Scroll Support */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4">
        <div className="w-full lg:w-auto overflow-x-auto scrollbar-none pb-2 lg:pb-0">
          <div className="flex bg-[#121212] border border-white/5 p-1 rounded-2xl min-w-max">
            {[
              {
                id: "users",
                label: "Usuários",
                icon: <Users className="w-4 h-4" />,
              },
              {
                id: "roles",
                label: "Funções e Permissões",
                icon: <Shield className="w-4 h-4" />,
              },
              {
                id: "badges",
                label: "Crachás de Acesso",
                icon: <QrCode className="w-4 h-4" />,
              },
              {
                id: "nfc",
                label: "NFC",
                icon: <Cpu className="w-4 h-4" />,
              },
              {
                id: "history",
                label: "Histórico de Ações",
                icon: <History className="w-4 h-4" />,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-2.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all",
                  activeTab === tab.id
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/10"
                    : "text-white/40 hover:text-white",
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab !== "history" && (
          <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto scrollbar-none">
            {activeTab === "badges" && hasBadgePermission() && (
              <button
                onClick={() => {
                  setScanTarget("new_badge");
                  setIsScanning(true);
                }}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/15 cursor-pointer font-sans shrink-0 flex-1 sm:flex-initial"
              >
                <QrCode className="w-4 h-4" />
                Ler QR Code
              </button>
            )}
            {activeTab !== "users" && (
              <button
                onClick={() => {
                  if (activeTab === "roles") {
                    handleEditRole();
                  } else if (activeTab === "nfc") {
                    setIsAddingNfc(true);
                  } else {
                    addBadge();
                  }
                }}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-black rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-amber-500 transition-all shadow-xl shadow-white/5 cursor-pointer font-sans shrink-0 flex-1 sm:flex-initial"
              >
                <Plus className="w-4 h-4" />
                Novo {activeTab === "roles" ? "Função" : activeTab === "nfc" ? "NFC" : "Crachá"}
              </button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "users" && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-[#121212] border border-white/5 rounded-[24px] sm:rounded-[32px] overflow-hidden">
              {/* Top search & create user: [ + Novo Usuário ] [ Campo de Pesquisa ] */}
              <div className="p-4 sm:p-6 border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white/[0.02]">
                <button
                  onClick={() => handleEditUser()}
                  className="flex items-center justify-center gap-2 px-5 py-3.5 bg-white text-black hover:bg-amber-500 rounded-xl sm:rounded-2xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all shadow-xl hover:shadow-amber-500/10 shrink-0 cursor-pointer font-sans"
                >
                  <Plus className="w-4 h-4" />
                  <span>Novo Usuário</span>
                </button>

                <div className="flex-1 flex items-center gap-3 px-4 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-black/40 border border-white/5 focus-within:border-amber-500/40 transition-all min-w-0">
                  <Search className="w-4 h-4 text-white/20 shrink-0" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="PESQUISAR POR NOME, LOGIN OU FUNÇÃO..."
                    className="bg-transparent border-none focus:ring-0 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white placeholder:text-white/20 w-full outline-none p-0 focus:outline-none"
                  />
                </div>
              </div>

              {/* Clean and Compact List */}
              <div className="divide-y divide-white/5 bg-black/[0.1]">
                {filteredUsers.length === 0 ? (
                  <div className="p-12 text-center text-white/20 uppercase text-[10px] font-black tracking-widest">
                    Nenhum usuário cadastrado
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const userRoleName =
                      userRoles.find((r) => r.id === user.roleId)?.name ||
                      "N/A";
                    const userBadge = badges.find(
                      (b) => b.usuarioVinculado === user.id,
                    );
                    const isMasterAdm =
                      user.id === "admin" ||
                      user.isMasterAdmin ||
                      user.isOwner ||
                      user.login.toUpperCase() === "ADM";

                    return (
                      <div
                        key={user.id}
                        className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors group"
                      >
                        {/* Left Info section */}
                        <div className="flex items-center gap-4 min-w-0">
                          {/* Circle Avatar with Initials/Photo */}
                          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-amber-500 font-black text-xs sm:text-sm uppercase tracking-tight shrink-0 shadow-lg shadow-black/30 group-hover:border-amber-500/30 transition-all overflow-hidden">
                            {user.image ? (
                              <img src={user.image} alt={user.fullName} className="w-full h-full object-cover" />
                            ) : (
                              (user.fullName || "??").substring(0, 2)
                            )}
                          </div>

                          {/* Identity Card Text */}
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center flex-wrap gap-2">
                              <h4 className="text-[11px] sm:text-xs font-black text-white uppercase tracking-tight truncate leading-none">
                                {user.fullName}
                              </h4>
                              {isMasterAdm && (
                                <span className="text-[8px] font-black text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-tighter shrink-0">
                                  Dono do Sistema
                                </span>
                              )}
                              {user.isAdmin && !isMasterAdm && (
                                <span className="text-[8px] font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full uppercase tracking-tighter shrink-0">
                                  Admin
                                </span>
                              )}
                            </div>

                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-tighter flex items-center gap-1.5 flex-wrap font-sans">
                              <span className="font-mono text-white/40">
                                MATRÍCULA: {user.matricula || user.login}
                              </span>
                              <span className="text-white/10">•</span>
                              <span className="text-amber-500/80">
                                {userRoleName}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Mid-Right options & actions */}
                        <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 md:self-center">
                          {/* Tags / Status pill */}
                          <div className="flex items-center gap-2 shrink-0">
                            {userBadge ? (
                              <div className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tight border border-emerald-500/10 bg-emerald-500/10 text-emerald-400">
                                <QrCode className="w-2.5 h-2.5" />
                                <span>{userBadge.codigoCracha}</span>
                              </div>
                            ) : (
                              <div className="hidden xs:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-tight border border-white/5 bg-white/2 text-white/30">
                                <span>Sem Crachá</span>
                              </div>
                            )}

                            <div
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border",
                                user.status === "ativo"
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/10"
                                  : "bg-red-500/10 text-red-500 border-red-500/10",
                              )}
                            >
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  user.status === "ativo"
                                    ? "bg-emerald-500"
                                    : "bg-red-500",
                                )}
                              />
                              <span>{user.status}</span>
                            </div>
                          </div>

                          {/* Action icons row */}
                          <div className="flex items-center gap-1 sm:gap-2">
                            {!userBadge && (
                              <button
                                title="Vincular Crachá"
                                onClick={() => {
                                  setActiveTab("badges");
                                  setSearchTerm(user.fullName);
                                }}
                                className="p-2 bg-white/2 hover:bg-white/10 rounded-xl text-white/20 hover:text-white transition-all outline-none"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* View Permissions of the Role */}
                            <button
                              title="Ver Permissões de Cargo"
                              onClick={() => {
                                const userRole = userRoles.find(
                                  (r) => r.id === user.roleId,
                                );
                                if (userRole) {
                                  handleEditRole(userRole);
                                  setActiveTab("roles");
                                }
                              }}
                              className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white/40 hover:text-amber-500 transition-all outline-none"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>

                            {/* Status Change (Excluir/Inativar/Ativar) */}
                            {!isMasterAdm && (
                              <button
                                title={
                                  user.status === "ativo"
                                    ? "Inativar Usuário"
                                    : "Ativar Usuário"
                                }
                                onClick={() => {
                                  const confirmed = window.confirm(
                                    `Deseja alterar o status do usuário ${user.fullName} para ${user.status === "ativo" ? "inativo" : "ativo"}?`,
                                  );
                                  if (confirmed) {
                                    updateUser(user.id, {
                                      status:
                                        user.status === "ativo"
                                          ? "inativo"
                                          : "ativo",
                                    });
                                  }
                                }}
                                className={cn(
                                  "p-2 bg-white/5 hover:scale-105 active:scale-95 rounded-xl transition-all outline-none",
                                  user.status === "ativo"
                                    ? "text-white/40 hover:bg-red-500/10 hover:text-red-500"
                                    : "text-white/40 hover:bg-emerald-500/10 hover:text-emerald-500",
                                )}
                              >
                                {user.status === "ativo" ? (
                                  <MinusCircle className="w-3.5 h-3.5" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            {/* Edit Button */}
                            <button
                              title="Editar Usuário"
                              onClick={() => handleEditUser(user)}
                              className="p-2 bg-white/5 hover:bg-amber-500 hover:text-black hover:scale-105 active:scale-95 rounded-xl text-white/40 hover:shadow-lg hover:shadow-amber-500/10 transition-all outline-none"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Print Shortcut Button */}
                            {(user.qrCodeToken || user.badgeId) && (
                              <button
                                title="Imprimir Crachá de Acesso"
                                onClick={() => {
                                  setBadgeSelectedUserId(user.id);
                                  setActiveSettingModule("cracha");
                                  setIsSettingsOpen(true);
                                }}
                                className="p-2 bg-white/5 hover:bg-cyan-500 hover:text-black hover:scale-105 active:scale-95 rounded-xl text-white/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all outline-none"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "roles" && (
          <motion.div
            key="roles"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-4 gap-6"
          >
            <div className="lg:col-span-1 space-y-4">
              <div className="bg-[#121212] border border-white/5 p-6 rounded-[32px] space-y-6">
                <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-500" />
                  Lista de Funções
                </h3>
                <div className="space-y-2">
                  {userRoles.filter(role => role.id !== 'administrador' && !role.name.toLowerCase().includes('administrador')).map((role) => (
                    <button
                      key={role.id}
                      onClick={() => handleEditRole(role)}
                      className={cn(
                        "w-full p-4 rounded-2xl border text-left transition-all group",
                        selectedRole?.id === role.id
                          ? "bg-amber-500 border-amber-500 text-black"
                          : "bg-white/5 border-white/5 hover:bg-white/10 text-white",
                      )}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="text-[10px] font-black uppercase tracking-tight">
                          {role.name}
                        </h4>
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            role.status === "ativo"
                              ? "bg-emerald-500"
                              : "bg-red-500",
                          )}
                        />
                      </div>
                      <p
                        className={cn(
                          "text-[9px] font-bold uppercase tracking-tighter line-clamp-1",
                          selectedRole?.id === role.id
                            ? "text-black/60"
                            : "text-white/20",
                        )}
                      >
                        {role.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-[32px] space-y-3">
                <div className="flex items-center gap-2 text-amber-500">
                  <Shield className="w-4 h-4" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest">
                    Dono do Sistema
                  </h4>
                </div>
                <p className="text-[10px] font-bold text-white uppercase leading-relaxed">
                  Administrador do Sistema
                </p>
                <p className="text-[9px] font-medium text-white/40 uppercase leading-relaxed">
                  Este usuário possui acesso total e não é limitado por
                  permissões. Ele é o detentor de todos os acessos globais do
                  ERP.
                </p>
              </div>
            </div>

            <div className="lg:col-span-3">
              {isEditingRole ? (
                <div className="bg-[#121212] border border-white/5 rounded-[32px] overflow-hidden flex flex-col min-h-[600px]">
                  <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                    <div className="space-y-1">
                      <h3 className="text-sm font-black text-white uppercase tracking-widest">
                        {selectedRole?.id ? "Editar Função" : "Nova Função"}
                      </h3>
                      <p className="text-[10px] font-bold text-white/20 uppercase tracking-tight">
                        Defina os limites de acesso para este cargo
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setIsEditingRole(false);
                          setSelectedRole(null);
                        }}
                        className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSaveRole}
                        className="px-8 py-2.5 bg-amber-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/20"
                      >
                        Salvar Configuração
                      </button>
                    </div>
                  </div>

                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/[0.01]">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                        Nome do Cargo
                      </label>
                      <input
                        value={selectedRole?.name || ""}
                        onChange={(e) =>
                          setSelectedRole((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                        placeholder="EX: FINANCEIRO PLENO"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                        Descrição Curta
                      </label>
                      <input
                        value={selectedRole?.description || ""}
                        onChange={(e) =>
                          setSelectedRole((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                        placeholder="DESCRIÇÃO DAS ATIVIDADES..."
                      />
                    </div>
                  </div>

                  <div className="flex-1 p-8 pt-0 space-y-8">
                    {/* SEÇÃO AJUSTES (ESPECIAL) */}
                    <div className="bg-[#1a1a1a]/40 border border-white/5 p-6 rounded-[24px] space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                            <Settings className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                              Configurações e Ajustes Administrativos
                              <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded uppercase font-bold tracking-tight">
                                Especial
                              </span>
                            </h4>
                            <p className="text-[10px] font-bold text-white/30 uppercase tracking-tight">
                              Obrigatório: Apenas ADM e cargos de nível de
                              Gerente devem ter acesso a estes painéis.
                            </p>
                          </div>
                        </div>

                        {/* Indication label */}
                        {selectedRole?.name
                          ?.toLowerCase()
                          .includes("gerente") ||
                        selectedRole?.name
                          ?.toLowerCase()
                          .includes("gerência") ||
                        selectedRole?.name
                          ?.toLowerCase()
                          .includes("gerencia") ? (
                          <div className="self-start sm:self-auto text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                            Nível Gerência Detectado
                          </div>
                        ) : (
                          <div className="self-start sm:self-auto text-[9px] font-black text-white/40 uppercase tracking-widest bg-white/5 border border-white/5 px-3 py-1 rounded-full">
                            Nível Usuário Comum
                          </div>
                        )}
                      </div>

                      <div className="border-t border-white/5 pt-4">
                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-3">
                          Selecione quais submenus administrativos esta função
                          pode acessar:
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {SETTINGS_TABS.map((tab) => {
                            const isChecked =
                              selectedRole?.permissions?.find(
                                (p) => p.module === tab.module,
                              )?.actions.acessar || false;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                  if (!selectedRole) return;
                                  const exists = selectedRole.permissions?.some(
                                    (p) => p.module === tab.module,
                                  );
                                  let updated = [];
                                  if (exists) {
                                    updated =
                                      selectedRole.permissions?.map((p) => {
                                        if (p.module === tab.module) {
                                          const targetVal = !p.actions.acessar;
                                          return {
                                            ...p,
                                            actions: {
                                              acessar: targetVal,
                                              visualizar: targetVal,
                                              cadastrar: targetVal,
                                              editar: targetVal,
                                              excluir: targetVal,
                                              cancelar: targetVal,
                                              imprimir: targetVal,
                                              gerarPDF: targetVal,
                                              verValores: targetVal,
                                              alterarStatus: targetVal,
                                              configurar: targetVal,
                                            },
                                          };
                                        }
                                        return p;
                                      }) || [];
                                  } else {
                                    const newPerm: RolePermission = {
                                      module: tab.module,
                                      actions: {
                                        acessar: true,
                                        visualizar: true,
                                        cadastrar: true,
                                        editar: true,
                                        excluir: true,
                                        cancelar: true,
                                        imprimir: true,
                                        gerarPDF: true,
                                        verValores: true,
                                        alterarStatus: true,
                                        configurar: true,
                                      },
                                    };
                                    updated = [
                                      ...(selectedRole.permissions || []),
                                      newPerm,
                                    ];
                                  }
                                  setSelectedRole({
                                    ...selectedRole,
                                    permissions: updated,
                                  });
                                }}
                                className={cn(
                                  "p-4 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98]",
                                  isChecked
                                    ? "bg-amber-500/[0.02] border-amber-500/20 text-white"
                                    : "bg-white/[0.01] border-white/5 hover:bg-white/5 text-white/60",
                                )}
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={cn(
                                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                                      isChecked
                                        ? "bg-amber-500/10 text-amber-500"
                                        : "bg-white/5 text-white/30",
                                    )}
                                  >
                                    {React.createElement(tab.icon as any, {
                                      className: "w-4 h-4",
                                    })}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-wide">
                                      {tab.label}
                                    </p>
                                    <p
                                      className={cn(
                                        "text-[8px] font-bold uppercase tracking-tight line-clamp-1",
                                        isChecked
                                          ? "text-white/40"
                                          : "text-white/25",
                                      )}
                                    >
                                      {tab.desc}
                                    </p>
                                  </div>
                                </div>
                                <div
                                  className={cn(
                                    "w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ml-3",
                                    isChecked
                                      ? "bg-amber-500 border-amber-500 text-black shadow-lg shadow-amber-500/10"
                                      : "bg-black/30 border-white/10",
                                  )}
                                >
                                  {isChecked && (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* SEÇÃO MÓDULOS OPERACIONAIS */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 ml-1">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
                          <Shield className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-white uppercase tracking-wider">
                            Permissões dos Módulos Operacionais
                          </h4>
                          <p className="text-[10px] font-bold text-white/30 uppercase tracking-tight">
                            Personalize de forma flexível as ações disponíveis
                            em cada área do sistema
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {APP_MODULES.map((m) => {
                          const modulePerm = selectedRole?.permissions?.find(
                            (p) => p.module === m.name,
                          );
                          const acts = getRelevantActionsForModule(
                            m.id,
                            m.name,
                          );
                          const hasAnyPermission = acts.some(
                            (act) => modulePerm?.actions[act.key],
                          );

                          return (
                            <div
                              key={m.id}
                              className="bg-black/20 border border-white/5 hover:border-white/10 rounded-2xl p-5 flex flex-col justify-between transition-all group"
                            >
                              <div className="space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20 transition-all shrink-0">
                                      {React.createElement(m.icon as any, {
                                        className: "w-4 h-4",
                                      })}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="text-[11px] font-black text-white uppercase tracking-wider truncate">
                                        {m.name}
                                      </h3>
                                      <span className="inline-block text-[8px] font-black text-white/30 uppercase tracking-widest bg-white/2 px-1.5 py-0.5 rounded border border-white/5 mt-0.5">
                                        {m.category}
                                      </span>
                                    </div>
                                  </div>

                                  <div
                                    className={cn(
                                      "text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-colors shrink-0",
                                      hasAnyPermission
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : "bg-white/2 border-white/5 text-white/20",
                                    )}
                                  >
                                    {hasAnyPermission ? "Ativo" : "Bloqueado"}
                                  </div>
                                </div>

                                <div className="border-t border-white/5 pt-3 space-y-2">
                                  <p className="text-[8px] font-black text-white/20 uppercase tracking-widest">
                                    Ações Permitidas:
                                  </p>

                                  <div className="grid grid-cols-1 gap-1.5">
                                    {acts.map((act) => {
                                      const isChecked =
                                        modulePerm?.actions[act.key] || false;
                                      return (
                                        <button
                                          key={act.key}
                                          type="button"
                                          onClick={() =>
                                            togglePermission(m.name, act.key)
                                          }
                                          className={cn(
                                            "w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all active:scale-[0.99]",
                                            isChecked
                                              ? "bg-emerald-500/[0.02] border-emerald-500/15 hover:bg-emerald-500/5 text-white"
                                              : "bg-white/[0.01] border-white/5 hover:bg-white/5 text-slate-450 text-white/40",
                                          )}
                                        >
                                          <span className="text-[9px] font-bold uppercase tracking-tight">
                                            {act.label}
                                          </span>
                                          <div
                                            className={cn(
                                              "w-4 h-4 rounded-md flex items-center justify-center border transition-all shrink-0 ml-2",
                                              isChecked
                                                ? "bg-emerald-500 border-emerald-500 text-black shadow-md shadow-emerald-500/10"
                                                : "bg-black/30 border-white/10",
                                            )}
                                          >
                                            {isChecked && (
                                              <CheckCircle2 className="w-3 h-3" />
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#121212] border border-white/5 rounded-[32px] min-h-[600px] flex flex-col items-center justify-center text-center p-12 space-y-6 opacity-40">
                  <div className="w-20 h-20 rounded-[2.5rem] bg-white/5 flex items-center justify-center">
                    <Shield className="w-10 h-10 text-amber-500" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-black text-white uppercase tracking-[0.3em]">
                      Gestão de Permissões
                    </p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest max-w-[280px]">
                      Selecione uma função à esquerda para editar as permissões
                      ou crie uma nova.
                    </p>
                  </div>
                  <button
                    onClick={() => handleEditRole()}
                    className="px-8 py-3 rounded-2xl bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Começar agora
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "badges" && (
          <motion.div
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-[#121212] border border-white/5 rounded-[32px] overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3 text-white/20">
                  <QrCode className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">
                      Gerenciamento de Crachás de Acesso
                    </h3>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-tight">
                      Identificadores únicos reutilizáveis para controle de
                      acesso
                    </p>
                  </div>
                </div>
                <div className="bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20">
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                    Ativos: {badges.length}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Código
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Status
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Usuário Vinculado
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Criação / Último Uso
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {badges.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-20 text-center space-y-4 opacity-20"
                        >
                          <QrCode className="w-12 h-12 mx-auto text-white/20" />
                          <p className="text-[10px] font-black uppercase tracking-widest">
                            Nenhum crachá cadastrado
                          </p>
                          <button
                            onClick={() => addBadge()}
                            className="px-6 py-2.5 bg-emerald-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-400 transition-all font-sans"
                          >
                            Criar Primeiro Crachá
                          </button>
                        </td>
                      </tr>
                    ) : (
                      badges.map((badge) => {
                        const user = users.find(
                          (u) => u.id === badge.usuarioVinculado,
                        );
                        return (
                          <tr
                            key={badge.id}
                            className="border-b border-white/5 hover:bg-white/[0.01] transition-colors"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <StandardQRCode
                                  id={`qr-badge-${badge.codigoCracha}`}
                                  value={badge.codigoCracha}
                                  size={28}
                                />
                                <div>
                                  <p className="text-xs font-mono font-bold text-white tracking-wide">
                                    {badge.codigoCracha}
                                  </p>
                                  <p className="text-[8px] font-black text-emerald-500 uppercase tracking-tighter">
                                    QR-SÊNIOR
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                                  badge.status === "Livre"
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    : badge.status === "Vinculado"
                                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                      : badge.status === "Bloqueado"
                                        ? "bg-red-500/10 text-red-500 border-red-500/20"
                                        : "bg-amber-500/10 text-amber-500 border-amber-500/20", // Perdido
                                )}
                              >
                                <span
                                  className={cn(
                                    "w-1 h-1 rounded-full",
                                    badge.status === "Livre"
                                      ? "bg-emerald-500"
                                      : badge.status === "Vinculado"
                                        ? "bg-blue-500"
                                        : badge.status === "Bloqueado"
                                          ? "bg-red-500"
                                          : "bg-amber-500",
                                  )}
                                />
                                {badge.status === "Bloqueado" ? "Crachá bloqueado" : badge.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {user ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-white/40 font-black text-[9px] uppercase">
                                    {user.fullName.substring(0, 2)}
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black text-white uppercase tracking-tight">
                                      {user.fullName}
                                    </p>
                                    <p className="text-[8px] font-bold text-white/30">
                                      LOGIN: {user.login}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-[9px] font-bold text-white/20 uppercase">
                                  Sem Vínculo
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[9px] font-black text-white/30 uppercase">
                                Criado em:{" "}
                                {format(badge.dataCriacao, "dd/MM/yyyy HH:mm")}
                              </p>
                              <p className="text-[9px] font-bold text-white/40 uppercase mt-0.5">
                                Uso:{" "}
                                {badge.ultimoUso
                                  ? format(badge.ultimoUso, "dd/MM/yyyy HH:mm")
                                  : "Nunca"}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  title="Baixar QR Code SVG"
                                  onClick={() =>
                                    handleDownloadQR(badge.codigoCracha)
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/10 hover:border-emerald-500/30 rounded-xl transition-all font-sans text-[10px] font-black uppercase tracking-wider"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Baixar SVG</span>
                                </button>
                                <button
                                  title="Regenerar Código"
                                  onClick={() => setBadgeToRegenerate(badge)}
                                  className="p-2 hover:bg-white/5 text-white/40 hover:text-amber-500 transition-all rounded-xl"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title="Editar / Vincular"
                                  onClick={() => setEditingBadge(badge)}
                                  className="p-2 hover:bg-white/5 text-white/40 hover:text-white transition-all rounded-xl"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  title="Excluir"
                                  onClick={() => setBadgeToDelete(badge)}
                                  className="p-2 hover:bg-white/5 text-white/20 hover:text-red-500 transition-all rounded-xl"
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
          </motion.div>
        )}

        {activeTab === "nfc" && (
          <motion.div
            key="nfc"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-[#121212] border border-white/5 rounded-[32px] overflow-hidden space-y-6">
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex flex-col md:flex-row items-stretch md:items-center justify-between bg-white/[0.02] gap-4">
                <div className="flex items-center gap-3 text-white/20">
                  <Cpu className="w-5 h-5 text-amber-500 animate-pulse" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">
                      Gerenciamento de Tags NFC
                    </h3>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-tight">
                      Planejamento e cadastro de chaves físicas NFC para identificadores reutilizáveis
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 select-none">
                  <button
                    onClick={async () => {
                      const res = await permanentlyDeleteExpiredNFCTags();
                      alert(res.success ? `Tags expiradas removidas com sucesso!` : "Nenhuma tag expirada encontrada.");
                    }}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                  >
                    Excluir Expiradas
                  </button>
                  <div className="bg-amber-500/10 px-4 py-2 rounded-full border border-amber-500/20">
                    <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                      Total Cadastrados: {nfcTags.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Add New Tag NFC Panel */}
              {isAddingNfc && (
                <div className="px-6 py-4 mx-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                      Cadastrar Nova Tag NFC
                    </span>
                    <button
                      onClick={() => {
                        setIsAddingNfc(false);
                        setNewNfcUid("");
                        setNewNfcLabel("");
                        setNewNfcError("");
                      }}
                      className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest font-sans"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans font-black">
                        UID da Tag NFC (Único) *
                      </label>
                      <input
                        type="text"
                        value={newNfcUid}
                        onChange={(e) => {
                          setNewNfcUid(e.target.value);
                          setNewNfcError("");
                        }}
                        placeholder="Ex: 04:A3:BA:12:F3:64:80"
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-amber-500 transition-all font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans font-black">
                        Apelido / Nome da Tag (Opcional)
                      </label>
                      <input
                        type="text"
                        value={newNfcLabel}
                        onChange={(e) => setNewNfcLabel(e.target.value)}
                        placeholder="Ex: Tag Reserva Recepção"
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>
                  </div>
                  {newNfcError && (
                    <p className="text-[9px] font-mono font-bold text-red-500 uppercase tracking-wider">
                      ⚠️ {newNfcError}
                    </p>
                  )}
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      onClick={async () => {
                        const trimmedUid = newNfcUid.trim().toUpperCase();
                        if (!trimmedUid) {
                          setNewNfcError("O UID da tag NFC não pode ser vazio!");
                          return;
                        }
                        const res = await addNFCTag(trimmedUid, newNfcLabel || undefined);
                        if (res.success) {
                          setIsAddingNfc(false);
                          setNewNfcUid("");
                          setNewNfcLabel("");
                          setNewNfcError("");
                        } else {
                          setNewNfcError(res.error || "Ocorreu um erro ao cadastrar a tag.");
                        }
                      }}
                      className="px-6 py-2.5 bg-amber-500 text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all font-sans cursor-pointer"
                    >
                      Confirmar Cadastro
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Tag NFC Label Form Modal-like inline banner */}
              {editingNfcTag && (
                <div className="px-6 py-4 mx-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest font-black">
                      Editar Nome/Apelido da Tag (UID: {editingNfcTag.uid})
                    </span>
                    <button
                      onClick={() => {
                        setEditingNfcTag(null);
                        setEditingNfcLabel("");
                      }}
                      className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans">
                        Apelido / Nome da Tag
                      </label>
                      <input
                        type="text"
                        value={editingNfcLabel}
                        onChange={(e) => setEditingNfcLabel(e.target.value)}
                        placeholder="Novo Apelido"
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                    </div>

                    <div className="w-full md:w-56 space-y-1">
                      <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans">
                        Nível Credencial
                      </label>
                      <select
                        value={editingNfcType}
                        onChange={(e: any) => setEditingNfcType(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans cursor-pointer"
                      >
                        <option value="OPERADOR" className="bg-neutral-900 text-white">OPERADOR (Comum)</option>
                        <option value="MASTER" className="bg-neutral-900 text-white">MASTER (Supervisão)</option>
                      </select>
                    </div>

                    <button
                      onClick={async () => {
                        const res = await updateNFCTag(editingNfcTag.id, { 
                          tagLabel: editingNfcLabel,
                          tipoCredencial: editingNfcType
                        });
                        if (res.success) {
                          setEditingNfcTag(null);
                          setEditingNfcLabel("");
                        } else {
                          alert(res.error || "Erro ao atualizar");
                        }
                      }}
                      className="px-6 h-[46px] w-full md:w-auto bg-amber-500 text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all font-sans cursor-pointer flex items-center justify-center"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}

              {/* Quarantine description form */}
              {quarantiningNfcTag && (
                <div className="px-6 py-4 mx-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest font-black">
                      Enviar Tag (UID: {quarantiningNfcTag.uid}) para Quarentena
                    </span>
                    <button
                      onClick={() => {
                        setQuarantiningNfcTag(null);
                        setQuarantineReasonText("");
                      }}
                      className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans font-black">
                      Motivo da Quarentena
                    </label>
                    <div className="flex gap-4">
                      <input
                        type="text"
                        value={quarantineReasonText}
                        onChange={(e) => setQuarantineReasonText(e.target.value)}
                        placeholder="Ex: Devolvido com defeito / Suspeita de fraude"
                        className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                      />
                      <button
                        onClick={async () => {
                          const res = await quarantineNFCTag(quarantiningNfcTag.id, quarantineReasonText || undefined);
                          if (res.success) {
                            setQuarantiningNfcTag(null);
                            setQuarantineReasonText("");
                          } else {
                            alert(res.error || "Erro ao colocar em quarentena");
                          }
                        }}
                        className="px-6 py-2.5 bg-purple-500 hover:bg-purple-400 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all font-sans cursor-pointer whitespace-nowrap"
                      >
                        Aplicar Quarentena
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tags List */}
              <div className="overflow-x-auto pb-6">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        UID da Tag
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Apelido / Nome
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Status
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Nível Credencial
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Vínculo Atual
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Data Cadastro
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest text-right font-black">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfcTags.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-20 text-center space-y-4 opacity-20">
                          <Cpu className="w-12 h-12 mx-auto text-white/20 animate-pulse" />
                          <p className="text-[10px] font-black uppercase tracking-widest">
                            Nenhuma Tag NFC Cadastrada
                          </p>
                          <button
                            onClick={() => setIsAddingNfc(true)}
                            className="px-6 py-2.5 bg-amber-500 text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-400 transition-all font-sans cursor-pointer"
                          >
                            Cadastrar Primeira Tag
                          </button>
                        </td>
                      </tr>
                    ) : (
                      nfcTags.map((tag) => {
                        const linkedUser = tag.usuarioVinculado ? users.find(u => u.id === tag.usuarioVinculado) : null;
                        
                        return (
                          <tr key={tag.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-all group">
                            <td className="px-6 py-4 text-xs font-mono font-bold text-white uppercase group-hover:text-amber-500 transition-all select-all">
                              {tag.uid}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-white/60">
                              {tag.tagLabel || <span className="opacity-30 italic">Sem apelido</span>}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border",
                                  tag.status === "Livre" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                                  tag.status === "Vinculado" && "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                  tag.status === "Bloqueado" && "bg-red-500/10 text-red-400 border-red-500/20",
                                  tag.status === "Perdido" && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                                  tag.status === "Quarentena" && "bg-purple-500/10 text-purple-400 border-purple-500/20",
                                  tag.status === "Excluido" && "bg-white/10 text-white/45 border-white/5"
                                )}
                              >
                                {tag.status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border font-mono",
                                  tag.tipoCredencial === "MASTER" && "bg-indigo-500/15 text-indigo-300 border-indigo-500/35 shadow-[0_0_8px_rgba(99,102,241,0.2)]",
                                  tag.tipoCredencial === "ADM" && "bg-red-500/15 text-red-300 border-red-500/35 shadow-[0_0_8px_rgba(239,68,68,0.2)]",
                                  (!tag.tipoCredencial || tag.tipoCredencial === "OPERADOR") && "bg-white/5 text-white/60 border-white/10"
                                )}
                              >
                                {tag.tipoCredencial || "OPERADOR"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs">
                              {linkedUser ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-white">{linkedUser.fullName}</span>
                                  <span className="text-[8px] text-white/30 font-black uppercase font-mono tracking-widest">
                                    Login: {linkedUser.login}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-white/20 italic">Sem vínculo</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs font-mono text-white/40">
                              {new Date(tag.dataCriacao).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1.5 opacity-60 group-hover:opacity-100 transition-all select-none">
                                <button
                                  title="Editar Apelido"
                                  onClick={() => {
                                    setEditingNfcTag(tag);
                                    setEditingNfcLabel(tag.tagLabel || "");
                                    setEditingNfcType(tag.tipoCredencial || "OPERADOR");
                                  }}
                                  className="p-1.5 hover:bg-white/5 text-white/40 hover:text-white transition-all rounded-lg text-xs font-bold font-sans cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {tag.status === "Livre" || tag.status === "Vinculado" ? (
                                  <>
                                    <button
                                      title="Bloquear"
                                      onClick={() => {
                                        updateNFCTag(tag.id, { status: "Bloqueado" });
                                      }}
                                      className="p-1.5 hover:bg-red-500/10 text-red-500/30 hover:text-red-400 transition-all rounded-lg cursor-pointer"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      title="Marcar como Perdida"
                                      onClick={() => {
                                        updateNFCTag(tag.id, { status: "Perdido" });
                                      }}
                                      className="p-1.5 hover:bg-yellow-500/10 text-yellow-500/30 hover:text-yellow-400 transition-all rounded-lg cursor-pointer"
                                    >
                                      <MinusCircle className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      title="Quarentena"
                                      onClick={() => {
                                        setQuarantiningNfcTag(tag);
                                        setQuarantineReasonText("");
                                      }}
                                      className="p-1.5 hover:bg-purple-500/10 text-purple-400/30 hover:text-purple-400 transition-all rounded-lg cursor-pointer"
                                    >
                                      <Activity className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    title="Restaurar / Ativar / Livre"
                                    onClick={() => {
                                      restoreNFCTag(tag.id);
                                    }}
                                    className="p-1.5 hover:bg-emerald-500/10 text-emerald-400/30 hover:text-emerald-400 transition-all rounded-lg cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  title="Marcar como Excluída"
                                  onClick={() => {
                                    if (confirm(`Tem certeza que deseja marcar esta tag como excluída?`)) {
                                      updateNFCTag(tag.id, { status: "Excluido" });
                                    }
                                  }}
                                  className="p-1.5 hover:bg-white/5 text-white/20 hover:text-red-500 transition-all rounded-lg cursor-pointer"
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
          </motion.div>
        )}

        {activeTab === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="bg-[#121212] border border-white/5 rounded-[32px] overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3 text-white/20">
                  <Activity className="w-5 h-5" />
                  <h3 className="text-xs font-black uppercase tracking-widest">
                    Logs de Auditoria do Sistema
                  </h3>
                </div>
                <div className="bg-amber-500/10 px-4 py-1.5 rounded-full border border-amber-500/20">
                  <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                    Total: {auditLogs.length} Registros
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Data / Hora
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Usuário
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Módulo
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Ação
                      </th>
                      <th className="px-6 py-4 text-[9px] font-black text-white/20 uppercase tracking-widest">
                        Descrição
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-20 text-center space-y-4 opacity-20"
                        >
                          <History className="w-12 h-12 mx-auto" />
                          <p className="text-[10px] font-black uppercase tracking-widest">
                            Nenhum registro encontrado
                          </p>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {pagedLogs.map((log) => (
                          <tr
                            key={log.id}
                            className="border-b border-white/5 hover:bg-white/[0.01] transition-colors"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              <p className="text-[10px] font-black text-white/40 uppercase">
                                {format(log.timestamp, "dd/MM/yyyy", {
                                  locale: ptBR,
                                })}
                              </p>
                              <p className="text-[10px] font-bold text-white/20">
                                {format(log.timestamp, "HH:mm:ss")}
                              </p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                                <div>
                                  <p className="text-[10px] font-black text-white uppercase tracking-tight">
                                    {log.userLogin}
                                  </p>
                                  <p className="text-[8px] font-bold text-white/20 uppercase tracking-tighter">
                                    {log.userRole}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-[9px] font-black text-white/40 uppercase bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                                {log.module}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={cn(
                                  "text-[9px] font-black uppercase tracking-tighter",
                                  log.actionType === "create"
                                    ? "text-emerald-500"
                                    : log.actionType === "delete"
                                      ? "text-red-500"
                                      : log.actionType === "cancel"
                                        ? "text-amber-500"
                                        : "text-white/40",
                                )}
                              >
                                {log.actionType}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-[10px] font-bold text-white/60 lowercase italic line-clamp-2 max-w-[300px]">
                                {log.description}
                              </p>
                            </td>
                          </tr>
                        ))}

                        {totalLogPages > 1 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-6 py-4 border-t border-white/5 bg-white/[0.01]"
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">
                                  Página {logPage} de {totalLogPages}
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() =>
                                      setLogPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={logPage === 1}
                                    className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase text-white/40 disabled:opacity-20 translate-all"
                                  >
                                    Anterior
                                  </button>
                                  <button
                                    onClick={() =>
                                      setLogPage((p) =>
                                        Math.min(totalLogPages, p + 1),
                                      )
                                    }
                                    disabled={logPage === totalLogPages}
                                    className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase text-white/40 disabled:opacity-20 translate-all"
                                  >
                                    Próximo
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Newly Created User Info Modal */}
      <AnimatePresence>
        {newlyCreatedUser && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNewlyCreatedUser(null)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl z-20"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-emerald-500/30 rounded-[40px] shadow-2xl p-8 space-y-6 my-auto text-center z-30"
            >
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-[2rem] flex items-center justify-center text-emerald-400 mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-black text-white uppercase tracking-widest">
                  Colaborador Criado!
                </h2>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-tight">
                  O colaborador{" "}
                  <span className="text-emerald-400">
                    {newlyCreatedUser.fullName}
                  </span>{" "}
                  foi cadastrado com sucesso.
                </p>
              </div>

              <div className="bg-white/5 border border-white/5 p-6 rounded-3xl space-y-2">
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest block">
                  Matrícula de Acesso
                </span>
                <span className="text-3xl font-black text-emerald-400 font-mono tracking-widest block">
                  {newlyCreatedUser.matricula}
                </span>
                <p className="text-[8px] text-white/40 uppercase font-black tracking-widest leading-relaxed pt-1">
                  Esta matrícula deve ser usada como login junto à senha
                  cadastrada para entrar no sistema.
                </p>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(newlyCreatedUser.matricula);
                    alert("Matrícula copiada com sucesso!");
                  }}
                  className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                >
                  Copiar Matrícula
                </button>
                <button
                  onClick={() => setNewlyCreatedUser(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Edit Modal */}
      <AnimatePresence>
        {isEditingUser && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingUser(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className={cn(
                "relative w-full bg-[#0a0a0a] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden shadow-black/80 my-auto",
                isSelectedUserMasterAdmin ? "max-w-4xl" : "max-w-2xl",
              )}
            >
              <button
                onClick={() => setIsEditingUser(false)}
                className="absolute top-6 right-6 md:top-8 md:right-8 p-2 text-white/20 hover:text-white transition-all z-10"
              >
                <XCircle className="w-6 h-6" />
              </button>

              <div className="p-6 md:p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest leading-tight">
                      {selectedUser?.id ? "Editar Usuário" : "Novo Usuário"}
                    </h2>
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-tight">
                      Configure as credenciais e o acesso do colaborador
                    </p>
                  </div>
                  <div className="hidden sm:block p-3 bg-amber-500/10 rounded-2xl text-amber-500">
                    <UserPlus className="w-6 h-6" />
                  </div>
                </div>

                {isSelectedUserMasterAdmin ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                    {/* Coluna da Esquerda: Dados do Administrador e Senha */}
                    <div className="space-y-6 max-h-[55vh] overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest leading-relaxed mb-1 font-sans">
                          🛡️ SEGURANÇA E REGISTRO DO ADMINISTRADOR
                        </p>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-tight leading-relaxed font-sans">
                          Aqui você pode alterar sua foto, suas informações de identificação do crachá, ou redefinir sua senha de acesso principal (ADM).
                        </p>
                      </div>

                      {/* Dados Gerais do ADM */}
                      <div className="space-y-5">
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-1 font-sans border-b border-white/5 pb-2">
                          📋 Informações para o Crachá
                        </h3>
                        
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                            Nome Completo
                          </label>
                          <input
                            value={selectedUser?.fullName || ""}
                            onChange={(e) =>
                              setSelectedUser((prev) =>
                                prev ? { ...prev, fullName: e.target.value } : null
                              )
                            }
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                            placeholder="EX: JOÃO DE SOUZA SILVA"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                            Função Específica (Crachá)
                          </label>
                          <input
                            value={selectedUser?.primaryFunction || ""}
                            onChange={(e) =>
                              setSelectedUser((prev) =>
                                prev ? { ...prev, primaryFunction: e.target.value } : null
                              )
                            }
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                            placeholder="EX: GERENTE GERAL"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                            Loja-Filial (Crachá)
                          </label>
                          <input
                            value={selectedUser?.loja || ""}
                            onChange={(e) =>
                              setSelectedUser((prev) =>
                                prev ? { ...prev, loja: e.target.value } : null
                              )
                            }
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                            placeholder="EX: MATRIZ SÃO PAULO"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                            Setor / Departamento (Crachá)
                          </label>
                          <input
                            value={selectedUser?.setor || ""}
                            onChange={(e) =>
                              setSelectedUser((prev) =>
                                prev ? { ...prev, setor: e.target.value } : null
                              )
                            }
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all font-sans"
                            placeholder="EX: DIRETORIA"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                            Foto de Identificação (Crachá)
                          </label>
                          <div className="flex gap-4 items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                            <div className="w-14 h-18 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                              {selectedUser?.image ? (
                                <img
                                  src={selectedUser.image}
                                  alt="Administrador"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest text-center px-1 font-sans">
                                  Sem Foto
                                </span>
                              )}
                            </div>
                            <div className="flex-1 space-y-1.5">
                              <p className="text-[8px] text-white/40 uppercase font-bold tracking-widest leading-normal font-sans">
                                Escolha uma foto crachá de proporção recomendada 3:4.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      const reader = new FileReader();
                                      reader.onloadend = () => {
                                        setSelectedUser((prev) =>
                                          prev ? { ...prev, image: reader.result as string } : null
                                        );
                                      };
                                      reader.readAsDataURL(file);
                                    }
                                  }}
                                  className="hidden"
                                  id="admin-photo-upload"
                                />
                                <label
                                  htmlFor="admin-photo-upload"
                                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[8px] uppercase tracking-wider rounded-lg transition-all cursor-pointer block font-sans"
                                >
                                  Upload Foto
                                </label>
                                {selectedUser?.image && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedUser((prev) =>
                                        prev ? { ...prev, image: undefined } : null
                                      )
                                    }
                                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black text-[8px] uppercase tracking-wider rounded-lg transition-all cursor-pointer font-sans"
                                  >
                                    Remover
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <hr className="border-white/5 my-2" />

                      {/* Alteração opcional de senha */}
                      <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] ml-1 font-sans border-b border-white/5 pb-2">
                          🔑 Alterar Senha (Opcional)
                        </h3>

                        {passwordError && (
                          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-500 animate-pulse">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            <p className="text-[10px] font-black uppercase tracking-wider font-sans">
                              {passwordError}
                            </p>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                              Senha Atual (Antiga)
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={oldPassword}
                                onChange={(e) => {
                                  setOldPassword(e.target.value);
                                  setPasswordError("");
                                }}
                                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all pr-12 font-sans"
                                placeholder="••••••••"
                              />
                              <Lock className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10" />
                            </div>
                            <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest ml-1 font-sans">
                              Deixe em branco se deseja atualizar apenas as informações do crachá.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                              Nova Senha
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => {
                                  setNewPassword(e.target.value);
                                  setPasswordError("");
                                }}
                                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all pr-12 font-sans"
                                placeholder="••••••••"
                              />
                              <Lock className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10" />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                              Confirmar Nova Senha
                            </label>
                            <div className="relative">
                              <input
                                type="password"
                                value={confirmNewPassword}
                                onChange={(e) => {
                                  setConfirmNewPassword(e.target.value);
                                  setPasswordError("");
                                }}
                                className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all pr-12 font-sans"
                                placeholder="••••••••"
                              />
                              <Lock className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Coluna da Direita: Crachá QR Code Administrativo */}
                    <div className="space-y-6 bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
                      <div className="space-y-1">
                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-[0.15em]">
                          Crachá Administrativo
                        </h4>
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-tight max-w-[240px] leading-relaxed">
                          Este crachá administrativo especial está vinculado à
                          versão atual da sua senha.
                        </p>
                      </div>

                      <StandardQRCode
                        id="admin-badge-svg"
                        value={
                          selectedUser?.qrCodeToken ||
                          "admin-initial-token"
                        }
                        size={130}
                      />

                      <div className="w-full space-y-3">
                        <div className="p-3 bg-white/5 border border-white/5 rounded-2xl flex flex-col items-center gap-1">
                          <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">
                            Token de Segurança Ativo
                          </span>
                          <span className="text-[9px] font-mono font-black text-amber-500 uppercase tracking-wider truncate max-w-[180px]">
                            {selectedUser?.qrCodeToken || "admin-initial-token"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={downloadAdminQRCodePNG}
                            className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Def. PNG
                          </button>
                          <button
                            type="button"
                            onClick={downloadAdminQRCodeSVG}
                            className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Def. SVG
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={handleRegenerateAdminQR}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                        >
                          <RefreshCw className="w-3 h-3 text-red-500" />
                          Regenerar QR Code
                        </button>

                        <button
                          type="button"
                          onClick={handleStartScanAdminQR}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                        >
                          <QrCode className="w-3.5 h-3.5 text-amber-500" />
                          Escanear QR Code existente
                        </button>

                        <div className="border-t border-white/5 pt-4 mt-2 space-y-3 text-left w-full">
                          <h5 className="text-[9px] font-black text-white/30 uppercase tracking-[0.1em] font-sans">
                            NFC do Administrador (ADM)
                          </h5>
                          {selectedUser?.nfcTagId ? (
                            (() => {
                              const tag = nfcTags.find(t => t.id === selectedUser.nfcTagId);
                              return (
                                <div className="space-y-2">
                                  <div className="p-3 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans">
                                        Tag NFC Vinculada
                                      </span>
                                      <span className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-wider">
                                        UID: {tag?.uid || "Não Encontrado"}
                                      </span>
                                      <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider font-sans">
                                        Status: {tag?.status || "Vinculado"}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleUnlinkNfcFromSelectedUser}
                                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                                    >
                                      Desvincular NFC do ADM
                                    </button>
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="space-y-3">
                              {isLinkingNFC ? (
                                <div className="p-3 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                                  <div className="space-y-1">
                                    <label className="text-[8px] font-black text-white/30 uppercase tracking-widest font-sans">
                                      Digite o UID NFC Manualmente
                                    </label>
                                    <input
                                      type="text"
                                      value={manualNfcUid}
                                      onChange={(e) => {
                                        setManualNfcUid(e.target.value);
                                        setNfcError("");
                                      }}
                                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-amber-500 transition-all"
                                      placeholder="Ex: 04:A3:BA:12:F3:64:80"
                                    />
                                    {nfcError && (
                                      <p className="text-[8px] font-mono font-bold text-red-500 uppercase tracking-wider mt-0.5 animate-pulse">
                                        ⚠️ {nfcError}
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    type="button"
                                    disabled
                                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-white/5 border border-white/5 text-white/40 rounded-xl text-[8px] font-black uppercase tracking-widest cursor-not-allowed font-sans"
                                  >
                                    <span className="animate-pulse">Aproxime a tag NFC para capturar o ID</span>
                                  </button>

                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={handleLinkNfcToSelectedUser}
                                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans text-center"
                                    >
                                      Confirmar Vínculo
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsLinkingNFC(false);
                                        setManualNfcUid("");
                                        setNfcError("");
                                      }}
                                      className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setIsLinkingNFC(true)}
                                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                                >
                                  Vincular NFC do ADM
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {userFormError && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-450 md:col-span-2">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
                          <p className="text-[9px] font-mono font-bold uppercase tracking-wider">
                            {userFormError}
                          </p>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Nome Completo
                        </label>
                        <input
                          value={selectedUser?.fullName || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) => ({
                              ...prev,
                              fullName: e.target.value,
                            }))
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                          placeholder="EX: JOÃO DA SILVA"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Matrícula (Login de Acesso)
                        </label>
                        <div className="relative">
                          <input
                            value={
                              selectedUser?.matricula ||
                              selectedUser?.login ||
                              ""
                            }
                            readOnly
                            disabled
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white/50 focus:outline-none transition-all font-mono select-all cursor-not-allowed pr-20"
                            placeholder="Auto-gerada"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const m =
                                selectedUser?.matricula || selectedUser?.login;
                              if (m) {
                                navigator.clipboard.writeText(m);
                                alert("Matrícula copiada!");
                              }
                            }}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-500 hover:text-amber-400 transition-all font-sans cursor-pointer z-10"
                          >
                            Copiar
                          </button>
                        </div>
                        <p className="text-[8px] font-bold text-white/20 uppercase tracking-wide ml-1">
                          As matrículas são automáticas, numéricas e exclusivas
                          para cada colaborador.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Senha de Acesso
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            value={selectedUser?.password || ""}
                            onChange={(e) =>
                              setSelectedUser((prev) => ({
                                ...prev,
                                password: e.target.value,
                              }))
                            }
                            className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all pr-12"
                            placeholder="••••••••"
                          />
                          <Lock className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Função / Cargo
                        </label>
                        <select
                          value={selectedUser?.roleId || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) => ({
                              ...prev,
                              roleId: e.target.value,
                            }))
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer"
                        >
                          <option value="" disabled>
                            Selecionar Função...
                          </option>
                          {userRoles.filter(role => role.id !== 'administrador' && !role.name.toLowerCase().includes('administrador')).map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Crachá Vinculado
                        </label>
                        <select
                          value={selectedUser?.badgeId || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) => ({
                              ...prev,
                              badgeId: e.target.value || undefined,
                            }))
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer"
                        >
                          <option value="">Nenhum Crachá Vinculado</option>
                          {badges
                            .filter(
                              (b) =>
                                b.status === "Livre" ||
                                b.usuarioVinculado === selectedUser?.id,
                            )
                            .map((badge) => (
                              <option key={badge.id} value={badge.id}>
                                {badge.codigoCracha}{" "}
                                {badge.usuarioVinculado === selectedUser?.id
                                  ? "(Atual)"
                                  : ""}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          NFC Vinculado
                        </label>
                        {selectedUser?.nfcTagId ? (
                          (() => {
                            const tag = nfcTags.find(t => t.id === selectedUser.nfcTagId);
                            return (
                              <div className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-wider">
                                    UID: {tag?.uid || "Não Encontrado"}
                                  </span>
                                  {tag?.tagLabel && (
                                    <span className="text-[9px] text-white/60 font-bold">
                                      Apelido: {tag.tagLabel}
                                    </span>
                                  )}
                                  <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest font-sans">
                                    Status: {tag?.status || "Vinculado"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleUnlinkNfcFromSelectedUser}
                                  className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                                >
                                  Desvincular NFC
                                </button>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <select
                                value={selectedNfcTagIdToLink}
                                onChange={(e) => setSelectedNfcTagIdToLink(e.target.value)}
                                className="flex-1 bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-xs font-sans text-white focus:outline-none focus:border-amber-500 transition-all cursor-pointer"
                              >
                                <option value="">Nenhum NFC Selecionado</option>
                                {nfcTags
                                  .filter(t => t.status === "Livre")
                                  .map(tag => (
                                    <option key={tag.id} value={tag.id}>
                                      {tag.uid} {tag.tagLabel ? `(${tag.tagLabel})` : ""}
                                    </option>
                                  ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!selectedNfcTagIdToLink) {
                                    alert("Por favor, selecione uma Tag NFC cadastrada na lista.");
                                    return;
                                  }
                                  const targetTag = nfcTags.find(t => t.id === selectedNfcTagIdToLink);
                                  if (targetTag) {
                                    setSelectedUser(prev => prev ? { ...prev, nfcTagId: targetTag.id } : null);
                                    if (selectedUser?.id) {
                                      linkNFCTagToUser(targetTag.id, selectedUser.id);
                                    }
                                    setSelectedNfcTagIdToLink("");
                                  }
                                }}
                                className="px-4 py-3 bg-amber-500 hover:bg-white text-black rounded-xl text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                              >
                                Vincular NFC
                              </button>
                            </div>
                            <p className="text-[8px] text-white/30 uppercase tracking-widest ml-1 font-sans">
                              * Liste e cadastre as tags NFC físicas na aba principal "NFC" antes de vinculá-las aos colaboradores.
                            </p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1 font-sans">
                          Módulo Inicial Automático (Login)
                        </label>
                        <select
                          value={selectedUser?.initialModule || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) => ({
                              ...prev,
                              initialModule: e.target.value || undefined,
                            }))
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer"
                        >
                          <option value="">Padrão da Função</option>
                          <option value="home">Menu Principal Completo</option>
                          {APP_MODULES.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.category})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Função Específica (Crachá)
                        </label>
                        <input
                          value={selectedUser?.primaryFunction || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) =>
                              prev ? { ...prev, primaryFunction: e.target.value } : null
                            )
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                          placeholder="EX: COORDENADOR DE EXPEDIÇÃO"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Loja-Filial (Crachá)
                        </label>
                        <input
                          value={selectedUser?.loja || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) =>
                              prev ? { ...prev, loja: e.target.value } : null
                            )
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                          placeholder="EX: FILIAL MATRIZ"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Setor / Departamento (Crachá)
                        </label>
                        <input
                          value={selectedUser?.setor || ""}
                          onChange={(e) =>
                            setSelectedUser((prev) =>
                              prev ? { ...prev, setor: e.target.value } : null
                            )
                          }
                          className="w-full bg-white/5 border border-white/5 rounded-2xl px-5 py-4 text-xs font-bold text-white focus:outline-none focus:border-amber-500 transition-all"
                          placeholder="EX: EXPEDIÇÃO"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                          Foto de Identificação (Crachá)
                        </label>
                        <div className="flex gap-4 items-center bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                          <div className="w-14 h-14 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                            {selectedUser?.image ? (
                              <img
                                src={selectedUser.image}
                                alt="Colaborador"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[8px] font-black text-white/20 uppercase tracking-widest text-center">
                                Sem Foto
                              </span>
                            )}
                          </div>
                          <div className="flex-1 space-y-1.5">
                            <p className="text-[8px] text-white/40 uppercase font-bold tracking-widest">
                              Escolha uma foto quadrada/crachá para este colaborador.
                            </p>
                            <div className="flex gap-2">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setSelectedUser((prev) =>
                                        prev ? { ...prev, image: reader.result as string } : null
                                      );
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                                className="hidden"
                                id="user-photo-upload"
                              />
                              <label
                                htmlFor="user-photo-upload"
                                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-[8px] uppercase tracking-wider rounded-lg transition-all cursor-pointer block"
                              >
                                Upload Foto
                              </label>
                              {selectedUser?.image && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedUser((prev) =>
                                      prev ? { ...prev, image: undefined } : null
                                    )
                                  }
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-black text-[8px] uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* SEÇÃO SOBRESCRITA DE MÓDULOS LIBERADOS */}
                    <div className="border-t border-white/5 pt-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-amber-500" />
                        <h4 className="text-[10px] font-black text-white uppercase tracking-wider font-sans">
                          Módulos Liberados (Sobrescrita Personalizada)
                        </h4>
                      </div>
                      <p className="text-[9px] font-mono leading-relaxed text-white/20 uppercase max-w-4xl">
                        Selecione abaixo os módulos que este usuário específico
                        terá acesso.{" "}
                        <span className="text-amber-500 font-bold">
                          Se nenhum estiver selecionado
                        </span>
                        , o sistema usará as permissões delegadas à Função/Cargo
                        configurada acima. Qualquer módulo desmarcado aqui ou lá
                        ficará bloqueado.
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {APP_MODULES.map((m) => {
                          const isChecked =
                            selectedUser?.allowedModules?.includes(m.id) ||
                            false;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => {
                                setSelectedUser((prev) => {
                                  const currentAllowed =
                                    prev?.allowedModules || [];
                                  let newAllowed = [...currentAllowed];
                                  if (isChecked) {
                                    newAllowed = newAllowed.filter(
                                      (id) => id !== m.id,
                                    );
                                  } else {
                                    newAllowed.push(m.id);
                                  }
                                  return {
                                    ...prev,
                                    allowedModules:
                                      newAllowed.length > 0
                                        ? newAllowed
                                        : undefined,
                                  };
                                });
                              }}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer",
                                isChecked
                                  ? "bg-amber-500/10 border-amber-500/35 text-white"
                                  : "bg-white/[0.01] border-white/5 hover:bg-white/5 text-white/50",
                              )}
                            >
                              <span className="text-[9px] font-bold uppercase tracking-tight truncate mr-2">
                                {m.name}
                              </span>
                              <div
                                className={cn(
                                  "w-3.5 h-3.5 rounded flex items-center justify-center border transition-all shrink-0",
                                  isChecked
                                    ? "bg-amber-500 border-amber-500 text-black"
                                    : "bg-black/30 border-white/10",
                                )}
                              >
                                {isChecked && (
                                  <CheckCircle2 className="w-2.5 h-2.5" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                            Status da Conta
                          </label>
                          <div className="flex bg-white/5 p-1 rounded-2xl">
                            {["ativo", "inativo"].map((s) => {
                              const isAdm = isSelectedUserMasterAdmin;
                              const isDisabled = isAdm && s === "inativo";

                              return (
                                <button
                                  key={s}
                                  disabled={isDisabled}
                                  onClick={() =>
                                    setSelectedUser((prev) => ({
                                      ...prev,
                                      status: s as any,
                                    }))
                                  }
                                  className={cn(
                                    "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                                    selectedUser?.status === s
                                      ? s === "ativo"
                                        ? "bg-emerald-500 text-black"
                                        : "bg-red-500 text-black"
                                      : "text-white/20 hover:text-white",
                                    isDisabled &&
                                      "opacity-20 cursor-not-allowed",
                                  )}
                                >
                                  {s}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isSelectedUserMasterAdmin}
                          onClick={() =>
                            setSelectedUser((prev) => ({
                              ...prev,
                              isAdmin: !prev?.isAdmin,
                            }))
                          }
                          className={cn(
                            "w-full py-4 rounded-2xl border transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest",
                            selectedUser?.isAdmin
                              ? "bg-amber-500/10 border-amber-500 text-amber-500"
                              : "bg-white/5 border-white/5 text-white/20",
                            isSelectedUserMasterAdmin &&
                              "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <Shield className="w-4 h-4" />
                          Privilégios de Administrador
                          {selectedUser?.isAdmin && (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </button>

                        {isSelectedUserMasterAdmin && (
                          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                            <p className="text-[8px] font-bold text-amber-500 uppercase tracking-widest leading-relaxed">
                              Este é o usuário principal (Dono). Suas permissões
                              são globais e ilimitadas, e ele não pode ser
                              desativado.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 bg-white/[0.02] border border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center space-y-4">
                        <h4 className="text-[10px] font-black text-white/30 uppercase tracking-widest">
                          QR Code de Login e Operação
                        </h4>
                        {(() => {
                          const linkedBadge = badges.find(
                            (b) => b.id === selectedUser?.badgeId,
                          );
                          if (linkedBadge) {
                            return (
                              <div className="flex flex-col items-center space-y-3">
                                <StandardQRCode
                                  value={linkedBadge.codigoCracha}
                                  size={144}
                                />
                                <span className="text-[10px] font-mono font-black text-amber-500 uppercase tracking-widest bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20">
                                  CRACHÁ: {linkedBadge.codigoCracha}
                                </span>
                              </div>
                            );
                          } else {
                            return (
                              <div className="w-[144px] h-[144px] bg-black/40 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                                <QrCode className="w-8 h-8 text-white/10 mb-2" />
                                <span className="text-[8px] font-black text-white/20 uppercase">
                                  Nenhum crachá vinculado
                                </span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </>
                )}

                {selectedUser && (selectedUser.qrCodeToken || selectedUser.badgeId) && (
                  <div className="pb-4 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBadgeSelectedUserId(selectedUser.id);
                        setActiveSettingModule("cracha");
                        setIsSettingsOpen(true);
                        setIsEditingUser(false);
                      }}
                      className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all outline-none flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      Imprimir Crachá de Acesso
                    </button>
                  </div>
                )}

                <div className="pt-6 flex gap-3 border-t border-white/5">
                  <button
                    onClick={() => setIsEditingUser(false)}
                    className="flex-1 py-4 bg-white/5 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all outline-none"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveUser}
                    className="flex-1 py-4 bg-amber-500 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-all shadow-xl shadow-amber-500/20"
                  >
                    {isSelectedUserMasterAdmin
                      ? "Salvar Alteração de Senha"
                      : "Salvar Usuário"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Badge Edit Modal */}
      <AnimatePresence>
        {editingBadge && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingBadge(null)}
              className="fixed inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#0a0a0a] border border-white/10 rounded-[32px] shadow-2xl overflow-hidden shadow-black/80 my-auto p-6 md:p-8 space-y-6"
            >
              <button
                onClick={() => setEditingBadge(null)}
                className="absolute top-6 right-6 p-2 text-white/20 hover:text-white transition-all z-10"
              >
                <XCircle className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <h2 className="text-base font-black text-white uppercase tracking-widest leading-tight">
                  Configurar Crachá
                </h2>
                <p className="text-[9px] font-bold text-white/20 uppercase tracking-tight">
                  Gerencie status e vinculação do crachá{" "}
                  {editingBadge.codigoCracha}
                </p>
              </div>

              <div className="flex flex-col items-center justify-center p-6 bg-white/[0.02] rounded-3xl border border-white/5 space-y-4">
                <StandardQRCode
                  value={editingBadge.codigoCracha}
                  size={120}
                />
                {hasBadgePermission() && (
                  <button
                    onClick={() => {
                      setScanTarget("edit_badge");
                      setIsScanning(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer font-sans"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    Ler QR Code Físico
                  </button>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                    <span className="text-white/30">Código Crachá:</span>
                    <span className="text-white font-mono">
                      {editingBadge.codigoCracha}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                    <span className="text-white/30">Usuário Vinculado:</span>
                    <span className="text-white">
                      {(() => {
                        const linkedUser = users.find(
                          (u) => u.id === editingBadge.usuarioVinculado,
                        );
                        return linkedUser
                          ? `${linkedUser.fullName} (${linkedUser.login})`
                          : "Nenhum";
                      })()}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">
                    Status do Crachá
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      ["Livre", "Vinculado", "Bloqueado", "Perdido"] as const
                    ).map((st) => {
                      const isSelected = editingBadge.status === st;
                      return (
                        <button
                          key={st}
                          onClick={() => {
                            if (st === "Livre") {
                              desvincularBadge(editingBadge.id);
                              setEditingBadge((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      status: "Livre",
                                      usuarioVinculado: null,
                                    }
                                  : null,
                              );
                            } else if (st === "Bloqueado" || st === "Perdido") {
                              updateBadge(editingBadge.id, { status: st });
                              setEditingBadge((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      status: st,
                                    }
                                  : null,
                              );
                            } else {
                              updateBadge(editingBadge.id, { status: st });
                              setEditingBadge((prev) =>
                                prev ? { ...prev, status: st } : null,
                              );
                            }
                          }}
                          className={cn(
                            "py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                            isSelected
                              ? st === "Livre"
                                ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                                : st === "Vinculado"
                                  ? "bg-blue-500/10 border-blue-500 text-blue-400"
                                  : st === "Bloqueado"
                                    ? "bg-red-500/10 border-red-500 text-red-400"
                                    : "bg-amber-500/10 border-amber-500 text-amber-400" // Perdido
                              : "bg-white/5 border-transparent text-white/40 hover:text-white",
                          )}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setEditingBadge(null)}
                  className="w-full py-4 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-3xl hover:bg-emerald-400 transition-all font-sans"
                >
                  Concluído
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Badge Delete Confirmation Modal */}
      <AnimatePresence>
        {badgeToDelete && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBadgeToDelete(null)}
              className="fixed inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#0a0a0a] border border-red-500/20 rounded-[32px] shadow-2xl overflow-hidden shadow-black/80 my-auto p-6 md:p-8 space-y-6"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 mb-2">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h2 className="text-base font-black text-white uppercase tracking-widest leading-tight">
                  Excluir Crachá?
                </h2>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight">
                  Tem certeza que deseja excluir o crachá{" "}
                  <span className="font-mono text-red-400">
                    {badgeToDelete.codigoCracha}
                  </span>
                  ? Se ele estiver vinculado a algum usuário, o vínculo será
                  desfeito automaticamente.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setBadgeToDelete(null)}
                  className="flex-1 py-4 bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-3xl hover:bg-white/10 transition-all font-sans border border-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    deleteBadge(badgeToDelete.id);
                    setBadgeToDelete(null);
                  }}
                  className="flex-1 py-4 bg-red-500 text-black text-[10px] font-black uppercase tracking-widest rounded-3xl hover:bg-red-400 transition-all font-sans"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Badge Regenerate Confirmation Modal */}
      <AnimatePresence>
        {badgeToRegenerate && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBadgeToRegenerate(null)}
              className="fixed inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-[#0a0a0a] border border-amber-500/20 rounded-[32px] shadow-2xl overflow-hidden shadow-black/80 my-auto p-6 md:p-8 space-y-6"
            >
              <div className="space-y-2 text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500 mb-2">
                  <RefreshCw className="w-5 h-5 animate-spin-slow" />
                </div>
                <h2 className="text-base font-black text-white uppercase tracking-widest leading-tight">
                  Regenerar Código?
                </h2>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-tight">
                  Tem certeza que deseja regenerar o código do crachá{" "}
                  <span className="font-mono text-amber-400">
                    {badgeToRegenerate.codigoCracha}
                  </span>
                  ? O código anterior será invalidado imediatamente.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setBadgeToRegenerate(null)}
                  className="flex-1 py-4 bg-white/5 text-white/60 text-[10px] font-black uppercase tracking-widest rounded-3xl hover:bg-white/10 transition-all font-sans border border-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    regenerateBadgeCode(badgeToRegenerate.id);
                    setBadgeToRegenerate(null);
                  }}
                  className="flex-1 py-4 bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest rounded-3xl hover:bg-amber-400 transition-all font-sans"
                >
                  Regenerar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirmation Popup for Admin QR Code Link */}
      <AnimatePresence>
        {scannedAdminToken && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-hide py-12 md:py-20">
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

      <MasterPasswordModal
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handleMasterPasswordConfirm}
        description="Autorização gerencial necessária para alterar permissões, usuários ou funções."
      />

      <AnimatePresence>
        {isScanning && (
          <QRScanner
            onScan={handleScanResult}
            onClose={() => setIsScanning(false)}
            title={
              scanTarget === "new_badge"
                ? "Cadastrar Novo Crachá"
                : scanTarget === "admin_badge"
                  ? "Escanear QR Code Existente"
                  : "Vincular Código Físico"
            }
            description={
              scanTarget === "new_badge"
                ? "Escore o QR Code físico para realizar o cadastro."
                : scanTarget === "admin_badge"
                  ? "Aponte a câmera para o QR Code existente do crachá do administrador."
                  : "Escore o QR Code físico para atualizar este crachá."
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
};
