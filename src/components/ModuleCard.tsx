import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';

interface ModuleCardProps {
  key?: string;
  name: string;
  icon: any;
  path: string;
  category: string;
  index: number;
}

export default function ModuleCard({ name, icon: Icon, path, category, index }: ModuleCardProps) {
  const alerts = useStore((state) => state.alerts) || [];
  const activeCount = alerts.filter(a => a.status !== 'resolved').length;
  const criticalCount = alerts.filter(a => a.status !== 'resolved' && a.priority === 'high').length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.015, duration: 0.2 }}
      whileHover={{ y: -2, scale: 1.02 }}
      className="h-full"
    >
      <Link
        to={path}
        className={cn(
          "flex flex-col items-center justify-center p-2 h-full aspect-[4/3] group",
          "bg-[#121212] border border-white/5 rounded-lg transition-all",
          "hover:bg-[#181818] hover:border-emerald-500/40 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]",
          "relative overflow-hidden"
        )}
      >
        <div className="absolute top-1 right-1">
          <div className="w-1 h-1 rounded-full bg-emerald-500 opacity-10 group-hover:opacity-100 transition-opacity" />
        </div>

        {name === 'Central Operacional' && activeCount > 0 && (
          <div className="absolute top-1 left-1.5 flex items-center shrink-0 z-10">
            <span className={cn(
              "text-[7px] font-black px-1 py-0.5 rounded font-mono leading-none border scale-90 origin-top-left",
              criticalCount > 0 
                ? "bg-red-500/20 text-red-400 border-red-500/30 animate-pulse" 
                : "bg-amber-500/20 text-amber-400 border-amber-500/30"
            )}>
              {criticalCount > 0 ? `🔴 ${criticalCount}` : activeCount}
            </span>
          </div>
        )}
        
        <div className="p-2 mb-1.5 rounded-md bg-white/5 group-hover:bg-emerald-500 group-hover:text-black transition-all group-hover:shadow-[0_0_10px_rgba(16,185,129,0.5)]">
          <Icon className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
        </div>
        
        <div className="text-center w-full px-1">
          <span className="text-[9px] font-bold text-white/80 group-hover:text-white uppercase tracking-tight block truncate">
            {name}
          </span>
          <p className="text-[7px] uppercase text-white/10 font-black tracking-[0.2em] mt-0.5 group-hover:text-emerald-500/50 transition-colors truncate">
            {category}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
