import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LockKeyholeOpen, LockKeyhole, X, Wallet, CircleDollarSign, CreditCard, Banknote, FileText, QrCode, Plus, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store';
import { feedback } from '../lib/feedback';
import MasterPasswordModal from '../components/MasterPasswordModal';

export default function CashierModule() {
  const currentCashier = useStore((state) => state.currentCashier);
  const openCashier = useStore((state) => state.openCashier);
  const closeCashier = useStore((state) => state.closeCashier);
  const paymentMethods = useStore((state) => state.paymentMethods);
  const currentUser = useStore((state) => state.currentUser);
  
  const navigate = useNavigate();
  const location = useLocation();
  const [showModal, setShowModal] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [notes, setNotes] = useState('');
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);

  // States and Handlers for Suprimento / Sangria Operations
  const [opModalType, setOpModalType] = useState<'suprimento' | 'sangria' | null>(null);
  const [opAmountInput, setOpAmountInput] = useState('');
  const [opNotes, setOpNotes] = useState('');

  // Safe UI Toast Notification system
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const isOpen = !!currentCashier;

  // Auto-open opening modal when cashier is closed, making the workflow fast and seamless
  useEffect(() => {
    if (!isOpen) {
      setShowModal(true);
    }
  }, [isOpen]);

  const handleCancelOpening = () => {
    setShowModal(false);
    // Safe redirect to main menu (preventing page layout from being locked up)
    navigate('/');
  };

  const showAlert = (message: string, type: 'success' | 'error' | 'warning' = 'warning') => {
    if (type === 'success') {
      feedback.success();
    } else if (type === 'error') {
      feedback.error();
    }
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => prev?.message === message ? null : prev);
    }, 4500);
  };

  const handleOpenOpModal = (type: 'suprimento' | 'sangria') => {
    setOpModalType(type);
    setOpAmountInput('');
    setOpNotes('');
  };

  const handleConfirmOp = () => {
    const val = parseFloat(opAmountInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      showAlert('Informe um valor válido maior que zero.', 'error');
      return;
    }

    const pmList = useStore.getState().paymentMethods;
    const addTransaction = useStore.getState().addTransaction;
    const cashPm = pmList.find(m => m.type === 'money');

    if (opModalType === 'sangria' && val > (currentCashier!.openingBalance + currentCashier!.totalSales)) {
      showAlert('Valor de sangria maior do que o total disponível em caixa!', 'error');
      return;
    }

    addTransaction({
      type: opModalType === 'suprimento' ? 'entrada' : 'saida',
      category: opModalType === 'suprimento' ? 'Suprimento' : 'Sangria',
      description: `${opModalType === 'suprimento' ? 'Reforço' : 'Sangria'} de Caixa - Sessão #${currentCashier!.id.substring(0, 4)}`,
      value: val,
      paymentMethodId: cashPm?.id || '',
      paymentMethodName: cashPm?.name || 'Dinheiro',
      status: 'pago',
      origin: 'caixa',
      originId: currentCashier!.id,
      notes: opNotes
    });

    const successMsg = `${opModalType === 'suprimento' ? 'Reforço (Suprimento)' : 'Sangria (Retirada)'} de R$ ${val.toFixed(2)} lançado com sucesso!`;
    setOpModalType(null);
    showAlert(successMsg, 'success');
  };

  const handleToggleCaixa = () => {
    setAmountInput('');
    setNotes('');
    setShowModal(true);
  };

  const confirmAction = () => {
    const val = parseFloat(amountInput.replace(',', '.'));
    if (isNaN(val) || val < 0) {
      showAlert('Informe um valor válido.', 'error');
      return;
    }

    if (!isOpen) {
      openCashier(val, currentUser?.fullName || 'Administrator');
      
      // If we came from another module (like PDV), go back there; otherwise go to Home page /
      const from = (location.state as any)?.from;
      if (from) {
        navigate(from, { replace: true });
      } else {
        navigate('/');
      }
      setShowModal(false);
    } else {
      const masterPassword = useStore.getState().masterPassword;
      if (!masterPassword) {
        showAlert('Cadastre uma Senha Mestre em Ajustes > Segurança antes de fechar o caixa.', 'warning');
        return;
      }
      setIsMasterPasswordModalOpen(true);
    }
  };

  const handleMasterPasswordConfirm = async () => {
    const val = parseFloat(amountInput.replace(',', '.'));
    closeCashier(val, currentUser?.fullName || 'Administrator', notes);
    
    // Retrieve the closed cashier session safely from history
    const cashierHistory = useStore.getState().cashierHistory;
    const closedSession = cashierHistory[0];
    
    if (closedSession) {
      try {
        const companyState = useStore.getState().company;
        const diff = (closedSession.actualClosingBalance || 0) - (closedSession.expectedClosingBalance || 0);
        
        // List payment methods totals as items
        const items = Object.entries(closedSession.paymentMethodTotals).map(([methodId, total]) => {
          const pm = paymentMethods.find(p => p.id === methodId);
          const pmName = pm ? pm.name : methodId.toUpperCase();
          return {
            code: `PM-${methodId.substring(0, 3).toUpperCase()}`,
            description: `Vendas em ${pmName}`,
            qty: 1,
            price: total,
            total
          };
        });

        // Add opening balance
        items.unshift({
          code: 'SLD-ABERT',
          description: 'Saldo de Abertura (Fundo de Caixa)',
          qty: 1,
          price: closedSession.openingBalance,
          total: closedSession.openingBalance
        });

        if (diff !== 0) {
          items.push({
            code: 'SLD-DIFER',
            description: diff > 0 ? 'Diferença Positiva (Sobra)' : 'Ajuste Negativo (Quebra)',
            qty: 1,
            price: diff,
            total: diff
          });
        }

        const closingPayload = {
          orderId: `FECH-${closedSession.id}`,
          orderNumber: `FC-${closedSession.id.substring(0, 6).toUpperCase()}`,
          date: new Date(closedSession.closingTime || Date.now()).toLocaleString(),
          operator: closedSession.closedBy || 'Supervisor',
          client: {
            name: 'COMPROVANTE DE FECHAMENTO',
            phone: 'N/A',
            document: 'RELATORIO FINANCEIRO'
          },
          items,
          financial: {
            subtotal: closedSession.totalSales,
            discount: 0,
            deliveryFee: 0,
            surcharge: 0,
            total: closedSession.actualClosingBalance || 0,
            paymentMethod: 'FECHAMENTO',
            receivedAmount: closedSession.actualClosingBalance || 0,
            changeAmount: 0
          },
          companyName: companyState?.name || "Lukasfe Industrial Ltda",
          companyCnpj: companyState?.document || "00.000.000/0001-00",
          companyAddress: companyState?.address ? `${companyState.address.street || ''}, ${companyState.address.number || ''}` : "Praça da Sé, 100",
          companyPhone: companyState?.phone || "",
          notes: closedSession.notes || "Fechamento regular do caixa operacional."
        };

        console.log(`[PRINT_DIAG][BUTTON] Comprovante de Fechamento de Caixa (Função desativada para reconstrução futura) para o caixa #${closedSession.id}`);
      } catch (err: any) {
        console.error('[PRINT_QUEUE_DIAGNOSTIC] Erro em CashierModule:', err);
      }
    }

    setIsMasterPasswordModalOpen(false);
    setShowModal(false);
    showAlert('Caixa fechado com sucesso.', 'success');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
      <div className="flex flex-col md:flex-row items-stretch justify-center gap-6 max-w-4xl w-full">
        {/* Main Status Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 bg-[#121212] border border-white/5 rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden flex flex-col justify-between"
        >
          <div>
            <div className={cn(
              "absolute top-0 left-0 w-full h-1 transition-colors duration-500",
              isOpen ? "bg-emerald-500" : "bg-red-500"
            )} />
            
            <div className={cn(
              "w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-500",
              isOpen ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
            )}>
              {isOpen ? <LockKeyholeOpen className="w-10 h-10" /> : <LockKeyhole className="w-10 h-10" />}
            </div>

            <h2 className="text-2xl font-light text-white mb-1">
              Status do Caixa
            </h2>
            <div className={cn(
              "text-[10px] uppercase font-black tracking-[0.3em] mb-8",
              isOpen ? "text-emerald-400" : "text-red-400"
            )}>
              {isOpen ? "Caixa em Operação" : "Caixa Fechado"}
            </div>
          </div>

          <button
            onClick={handleToggleCaixa}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-sm uppercase tracking-widest transition-all cursor-pointer",
              isOpen 
                ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-black"
            )}
          >
            {isOpen ? "Fechar Caixa" : "Abrir Caixa"}
          </button>
        </motion.div>

        {/* Operations preview and additions when open */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1 bg-[#121212] border border-white/5 rounded-2xl p-6 shadow-2xl flex flex-col justify-between space-y-6"
          >
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-tighter flex items-center gap-2">
                <CircleDollarSign className="w-5 h-5 text-emerald-500" /> Operações de Caixa
              </h3>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">Lançamentos da sessão atual</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-white/5 rounded-xl text-center">
                <span className="block text-[8px] uppercase text-white/30 font-black mb-1">Abertura</span>
                <span className="text-sm font-mono font-bold text-white">R$ {currentCashier.openingBalance.toFixed(2)}</span>
              </div>
              <div className="p-3 bg-white/5 rounded-xl text-center">
                <span className="block text-[8px] uppercase text-white/30 font-black mb-1">Movimentações</span>
                <span className={cn("text-sm font-mono font-bold", currentCashier.totalSales >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  R$ {currentCashier.totalSales.toFixed(2)}
                </span>
              </div>
              <div className="col-span-2 p-3 bg-black/40 border border-white/5 rounded-xl text-center">
                <span className="block text-[8px] uppercase text-white/30 font-black mb-1">Saldo Estimado na Gaveta</span>
                <span className="text-base font-mono font-black text-emerald-400">
                  R$ {(currentCashier.openingBalance + currentCashier.totalSales).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => handleOpenOpModal('suprimento')}
                className="py-3.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black border border-emerald-500/20 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Adicionar troco ou reforço ao caixa"
              >
                <Plus className="w-4 h-4" /> Suprimento
              </button>
              <button
                onClick={() => handleOpenOpModal('sangria')}
                className="py-3.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Retirar dinheiro do caixa"
              >
                <Minus className="w-4 h-4" /> Sangria
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md z-0"
              onClick={() => !isOpen ? handleCancelOpening() : setShowModal(false)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative z-10 w-full max-w-md bg-[#181818] border border-white/10 rounded-2xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-medium text-white">
                  {isOpen ? "Resumo do Fechamento" : "Abertura de Caixa"}
                </h3>
                <button onClick={() => !isOpen ? handleCancelOpening() : setShowModal(false)} className="text-white/30 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!isOpen ? (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] uppercase font-black text-white/40 tracking-widest mb-2">
                      Valor de Abertura (Troco Inicial)
                    </label>
                    <div className="relative">
                      <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                      <input 
                        type="text" 
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && confirmAction()}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white font-mono text-lg focus:border-emerald-500/50 outline-none"
                        placeholder="0,00"
                        autoFocus
                      />
                    </div>
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={handleCancelOpening}
                      className="flex-1 py-3 text-[10px] uppercase font-black text-white/30 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmAction}
                      className="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-emerald-400 transition-colors"
                    >
                      Confirmar Abertura
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white/5 rounded-xl">
                      <span className="block text-[8px] uppercase text-white/30 font-black mb-1">Inicial</span>
                      <span className="text-sm font-mono tracking-tight text-white/60">R$ {currentCashier.openingBalance.toFixed(2)}</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <span className="block text-[8px] uppercase text-white/30 font-black mb-1">Vendas</span>
                      <span className="text-sm font-mono tracking-tight text-emerald-400">R$ {currentCashier.totalSales.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(currentCashier.paymentMethodTotals).map(([methodId, total]) => {
                      const method = paymentMethods.find(m => m.id === methodId);
                      if (total === 0) return null;
                      return (
                        <div key={methodId} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center">
                              {method?.type === 'money' ? <Banknote className="w-3.5 h-3.5 text-emerald-400" /> : 
                               method?.type === 'pix' ? <QrCode className="w-3.5 h-3.5 text-cyan-400" /> : 
                               <CreditCard className="w-3.5 h-3.5 text-purple-400" />}
                            </div>
                            <span className="text-xs text-white/60">{method?.name || 'Método Removido'}</span>
                          </div>
                          <span className="text-xs font-mono text-white/80">R$ {total.toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl mt-4 border border-white/5">
                      <span className="text-[10px] uppercase font-black text-white/50">Valor Total Médio Esperado</span>
                      <span className="text-lg font-mono text-emerald-400">R$ {(currentCashier.openingBalance + currentCashier.totalSales).toFixed(2)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-black text-white/40 tracking-widest mb-2">
                      Valor Contado (Para conferência)
                    </label>
                    <input 
                      type="text" 
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmAction()}
                      className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 text-white font-mono text-sm focus:border-red-500/50 outline-none"
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-black text-white/40 tracking-widest mb-2">
                      Observação (Opcional)
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-4 w-4 h-4 text-white/20" />
                      <textarea 
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-xs focus:border-red-500/50 outline-none min-h-[60px]"
                        placeholder="Anotações sobre o dia..."
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowModal(false)}
                      className="flex-1 py-3 text-[10px] uppercase font-black text-white/30 hover:text-white transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={confirmAction}
                      className="flex-1 py-3 bg-red-500 text-white rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-red-400 transition-colors shadow-lg shadow-red-500/20"
                    >
                      Confirmar Fechamento
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MasterPasswordModal 
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handleMasterPasswordConfirm}
        description="Autorização gerencial necessária para fechar o caixa e consolidar valores."
        autoStartScanner={true}
      />

      {/* Suprimento / Sangria Overlay Modal */}
      <AnimatePresence>
        {opModalType && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <div 
              className="absolute inset-0 cursor-pointer"
              onClick={() => setOpModalType(null)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-[#181818] border border-white/10 rounded-2xl p-6 shadow-2xl z-10"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-tight flex items-center gap-2 font-black">
                  {opModalType === 'suprimento' ? (
                    <><Plus className="w-4 h-4 text-emerald-500" /> Lançar Suprimento</>
                  ) : (
                    <><Minus className="w-4 h-4 text-red-500" /> Lançar Sangria</>
                  )}
                </h3>
                <button onClick={() => setOpModalType(null)} className="text-white/30 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/5">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-white/40 tracking-widest mb-2">
                    Valor (R$)
                  </label>
                  <div className="relative">
                    <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input 
                      type="text" 
                      value={opAmountInput}
                      onChange={(e) => setOpAmountInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleConfirmOp()}
                      className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white font-mono text-lg focus:border-emerald-500/50 outline-none"
                      placeholder="0,00"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-black text-white/40 tracking-widest mb-2">
                    Observação / Motivo (Opcional)
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-4 w-4 h-4 text-white/20" />
                    <textarea 
                      value={opNotes}
                      onChange={(e) => setOpNotes(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white text-xs focus:border-emerald-500/50 outline-none min-h-[60px]"
                      placeholder={opModalType === 'suprimento' ? 'Ex: Troco inicial extra...' : 'Ex: Recolhimento de valores excedentes...'}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setOpModalType(null)}
                    className="flex-1 py-3 text-[10px] uppercase font-black text-white/30 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleConfirmOp}
                    className="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-[10px] uppercase font-black tracking-widest hover:bg-emerald-400 transition-colors cursor-pointer font-bold animate-pulse"
                  >
                    Confirmar Lançamento
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Toast Notification Panel to prevent browser dialogue locks */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[200] max-w-sm w-full bg-[#161616] border border-white/10 rounded-2xl p-4 shadow-2xl flex items-start gap-3"
          >
            <div className={cn(
              "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs",
              toast.type === 'success' && "bg-emerald-500/10 text-emerald-400",
              toast.type === 'error' && "bg-red-500/10 text-red-500",
              toast.type === 'warning' && "bg-amber-500/10 text-amber-500"
            )}>
              {toast.type === 'success' && "✓"}
              {toast.type === 'error' && "✗"}
              {toast.type === 'warning' && "⚠"}
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-white leading-normal uppercase tracking-wider">
                {toast.message}
              </p>
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-white/20 hover:text-white/60 transition-colors cursor-pointer text-xs font-bold leading-none"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

