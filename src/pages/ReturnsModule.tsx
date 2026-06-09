import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RotateCcw, 
  Search, 
  Package, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle2, 
  ArrowLeft,
  X,
  History,
  FileText,
  Boxes,
  Minus,
  Plus,
  Camera,
  XCircle
} from 'lucide-react';
import { cn, extractOrderNumberFromScan } from '../lib/utils';
import { useStore, Sale, Product } from '../store';
import { roundMoney, safeAdd, safeMultiply, safeSubtract } from '../utils/money';
import MasterPasswordModal from '../components/MasterPasswordModal';
import QRScanner from '../components/QRScanner';

interface ReturnItem {
  productId: string;
  productName: string;
  quantity: number;
  maxQuantity: number;
}

export default function ReturnsModule() {
  const sales = useStore((state) => state.sales);
  const products = useStore((state) => state.products);
  const returns = useStore((state) => state.returns);
  const addReturn = useStore((state) => state.addReturn);
  const addActivity = useStore((state) => state.addActivity);
  const currentCashier = useStore((state) => state.currentCashier);
  const currentUser = useStore((state) => state.currentUser);
  const getAvailableCash = useStore((state) => state.getAvailableCash);
  const [orderQuery, setOrderQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [reason, setReason] = useState<'defeito' | 'desistencia' | 'errado' | 'troca' | 'outro'>('defeito');
  const [notes, setNotes] = useState('');
  const [returnToStock, setReturnToStock] = useState(true);
  const [refundViaCashierMoney, setRefundViaCashierMoney] = useState(false);
  const [forceInsufficientCash, setForceInsufficientCash] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'aguardando_separacao': 'Aguardando Separação',
      'enviado_separacao': 'Enviado para Separação',
      'em_separacao': 'Em Separação',
      'separado': 'Separado',
      'embalando': 'Embalando',
      'em_rota': 'Em Rota',
      'entregue': 'Entregue',
      'cancelado': 'Cancelado',
      'finalizado': 'Finalizado',
      'problema': 'Com Problema',
      'atrasado': 'Atrasado',
      'retirado': 'Retirado'
    };
    return labels[status] || status;
  };

  const handleSearchOrder = (e?: React.FormEvent, manualValue?: string) => {
    if (e) e.preventDefault();
    const rawValue = manualValue || orderQuery;
    if (!rawValue) return;
    
    const searchValue = extractOrderNumberFromScan(rawValue);
    
    if (!searchValue) {
      setErrorMsg("QR Code ou número inválido.");
      return;
    }
    
    setErrorMsg(null);
    const sale = sales.find(s => String(s.orderNumber) === String(searchValue) || s.id === searchValue);
    
    if (sale) {
      if (sale.status === 'cancelado') {
        setErrorMsg("Pedido cancelado. Não é possível realizar devolução.");
        return;
      }

      const allowedStatuses = ['entregue', 'finalizado'];
      if (!allowedStatuses.includes(sale.status)) {
        const statusLabel = getStatusLabel(sale.status);
        setErrorMsg(`Este pedido ainda não foi finalizado/entregue e não pode ter devolução.\nStatus atual: ${statusLabel}`);
        return;
      }

      setSelectedSale(sale);
      setReturnItems([]);
      setOrderQuery('');
    } else {
      setErrorMsg("Pedido não encontrado.");
    }
  };

  const toggleItem = (productId: string, productName: string, soldQty: number, availableToReturn: number) => {
    if (availableToReturn <= 0) return;
    setReturnItems(prev => {
      const exists = prev.find(i => i.productId === productId);
      if (exists) {
        return prev.filter(i => i.productId !== productId);
      }
      return [...prev, { productId, productName, quantity: 1, maxQuantity: availableToReturn }];
    });
  };

  const updateItemQty = (productId: string, delta: number, availableToReturn: number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.productId === productId) {
        const nextQty = Math.max(1, Math.min(availableToReturn, item.quantity + delta));
        return { ...item, quantity: nextQty };
      }
      return item;
    }));
  };

  const handleConfirmReturn = () => {
    if (!selectedSale || returnItems.length === 0) return;

    // Validate each selected return item quantity has sufficient balance
    for (const item of returnItems) {
      const soldItem = selectedSale.items.find(si => si.id === item.productId);
      if (!soldItem) continue;

      const returnedQty = (returns || []).filter(r => r.saleId === selectedSale.id && r.productId === item.productId).reduce((sum, r) => sum + r.quantity, 0);
      const availableToReturn = soldItem.quantity - returnedQty;

      if (item.quantity > availableToReturn) {
        setErrorMsg(`Quantidade inválida para o produto "${item.productName}": este item já teve devoluções anteriores e não possui saldo suficiente para nova devolução.`);
        return;
      }
    }

    if (refundViaCashierMoney && currentCashier) {
      const availableCash = getAvailableCash();
      const totalRefundVal = returnItems.reduce((acc, item) => {
        const product = products.find(p => p.id === item.productId);
        return safeAdd(acc, safeMultiply(product?.price || 0, item.quantity));
      }, 0);

      if (totalRefundVal > availableCash && !forceInsufficientCash) {
        setErrorMsg(`Bloqueado: Saldo em dinheiro insuficiente no caixa (Disponível: R$ ${availableCash.toFixed(2)} | Requerido: R$ ${totalRefundVal.toFixed(2)}). Ative a confirmação de força gerencial para autorizar registrar a devolução.`);
        return;
      }
    }

    setErrorMsg(null);
    setIsMasterPasswordModalOpen(true);
  };

  const handlePasswordConfirmed = () => {
    setIsMasterPasswordModalOpen(false);
    if (!selectedSale) return;

    try {
      // First, do a strict dry-run validation for ALL items to prevent partial saves if something goes wrong
      for (const item of returnItems) {
        const soldItem = selectedSale.items.find(si => si.id === item.productId);
        if (!soldItem) {
          throw new Error(`Item ${item.productName} não encontrado na venda original.`);
        }
        const returnedQty = (returns || []).filter(r => r.saleId === selectedSale.id && r.productId === item.productId).reduce((sum, r) => sum + r.quantity, 0);
        const availableToReturn = soldItem.quantity - returnedQty;
        if (item.quantity > availableToReturn) {
          throw new Error(`Quantidade inválida para o produto "${item.productName}": este item já teve devoluções anteriores e não possui saldo suficiente para nova devolução.`);
        }
      }

      // If dry-run passes, execute the additions
      returnItems.forEach(item => {
        addReturn({
          saleId: selectedSale.id,
          orderNumber: selectedSale.orderNumber,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          reason,
          notes: forceInsufficientCash 
            ? `[VALOR FORÇADO MAIOR QUE SALDO EM CAIXA] ${notes}`
            : notes,
          returnToStock,
          refundViaCashierMoney,
          cashierId: currentCashier?.id,
          operator: currentUser?.fullName || 'Administrator'
        }, currentUser?.fullName || 'Administrator');
      });

      setSuccess(true);
      setForceInsufficientCash(false);
      setTimeout(() => {
        setSuccess(false);
        setSelectedSale(null);
        setReturnItems([]);
        setOrderQuery('');
        setNotes('');
      }, 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Erro ao processar devolução.");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {!selectedSale ? (
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="bg-[#121212] border border-white/5 rounded-3xl p-10 text-center space-y-8"
        >
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
            <Search className="w-8 h-8 text-white/20" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-white font-bold uppercase tracking-widest text-sm">Buscar Pedido para Devolução</h3>
            <p className="text-[10px] text-white/20 font-black uppercase tracking-tighter">Informe o número do pedido ou ID da venda</p>
          </div>

          <form onSubmit={handleSearchOrder} className="max-w-md mx-auto relative space-y-4">
            <div className="relative group">
              <input 
                type="text"
                placeholder="Ex: 0001"
                value={orderQuery}
                onChange={(e) => {
                  setOrderQuery(e.target.value);
                  setErrorMsg(null);
                }}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-lg font-mono focus:outline-none focus:border-orange-500/50 transition-all text-center"
                autoFocus
              />
              <button 
                type="button"
                onClick={() => setShowScanner(true)}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/5 hover:bg-orange-500/10 text-white/20 hover:text-orange-500 rounded-xl transition-all"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-left"
              >
                <XCircle className="w-4 h-4 shrink-0" />
                <p className="text-[10px] font-bold leading-tight whitespace-pre-line">{errorMsg}</p>
              </motion.div>
            )}

            <button 
              type="submit"
              className="w-full py-4 bg-white text-black font-black uppercase text-xs rounded-2xl hover:bg-slate-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            >
              Consultar Pedido
            </button>
          </form>

          <AnimatePresence>
            {showScanner && (
              <QRScanner 
                onScan={(val) => {
                  const cleaned = extractOrderNumberFromScan(val);
                  setOrderQuery(cleaned);
                  handleSearchOrder(undefined, cleaned);
                  setShowScanner(false);
                }}
                onClose={() => setShowScanner(false)}
                title="Escanear Pedido"
                description="Aponte para o QR Code do pedido para devolução"
              />
            )}
          </AnimatePresence>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            {/* Order Details */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden"
            >
              <div className="p-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedSale(null)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Pedido #{selectedSale.orderNumber}</span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[8px] font-black uppercase cursor-default">PAGO</span>
              </div>

              <div className="p-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4">Selecione os itens para devolver</h4>
                <div className="space-y-1">
                  {selectedSale.items.map((item) => {
                    const returnedQty = (returns || []).filter(r => r.saleId === selectedSale.id && r.productId === item.id).reduce((sum, r) => sum + r.quantity, 0);
                    const availableToReturn = item.quantity - returnedQty;
                    const isFullyReturned = availableToReturn <= 0;
                    const isSelected = returnItems.some(i => i.productId === item.id);
                    return (
                      <div 
                        key={item.id}
                        onClick={() => {
                          if (!isFullyReturned) {
                            toggleItem(item.id, item.name, item.quantity, availableToReturn);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer group",
                          isFullyReturned ? "opacity-50 bg-white/[0.02] border-white/5 cursor-not-allowed" :
                          isSelected ? "bg-orange-500/10 border-orange-500/30" : "bg-black/20 border-white/5 hover:border-white/10"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                             "w-10 h-10 rounded-xl flex items-center justify-center transition-colors border",
                             isFullyReturned ? "bg-white/5 text-white/10 border-white/5" :
                             isSelected ? "bg-orange-500 text-black border-transparent" : "bg-white/5 text-white/20 border-white/5 group-hover:text-white/50"
                          )}>
                            <Package className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">{item.name}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[9px] font-medium text-white/40">
                              <span>Vendido: <strong>{item.quantity} {item.unit || ''}</strong></span>
                              {returnedQty > 0 && (
                                <span className="text-orange-400">Já devolvido: <strong>{returnedQty}</strong></span>
                              )}
                              {!isFullyReturned ? (
                                <span className="text-emerald-400 font-bold">Disponível: <strong>{availableToReturn}</strong></span>
                              ) : (
                                <span className="text-amber-500 font-extrabold uppercase tracking-widest text-[8px] bg-amber-500/10 px-1 py-0.5 rounded">Totalmente devolvido</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isSelected && !isFullyReturned && (
                          <div className="flex items-center gap-3 bg-black/40 rounded-xl p-1" onClick={e => e.stopPropagation()}>
                            <button 
                              onClick={() => updateItemQty(item.id, -1, availableToReturn)}
                              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm font-mono font-black text-orange-500 min-w-[20px] text-center">
                              {returnItems.find(i => i.productId === item.id)?.quantity}
                            </span>
                            <button 
                              onClick={() => updateItemQty(item.id, 1, availableToReturn)}
                              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Configs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#121212] border border-white/5 rounded-3xl p-6 space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/20 pl-1">Motivo da Devolução</label>
                  <select 
                    value={reason}
                    onChange={(e) => setReason(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/50 transition-all"
                  >
                    <option value="defeito">Produto com Defeito</option>
                    <option value="desistencia">Desistência do Cliente</option>
                    <option value="errado">Produto Errado</option>
                    <option value="troca">Troca</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-white/20 pl-1">Ações de Inventário</label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={cn(
                      "w-10 h-6 rounded-full p-1 transition-colors relative",
                      returnToStock ? "bg-emerald-500" : "bg-white/10"
                    )}>
                      <input 
                        type="checkbox" 
                        checked={returnToStock}
                        onChange={e => setReturnToStock(e.target.checked)}
                        className="hidden" 
                      />
                      <div className={cn(
                        "w-4 h-4 bg-white rounded-full transition-transform",
                        returnToStock ? "translate-x-4" : "translate-x-0"
                      )} />
                    </div>
                    <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors">Retornar produtos ao estoque</span>
                  </label>

                  {currentCashier && (
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer group mt-3">
                        <div className={cn(
                          "w-10 h-6 rounded-full p-1 transition-colors relative",
                          refundViaCashierMoney ? "bg-emerald-500" : "bg-white/10"
                        )}>
                          <input 
                            type="checkbox" 
                            checked={refundViaCashierMoney}
                            onChange={e => {
                              setRefundViaCashierMoney(e.target.checked);
                              if (!e.target.checked) setForceInsufficientCash(false);
                            }}
                            className="hidden" 
                          />
                          <div className={cn(
                            "w-4 h-4 bg-white rounded-full transition-transform",
                            refundViaCashierMoney ? "translate-x-4" : "translate-x-0"
                          )} />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white/70 group-hover:text-white transition-colors">Estornar via Caixa em Dinheiro</span>
                          <span className="text-[8px] text-emerald-400 font-extrabold uppercase tracking-widest">Caixa Ativo #{currentCashier.id.substring(0, 4)}</span>
                        </div>
                      </label>

                      {refundViaCashierMoney && (() => {
                        const totalRefundVal = returnItems.reduce((acc, item) => {
                          const product = products.find(p => p.id === item.productId);
                          return safeAdd(acc, safeMultiply(product?.price || 0, item.quantity));
                        }, 0);
                        const available = getAvailableCash();
                        const isInsufficient = totalRefundVal > available;

                        if (!isInsufficient) return null;

                        return (
                          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-3">
                            <div className="flex gap-2.5 items-start">
                              <span className="text-red-500 text-xs font-black shrink-0 mt-0.5">⚠️</span>
                              <div>
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-wider">Saldo de Caixa Insuficiente</p>
                                <p className="text-[10px] text-zinc-400 mt-1">
                                  O caixa possui apenas <strong className="text-white">R$ {available.toFixed(2)}</strong> em dinheiro. Este estorno requer <strong className="text-white">R$ {totalRefundVal.toFixed(2)}</strong>.
                                </p>
                              </div>
                            </div>

                            <label className="flex items-center gap-2.5 cursor-pointer select-none border-t border-red-500/10 pt-3">
                              <input 
                                type="checkbox" 
                                checked={forceInsufficientCash}
                                onChange={e => {
                                  setForceInsufficientCash(e.target.checked);
                                  setErrorMsg(null);
                                }}
                                className="w-3.5 h-3.5 rounded border-white/10 bg-black text-red-500 focus:ring-red-500/30 cursor-pointer"
                              />
                              <span className="text-[9px] uppercase font-black text-white/80 tracking-wide hover:text-white transition-colors select-none">
                                Autorizar força de saldo gerencial
                              </span>
                            </label>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/20 pl-1">Observações Internas</label>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhe o ocorrido aqui..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500/50 transition-all resize-none"
                />
              </div>
            </motion.div>
          </div>

          <div className="space-y-6">
            {/* Summary */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#121212] border border-white/5 rounded-3xl p-6"
            >
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-6">Resumo da Devolução</h4>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/40">Itens selecionados</span>
                  <span className="text-white font-bold">{returnItems.length}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-white/40">Total de unidades</span>
                  <span className="text-white font-bold">
                    {returnItems.reduce((acc, curr) => acc + curr.quantity, 0)}
                  </span>
                </div>
                <div className="pt-4 border-t border-white/5">
                  <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Estorno Estimado</span>
                    <span className="text-lg font-mono font-black text-orange-500">
                      R$ {returnItems.reduce((acc, item) => {
                        const product = products.find(p => p.id === item.productId);
                        return acc + (product?.price || 0) * item.quantity;
                      }, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={handleConfirmReturn}
                  disabled={returnItems.length === 0 || success}
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                    success 
                      ? "bg-emerald-500 text-black" 
                      : "bg-orange-500 hover:bg-orange-600 text-black shadow-[0_0_30px_rgba(249,115,22,0.2)] disabled:opacity-50 disabled:grayscale"
                  )}
                >
                  {success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Concluído!
                    </>
                  ) : (
                    <>
                      Confirmar Devolução
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <p className="text-[8px] text-center text-white/20 font-bold leading-tight px-4">
                  Ao confirmar, os registros financeiros e de estoque serão atualizados automaticamente.
                </p>
              </div>
            </motion.div>

            {/* Tips */}
            <div className="bg-orange-500/5 border border-orange-500/10 rounded-2xl p-4">
               <div className="flex gap-3">
                  <AlertCircle className="w-4 h-4 text-orange-500 shrink-0" />
                  <p className="text-[9px] text-orange-500/70 font-bold leading-relaxed">
                    Importante: Devoluções geram lançamentos de saída pendentes no financeiro. Verifique o módulo financeiro para autorizar o estorno físico.
                  </p>
               </div>
            </div>
          </div>
        </div>
      )}
      <MasterPasswordModal 
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handlePasswordConfirmed}
        description="Autorização gerencial necessária para processar estornos e devoluções."
      />
    </div>
  );
}
