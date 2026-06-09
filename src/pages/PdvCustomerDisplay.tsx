import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Sparkles, Heart, CreditCard, Gift, ArrowRight } from 'lucide-react';
import { useStore } from '../store';

export default function PdvCustomerDisplay() {
  const company = useStore((state) => state.company);
  
  const [session, setSession] = useState<{
    cart: any[];
    discount: number;
    payments: any[];
    selectedMethodName: string;
    clientName: string;
    showSuccessModal: boolean;
    lastSale: any | null;
    subtotal: number;
    total: number;
  }>({
    cart: [],
    discount: 0,
    payments: [],
    selectedMethodName: '',
    clientName: 'Consumidor Final',
    showSuccessModal: false,
    lastSale: null,
    subtotal: 0,
    total: 0,
  });

  useEffect(() => {
    const channel = new BroadcastChannel('pdv-customer-display-channel');

    channel.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'pdv-state-update') {
        setSession(payload);
      } else if (type === 'pdv-reset') {
        setSession({
          cart: [],
          discount: 0,
          payments: [],
          selectedMethodName: '',
          clientName: 'Consumidor Final',
          showSuccessModal: false,
          lastSale: null,
          subtotal: 0,
          total: 0,
        });
      }
    };

    // Request full state from operator on load
    channel.postMessage({ type: 'request-state' });

    return () => {
      channel.close();
    };
  }, []);

  const { cart, discount, payments, selectedMethodName, clientName, showSuccessModal, subtotal, total } = session;

  return (
    <div className="h-screen w-screen bg-[#070707] text-zinc-100 flex flex-col font-sans overflow-hidden select-none">
      {/* Upper Brand Indicator */}
      <header className="h-16 border-b border-white/5 bg-[#121212]/30 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-black font-semibold shadow-lg shadow-emerald-500/10">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-black uppercase tracking-[0.15em] text-white">
              {company?.name || 'PDV Tradicional'}
            </h1>
            <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest font-mono">
              Painel do Cliente Visual
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/15 rounded-xl px-3 py-1 text-[9px] font-bold text-emerald-400 uppercase tracking-widest leading-none font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block mr-1.5" />
          Operador Online
        </div>
      </header>

      {/* Main Grid View */}
      <div className="flex-1 overflow-hidden grid grid-cols-12 relative">
        <AnimatePresence mode="wait">
          {showSuccessModal ? (
            /* Thank You Success Screen */
            <motion.div
              key="success-screen"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="col-span-12 flex flex-col items-center justify-center p-8 bg-zinc-950 text-center relative z-20"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_rgba(16,185,129,0.03),_transparent_50%)] pointer-events-none animate-pulse" />
              
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 100, delay: 0.1 }}
                className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center text-black shadow-2xl shadow-emerald-500/20 mb-6"
              >
                <Sparkles className="w-10 h-10 animate-pulse" />
              </motion.div>

              <div className="space-y-3 max-w-md">
                <span className="text-[10px] font-mono text-emerald-400 font-extrabold uppercase tracking-[0.3em] block">
                  Venda Finalizada!
                </span>
                <h2 className="text-3xl font-black text-white uppercase tracking-tight font-mono">
                  Muito obrigado pela preferência!
                </h2>
                <div className="w-12 h-0.5 bg-emerald-500/30 mx-auto my-4 rounded-full" />
                <p className="text-[11px] text-zinc-400 uppercase font-semibold tracking-wider leading-relaxed">
                  Volte sempre! Seu cupom fiscal foi gerado e está sendo impresso pelo operador.
                </p>
                <div className="flex items-center justify-center gap-2 text-[9px] text-zinc-500 font-mono font-bold pt-4">
                  <Heart className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                  AGRADECEMOS A VISITA
                </div>
              </div>
            </motion.div>
          ) : (
            /* Regular Selling Screen */
            <div className="col-span-12 lg:col-span-7 flex flex-col border-r border-white/5 h-full overflow-hidden">
              {/* Product Header */}
              <div className="px-8 py-4 bg-zinc-900/10 flex items-center justify-between border-b border-white/5">
                <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">
                  Produtos Selecionados
                </span>
                <span className="text-[9px] font-mono font-bold bg-white/5 rounded-lg px-2.5 py-1 text-zinc-400 uppercase">
                  {cart.length} {cart.length === 1 ? 'item' : 'itens'} no carrinho
                </span>
              </div>

              {/* Product List */}
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-3 custom-scrollbar">
                <AnimatePresence initial={false}>
                  {cart.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center py-16"
                    >
                      <ShoppingBag className="w-12 h-12 text-zinc-700 mb-3 animate-bounce" />
                      <p className="text-xs uppercase font-extrabold tracking-widest text-zinc-500">
                        Aguardando início dos lançamentos...
                      </p>
                      <p className="text-[10px] text-zinc-650 max-w-xs mt-1 leading-normal">
                        Os itens passarão a aparecer aqui conforme forem registrados pelo operador.
                      </p>
                    </motion.div>
                  ) : (
                    cart.map((item, index) => (
                      <motion.div
                        key={item.id + '-' + index}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.2 }}
                        className="p-4 bg-zinc-900/40 border border-white/5 rounded-2xl flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="w-7 h-7 bg-white/5 border border-white/10 text-white rounded-lg flex items-center justify-center font-mono text-[10px] font-black shrink-0">
                            {item.quantity}x
                          </span>
                          <div className="overflow-hidden">
                            <span className="text-[11px] font-black text-white uppercase block truncate tracking-wide">
                              {item.name}
                            </span>
                            <span className="text-[9px] text-zinc-500 block uppercase font-bold tracking-widest font-mono">
                              Código: {item.code || 'S/C'}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <span className="text-[10px] text-zinc-500 block">
                            R$ {(item.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} un
                          </span>
                          <span className="text-xs font-black text-emerald-400">
                            R$ {((item.price || 0) * item.quantity).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>

              {/* Customer Greeting Footer */}
              <div className="h-16 border-t border-white/5 bg-[#121212]/10 px-8 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                  Cliente: <span className="text-white ml-1">{clientName}</span>
                </span>
                <span className="text-[9px] text-zinc-600 font-mono font-bold uppercase tracking-widest">
                  Obrigado pela preferência!
                </span>
              </div>
            </div>
          )}
        </AnimatePresence>

        {/* Totals and Payment Summary Right Panel */}
        {!showSuccessModal && (
          <div className="col-span-12 lg:col-span-5 bg-black/40 h-full flex flex-col justify-between overflow-hidden">
            {/* Top Indicator */}
            <div className="p-8 border-b border-white/5">
              <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider block mb-1">
                Resumo dos Valores
              </span>
              <p className="text-[9px] text-zinc-500 leading-normal uppercase">
                Confira os cálculos e forma de pagamento de sua compra.
              </p>
            </div>

            {/* Calculations Blocks */}
            <div className="px-8 py-6 space-y-4 flex-1 overflow-y-auto">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center text-zinc-400 text-[10px] uppercase font-bold">
                  <span>Subtotal</span>
                  <span className="font-mono">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between items-center text-rose-400 text-[10px] uppercase font-bold">
                    <span>Desconto aplicado</span>
                    <span className="font-mono">- R$ {discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="h-px bg-white/5 my-2" />

                <div className="flex justify-between items-end">
                  <span className="text-zinc-400 text-[11px] uppercase font-extrabold pb-1">Total Geral</span>
                  <span className="text-2xl font-black text-white font-mono leading-none">
                    R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Selected Method Block */}
              {selectedMethodName && (
                <div className="mt-8 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl space-y-1.5 animate-fade-in">
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest font-mono block">
                    Forma de Pagamento Selecionada
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="w-12 h-6 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                      <CreditCard className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-black text-white uppercase tracking-wider font-mono">
                      {selectedMethodName}
                    </span>
                  </div>
                </div>
              )}

              {/* Progress visual slider */}
              {payments.length > 0 && (
                <div className="p-4 bg-zinc-900/30 border border-white/5 rounded-2xl space-y-2">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">
                    Registros de Pagamento
                  </span>
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center text-[10px] text-zinc-300 font-mono">
                      <span>{p.methodName}</span>
                      <span className="font-bold text-emerald-500">R$ {p.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Micro footer disclaimer */}
            <div className="p-8 border-t border-white/5 text-[9px] text-zinc-500 text-center uppercase tracking-widest">
              Terminal Visual Operado Manualmente com Assistência Segura
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
