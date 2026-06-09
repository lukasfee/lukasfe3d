import { NavLink } from 'react-router-dom';
import { MODULES } from '../modules';
import { cn } from '../lib/utils';
import { Package2 } from 'lucide-react';
import { useStore } from '../store';

interface SidebarProps {
  className?: string;
}

export default function Sidebar({ className }: SidebarProps) {
  const checkPermission = useStore((state) => state.checkPermission);
  
  const totalActive = useStore((state) => 
    (state.alerts || []).filter((a: any) => a.status !== 'resolved').length
  );
  
  const criticalCount = useStore((state) => 
    (state.alerts || []).filter((a: any) => a.status !== 'resolved' && a.priority === 'high').length
  );
  
  const allowedModules = MODULES.filter(m => m.id !== 'rede' && checkPermission(m.name, 'acessar'));
  const categories = Array.from(new Set(allowedModules.map(m => m.category)));

  const currentUser = useStore((state) => state.currentUser);
  const userRoles = useStore((state) => state.userRoles);
  const userRoleName = currentUser ? (userRoles.find(r => r.id === currentUser.roleId)?.name || 'Colaborador') : 'Colaborador';

  return (
    <aside className={cn("flex flex-col h-screen border-r border-white/5 bg-[#121212] select-none", className)}>
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-black font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] shrink-0">
          Σ
        </div>
        <div className="overflow-hidden">
          <h2 className="font-bold text-white tracking-tight uppercase text-sm truncate">Nexa ERP</h2>
          <p className="text-[10px] text-white/30 uppercase font-black tracking-widest leading-none">Core</p>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
        <div className="space-y-6">
          {categories.map((category) => (
            <div key={category} className="space-y-3">
              <h3 className="px-2 text-[10px] font-black uppercase text-white/20 tracking-[0.2em]">
                {category}
              </h3>
              <div className="space-y-0.5">
                {allowedModules.filter(m => m.category === category).map((module) => (
                  <NavLink
                    key={module.id}
                    to={module.path}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2.5 px-2 py-1.5 rounded text-[11px] font-semibold transition-all group",
                      isActive 
                        ? "bg-white/5 text-emerald-400 shadow-[inset_0_0_10px_rgba(255,255,255,0.02)]" 
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <module.icon className={cn(
                      "w-3.5 h-3.5 transition-transform duration-300",
                      "group-hover:scale-110"
                    )} />
                    <span className="truncate">{module.name}</span>
                    {module.id === 'central-operacional' && totalActive > 0 && (
                      <span className={cn(
                        "ml-auto px-1.5 py-0.5 rounded text-[8px] font-bold font-mono tracking-tighter flex items-center shrink-0",
                        criticalCount > 0 
                          ? "bg-red-500/15 text-red-400 border border-red-500/20" 
                          : "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                      )}>
                        {criticalCount > 0 ? `🔴 ${criticalCount}` : totalActive}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="mt-auto p-4 border-t border-white/5 bg-[#0e0e0e] flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-[#16c784] font-black text-[10px] shrink-0">
            {(currentUser?.fullName || currentUser?.login || 'U')[0].toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0 text-left">
            <span className="text-[11px] font-bold text-white truncate leading-none mb-1">
              {currentUser?.fullName || currentUser?.login || 'Usuário'}
            </span>
            <span className="text-[8px] text-[#16c784] font-black uppercase tracking-wider">
              {userRoleName}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
