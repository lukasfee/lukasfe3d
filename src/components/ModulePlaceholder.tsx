import { motion } from 'motion/react';

interface ModulePlaceholderProps {
  name: string;
}

export default function ModulePlaceholder({ name }: ModulePlaceholderProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] p-12 text-center"
    >
      <div className="max-w-md w-full">
        <div className="inline-block p-5 rounded-2xl bg-white/5 border border-white/10 mb-8 backdrop-blur-sm shadow-2xl">
          <svg className="w-12 h-12 text-emerald-500/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        </div>
        
        <h1 className="text-4xl font-light text-white mb-4 tracking-tight">
          Módulo: <span className="text-emerald-400 font-medium">{name}</span>
        </h1>
        
        <p className="text-slate-400 mb-12 leading-relaxed text-sm">
          Este espaço está reservado para a implementação do módulo selecionado no menu lateral. 
          Navegue entre as opções para visualizar as rotas criadas na estrutura Lukasfe ERP.
        </p>
        
        <div className="grid grid-cols-2 gap-4 text-left">
          <div className="p-4 border border-white/5 rounded-xl bg-[#121212] flex flex-col gap-1 shadow-inner">
            <span className="text-[10px] uppercase text-emerald-500 font-black tracking-widest">Status</span>
            <span className="text-sm text-white font-medium">Módulo em construção</span>
          </div>
          <div className="p-4 border border-white/5 rounded-xl bg-[#121212] flex flex-col gap-1 shadow-inner">
            <span className="text-[10px] uppercase text-blue-500 font-black tracking-widest">Próximo Passo</span>
            <span className="text-sm text-white font-medium">Definição de regras</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
