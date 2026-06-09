import { MODULES } from '../modules';
import ModuleCard from '../components/ModuleCard';
import { motion } from 'motion/react';
import { useStore } from '../store';
import { Building2, LogOut, Sparkles, ShieldAlert } from 'lucide-react';
import { useEffect } from 'react';
import { perfLogger } from '../utils/perfLogger';

export default function Home() {
  useEffect(() => {
    const label = 'Navegação para o menu Início';
    if (perfLogger.hasStarted(label)) {
      perfLogger.end(label);
    }
  }, []);

  perfLogger.logRender('Página Inicial');

  const isCashierOpen = useStore((state) => !!state.currentCashier);
  const checkPermission = useStore((state) => state.checkPermission);
  const company = useStore((state) => state.company);
  const currentUser = useStore((state) => state.currentUser);
  const userRoles = useStore((state) => state.userRoles);
  const logoutLocal = useStore((state) => state.logoutLocal);

  const isLimitedUser = currentUser ? (!currentUser.isAdmin && !currentUser.isOwner && !currentUser.isMasterAdmin && currentUser.roleId !== 'admin' && currentUser.roleId !== 'administrador') : false;
  const userRoleName = currentUser ? (userRoles.find(r => r.id === currentUser.roleId)?.name || 'Colaborador') : 'Colaborador';

  const allowedModules = MODULES.filter(m => m.id !== 'rede' && checkPermission(m.name, 'acessar'));

  // Render a clean, mobile-optimized Work Menu / Meus Acessos for limited users
  if (isLimitedUser) {
    return (
      <div className="h-full flex flex-col justify-start py-8 px-4 overflow-y-auto bg-black custom-scrollbar select-none">
        {/* Work Menu Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-xl mx-auto mb-6 p-4 md:p-5 bg-[#121212] border border-white/5 rounded-3xl flex items-center justify-between shadow-xl"
        >
          <div className="flex items-center gap-3">
            {company.logo ? (
              <div className="w-10 h-10 bg-black/40 p-2 rounded-xl border border-white/10 flex items-center justify-center shrink-0">
                <img 
                  src={company.logo} 
                  alt={company.name} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-emerald-500" />
              </div>
            )}
            <div className="text-left">
              <p className="text-[8px] text-white/30 uppercase font-bold tracking-widest leading-none mb-1">Painel Operacional</p>
              <h2 className="text-sm font-black text-white uppercase tracking-tight">{currentUser?.fullName || currentUser?.login}</h2>
              <span className="inline-block text-[8px] bg-[#16c784]/10 text-[#16c784] font-bold uppercase px-2 py-0.5 rounded mt-1 border border-[#16c784]/20 tracking-wider">
                {userRoleName}
              </span>
            </div>
          </div>

          <button
            onClick={() => logoutLocal()}
            className="p-2.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 rounded-2xl transition-all active:scale-95"
            title="Sair da Conta"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Section Divider */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="w-full max-w-xl mx-auto mb-4 px-1 flex items-center justify-between"
        >
          <div className="flex items-center gap-1.5 text-white/40">
            <Sparkles className="w-3.5 h-3.5 text-[#16c784]" />
            <span className="text-[9px] uppercase font-black tracking-[0.2em]">MEUS ACESSOS</span>
          </div>
          <span className="text-[8px] uppercase font-bold font-mono tracking-wide text-white/30">
            {allowedModules.length} {allowedModules.length === 1 ? 'MÓDULO LIBERADO' : 'MÓDULOS LIBERADOS'}
          </span>
        </motion.div>

        {/* Module grid with tactile touch targets */}
        <div className="w-full max-w-xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allowedModules.map((module, index) => {
            let displayName = module.name;
            if (module.id === 'abrir-caixa') {
              displayName = isCashierOpen ? 'Fechar Caixa' : 'Abrir Caixa';
            } else if (module.id === 'pdv') {
              displayName = 'Vender';
            }

            return (
              <ModuleCard
                key={module.id}
                index={index}
                name={displayName}
                icon={module.icon}
                path={module.path}
                category={module.category}
              />
            );
          })}
        </div>

        {/* Empty State */}
        {allowedModules.length === 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xl mx-auto p-8 bg-amber-500/5 border border-amber-500/10 rounded-3xl text-center space-y-4"
          >
            <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-xs font-black text-white uppercase tracking-widest">Sem Permissões Ativas</h3>
              <p className="text-[9px] font-medium text-white/40 uppercase tracking-tight leading-relaxed max-w-xs mx-auto">
                Você não possui nenhum módulo liberado no momento. Solicite as permissões operacionais ao seu administrador.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex flex-col items-center py-6 px-4 overflow-y-auto select-none scrollbar-hide">
      <div className="my-auto w-full flex flex-col items-center py-4">
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="mb-8 flex flex-col items-center text-center gap-3"
        >
          {/* Company Logo Display Container */}
          {company.logo ? (
            <div className="w-16 h-16 bg-[#161616] p-2.5 rounded-2xl border border-white/10 flex items-center justify-center shadow-lg hover:border-[#16c784]/30 transition-all">
              <img 
                src={company.logo} 
                alt={company.name} 
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-14 h-14 bg-[#16c784]/10 border border-[#16c784]/20 rounded-2xl flex items-center justify-center shadow-md">
              <Building2 className="w-6 h-6 text-[#16c784]" />
            </div>
          )}

          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight leading-none mb-1.5">
              {company.name}
            </h1>
            {company.slogan ? (
              <p className="text-[#16c784] text-[9px] uppercase font-bold tracking-[0.2em] max-w-lg mx-auto">
                {company.slogan}
              </p>
            ) : (
              <p className="text-slate-500 text-[8px] uppercase font-bold tracking-[0.3em]">
                Painel Operacional Integrado
              </p>
            )}
          </div>
        </motion.div>

        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 w-full max-w-6xl">
          {allowedModules.map((module, index) => {
            let displayName = module.name;
            if (module.id === 'abrir-caixa') {
              displayName = isCashierOpen ? 'Fechar Caixa' : 'Abrir Caixa';
            } else if (module.id === 'pdv') {
              displayName = 'Vender';
            }

            return (
              <ModuleCard
                key={module.id}
                index={index}
                name={displayName}
                icon={module.icon}
                path={module.path}
                category={module.category}
              />
            );
          })}
        </div>

        <div className="mt-8 w-full max-w-4xl opacity-20">
          <div className="flex items-center gap-4">
            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/20" />
            <div className="text-[8px] uppercase font-black tracking-[0.5em] text-white/40 whitespace-nowrap">
              Integrated Enterprise Solution
            </div>
            <div className="h-[1px] flex-1 bg-[#121212]/30 mt-px" />
          </div>
        </div>
      </div>
    </div>
  );
}
