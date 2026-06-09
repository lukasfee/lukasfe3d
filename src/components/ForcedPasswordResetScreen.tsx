import React, { useState } from 'react';
import { useStore } from '../store';
import { motion } from 'motion/react';
import { Lock, ShieldAlert, Key, Check } from 'lucide-react';

export default function ForcedPasswordResetScreen() {
  const currentUser = useStore((state) => state.currentUser);
  const updateUser = useStore((state) => state.updateUser);
  const logAction = useStore((state) => state.logAction);
  
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const pass = newPassword.trim();
    const conf = confirmPassword.trim();

    if (!pass || !conf) {
      setErrorMsg('Por favor, preencha todos os campos de senha.');
      return;
    }

    if (pass === '1234') {
      setErrorMsg('A nova senha não pode ser a senha padrão "1234". Escolha uma senha mais forte.');
      return;
    }

    if (pass.length < 6) {
      setErrorMsg('A nova senha deve possuir pelo menos 6 caracteres para garantir a segurança da produção.');
      return;
    }

    if (pass !== conf) {
      setErrorMsg('As senhas digitadas não coincidem.');
      return;
    }

    if (!currentUser) {
      setErrorMsg('Usuário atual não identificado na sessão.');
      return;
    }

    // Update both the admin principal in storage & current session
    updateUser(currentUser.id, { password: pass });
    
    // Register complete audit log requested:
    logAction({
      module: 'Segurança',
      actionType: 'update',
      action: 'Troca de Senha Obrigatória',
      description: `Alteração compulsória da senha inicial realizada com sucesso para o Administrador Principal (Matrícula: admin) no terminal de governança.`,
      status: 'sucesso',
      riskLevel: 'médio',
      entityId: currentUser.id
    });

    setSuccess(true);
    
    // Success, will unmount as soon as Zustand status is retrieved in App
    setTimeout(() => {
      // Small force-updater or window refresh to ensure robust session propagation
      window.location.reload();
    }, 1500);
  };

  return (
    <div className="min-h-[100vh] bg-[#090909] flex flex-col items-center justify-center p-4 select-none relative font-sans">
      {/* Visual neon radial background glows */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,_rgba(239,68,68,0.02),_transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:30px_30px] opacity-40 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="w-full max-w-md bg-[#121212] border border-red-500/10 rounded-[2.5rem] p-8 md:p-10 shadow-[0_0_50px_rgba(239,68,68,0.05)] relative z-10 space-y-6"
      >
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8 animate-pulse" />
          </div>
          
          <div className="space-y-1.5">
            <span className="text-[9px] text-red-400 font-black tracking-[0.3em] uppercase block font-mono">Governança &amp; Segurança</span>
            <h1 className="text-sm font-black text-white uppercase tracking-wider">Troca Obrigatória de Senha</h1>
            <p className="text-[10px] text-zinc-400 uppercase leading-relaxed max-w-sm mx-auto">
              Seu acesso administrativo principal está utilizando a senha padrão de fábrica <span className="font-mono text-amber-500 font-bold px-1 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded">1234</span>. Crie uma nova senha segura para continuar.
            </p>
          </div>
        </div>

        {success ? (
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col items-center justify-center space-y-3 text-center"
          >
            <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <p className="text-[10px] text-emerald-400 font-black uppercase tracking-wider">Senha Atualizada!</p>
            <p className="text-[9px] text-zinc-500 uppercase">A sessão do administrador foi consolidada. Recarregando a governança do ERP...</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-1.5">
              <label className="text-[8px] font-black font-mono text-zinc-400 uppercase tracking-widest block">OPERADOR INTEGRADO</label>
              <div className="w-full bg-[#181818] border border-white/5 rounded-xl px-4 py-3 font-mono text-[10px] text-zinc-500 flex justify-between items-center select-all">
                <span>MATRÍCULA: admin</span>
                <span className="text-emerald-500 font-black tracking-widest text-[8px] bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">ADMIN COMPULSÓRIO</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black font-mono text-zinc-400 uppercase tracking-widest block">NOVA SENHA SEGURA</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="DIGITE A NOVA SENHA"
                  className="w-full bg-black/50 border border-white/5 focus:border-red-500/40 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-zinc-700 font-bold focus:outline-none focus:ring-0 transition-all font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[8px] font-black font-mono text-zinc-400 uppercase tracking-widest block">CONFIRMAR NOVA SENHA</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="REPITA A SENHA"
                  className="w-full bg-black/50 border border-white/5 focus:border-red-500/40 rounded-xl pl-10 pr-4 py-3 text-xs text-white placeholder:text-zinc-700 font-bold focus:outline-none focus:ring-0 transition-all font-mono"
                />
              </div>
            </div>

            {errorMsg && (
              <p className="text-[9px] text-red-500 font-black uppercase text-center tracking-wider animate-pulse bg-red-500/5 px-2 py-1.5 rounded-lg border border-red-500/10">
                ⚠️ {errorMsg}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4" /> Atualizar e Blindar Acesso
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
