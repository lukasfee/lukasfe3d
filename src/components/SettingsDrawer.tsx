import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Building2, 
  Printer, 
  ShieldCheck, 
  Users, 
  Settings,
  Tag,
  IdCard,
  ArrowLeft,
  LogOut,
  Power,
  Wifi,
  Sparkles,
  Palette,
  QrCode,
  Database,
  Activity,
  Key
} from 'lucide-react';
import { cn } from '../lib/utils';

import { useStore } from '../store';

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export type Tab = 'empresa' | 'cupons' | 'seguranca' | 'usuarios' | 'cracha' | 'rede' | 'temas' | 'qrcode' | 'backup' | 'adm' | 'impressoras';

export interface SettingsTabConfig {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  module: string;
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: 'empresa' as Tab, label: 'Empresa', icon: Building2, desc: 'Dados cadastrais e CNPJ', module: 'Ajustes' },
  { id: 'impressoras' as Tab, label: 'Central de Impressoras', icon: Printer, desc: 'Gerência de impressoras, papéis, margens e mapeamento', module: 'Ajustes' },
  { id: 'cupons' as Tab, label: 'Cupons e Etiquetas', icon: Tag, desc: 'Layouts de impressão e mensagens', module: 'Ajustes' },
  { id: 'temas' as Tab, label: 'Temas', icon: Palette, desc: 'Cadastro global de temas visuais', module: 'Ajustes' },
  { id: 'seguranca' as Tab, label: 'Segurança', icon: ShieldCheck, desc: 'Senhas, backups, sincronização e manutenção', module: 'Ajustes' },
  { id: 'usuarios' as Tab, label: 'Usuários e Funções', icon: Users, desc: 'Gestão de acessos e permissões', module: 'Usuários e Funções' },
  { id: 'cracha' as Tab, label: 'Crachá de Acesso', icon: IdCard, desc: 'Gerador de crachás de acesso profissionais', module: 'Crachá' },
  { id: 'qrcode' as Tab, label: 'Identificação QR Code', icon: QrCode, desc: 'Consulta e identificação de QR Codes', module: 'Ajustes' },
];

export default function SettingsDrawer({ isOpen, onClose }: SettingsDrawerProps) {
  const activeSettingModule = useStore((state) => state.activeSettingModule);
  const setActiveSettingModule = useStore((state) => state.setActiveSettingModule);
  const checkPermission = useStore((state) => state.checkPermission);

  const logoutLocal = useStore((state) => state.logoutLocal);

  const tabs = SETTINGS_TABS.filter(tab => checkPermission(tab.module, 'acessar'));

  const handleTabClick = (tabId: Tab) => {
    setActiveSettingModule(tabId);
    // Always close when a tab is clicked
    onClose();
  };

  const handleClose = () => {
    // We only close the drawer navigation, but keep the module active
    onClose();
  };

  const handleLogout = () => {
    // Definitive immediate logout without blocking dialogs
    logoutLocal();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay for outside click closing */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={cn(
              "fixed inset-0 bg-black/60 backdrop-blur-sm z-[39]",
              activeSettingModule && "md:hidden"
            )}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.1 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 80) {
                onClose();
              }
            }}
            className="fixed top-0 md:top-14 right-0 bottom-0 md:bottom-8 w-full md:max-w-[360px] bg-[#0A0A0A]/95 backdrop-blur-xl border-l border-white/5 z-[40] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] touch-pan-y"
          >
            {/* Header */}
            <div className="h-16 md:h-14 flex items-center justify-between px-6 border-b border-white/5 shrink-0 bg-white/2">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                  <Settings className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Configurações</h2>
              </div>
              <button 
                onClick={handleClose}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Fechar Ajustes"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Area - Navigation items only */}
            <div className="flex-1 p-5 overflow-y-auto custom-scrollbar bg-gradient-to-br from-transparent to-white/[0.02] flex flex-col">
              <div className="space-y-1 flex-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 p-2.5 border rounded-lg transition-all group",
                      activeSettingModule === tab.id 
                        ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_-5px_rgba(16,185,129,0.2)]" 
                        : "bg-white/5 hover:bg-white/10 border-white/5"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors shrink-0",
                      activeSettingModule === tab.id ? "bg-emerald-500/20" : "bg-white/5 group-hover:bg-emerald-500/10"
                    )}>
                      <tab.icon className={cn(
                        "w-3.5 h-3.5 transition-all",
                        activeSettingModule === tab.id ? "text-emerald-500 scale-110" : "text-white/40 group-hover:text-emerald-500 group-hover:scale-110"
                      )} />
                    </div>
                    <span className={cn(
                      "text-[10px] font-black transition-colors uppercase tracking-widest",
                      activeSettingModule === tab.id ? "text-emerald-400" : "text-white group-hover:text-emerald-400"
                    )}>{tab.label}</span>
                    {activeSettingModule === tab.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 ml-auto shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Logout Button */}
              <div className="mt-6 pt-6 border-t border-white/5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 p-3 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl transition-all group active:scale-[0.98]"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                    <Power className="w-4 h-4 text-red-500 group-hover:scale-110 transition-transform" />
                  </div>
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Encerrar Sessão</span>
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
