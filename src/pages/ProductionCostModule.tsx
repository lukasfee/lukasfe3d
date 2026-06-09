import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Save, 
  History, 
  Box, 
  DollarSign, 
  Info,
  X,
  TrendingUp,
  Percent,
  Search,
  AlertCircle,
  Package,
  Layers,
  FileText,
  ChevronRight,
  ClipboardList,
  Edit2,
  AlertTriangle,
  Cpu
} from 'lucide-react';
import { cn } from '../lib/utils';
import { 
  useStore, 
  Material, 
  ProductionRecipe,
  Machine
} from '../store';

export default function ProductionCostModule() {
  const materials = useStore(state => state.materials);
  const addMaterial = useStore(state => state.addMaterial);
  const updateMaterial = useStore(state => state.updateMaterial);
  const deleteMaterial = useStore(state => state.deleteMaterial);
  const productions = useStore(state => state.productions);
  const addProduction = useStore(state => state.addProduction);
  const deleteProduction = useStore(state => state.deleteProduction);
  const machines = useStore(state => state.machines);
  const addMachine = useStore(state => state.addMachine);
  const updateMachine = useStore(state => state.updateMachine);
  const deleteMachine = useStore(state => state.deleteMachine);

  const [activeTab, setActiveTab] = useState<'materials' | 'calculator' | 'productions'>('materials');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Materials State ---
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);

  // --- Calculator State ---
  const [simulationName, setSimulationName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedMaterials, setSelectedMaterials] = useState<{ materialId: string; quantity: number }[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [desiredPrice, setDesiredPrice] = useState(0);
  const [wastePercent, setWastePercent] = useState(0);
  const [laborHours, setLaborHours] = useState(0);
  const [laborCostPerHour, setLaborCostPerHour] = useState(0);

  // --- Calculations ---
  const results = useMemo(() => {
    let materialCost = 0;
    const items = selectedMaterials.map(sm => {
      const mat = materials.find(m => m.id === sm.materialId);
      const cost = mat ? (mat.unitCost * sm.quantity) : 0;
      materialCost += cost;
      return { ...sm, cost };
    });

    let machineCostValue = 0;
    const machine = machines.find(m => m.id === selectedMachineId);
    if (machine) {
      machineCostValue = (machine.price * (machine.wearRate / 100)) + machine.fixedCost;
    }

    const wasteCostValue = materialCost * ((wastePercent || 0) / 100);
    const laborCostValue = (laborHours || 0) * (laborCostPerHour || 0);

    const total = materialCost + wasteCostValue + machineCostValue + laborCostValue;
    const unit = total / (quantity || 1);

    return {
      items,
      materialCost,
      wasteCost: wasteCostValue,
      laborCost: laborCostValue,
      machineCost: machineCostValue,
      total,
      unit
    };
  }, [selectedMaterials, materials, selectedMachineId, machines, quantity, wastePercent, laborHours, laborCostPerHour]);

  const handleSaveProduction = () => {
    if (!simulationName) {
      alert("Por favor, digite o nome da produção.");
      return;
    }

    if (selectedMaterials.length === 0) {
      alert("Adicione pelo menos um material.");
      return;
    }

    addProduction({
      name: simulationName,
      items: results.items,
      totalCost: results.total,
      suggestedPrice: desiredPrice,
      quantity: quantity,
      wastePercent: wastePercent,
      laborHours: laborHours,
      laborCostPerHour: laborCostPerHour,
      laborTotalCost: results.laborCost
    });

    alert("Ficha técnica salva com sucesso!");
    setActiveTab('productions');
  };



  const addMaterialToSim = () => {
    if (materials.length === 0) return;
    setSelectedMaterials([...selectedMaterials, { materialId: materials[0].id, quantity: 0 }]);
  };

  const removeMaterialFromSim = (index: number) => {
    setSelectedMaterials(selectedMaterials.filter((_, i) => i !== index));
  };

  const updateMaterialInSim = (index: number, field: 'materialId' | 'quantity', val: any) => {
    const newItems = [...selectedMaterials];
    newItems[index] = { ...newItems[index], [field]: val };
    setSelectedMaterials(newItems);
  };

  const filteredMaterials = materials.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProductions = productions.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderMaterialModal = () => (
    <AnimatePresence>
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            onClick={() => setIsMaterialModalOpen(false)} 
            className="absolute inset-0 bg-black/80 backdrop-blur-md" 
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.95 }} 
            className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex justify-between items-center underline decoration-emerald-500/30 underline-offset-8">
              <h2 className="text-xl font-bold text-white uppercase flex items-center gap-3">
                <Package className="w-6 h-6 text-emerald-500" />
                {editingMaterial ? 'Editar Material' : 'Novo Material'}
              </h2>
              <button onClick={() => setIsMaterialModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form className="grid grid-cols-1 md:grid-cols-2 gap-6" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const data = {
                name: formData.get('name') as string,
                category: formData.get('category') as string,
                unit: formData.get('unit') as string,
                totalPurchaseQuantity: Number(formData.get('totalPurchaseQuantity')),
                totalCost: Number(formData.get('totalCost')),
                minStock: Number(formData.get('minStock')),
                notes: formData.get('notes') as string,
                artsPerSheet: formData.get('materialType') === 'paper' ? Number(formData.get('artsPerSheet')) : undefined
              };

              if (editingMaterial) {
                updateMaterial(editingMaterial.id, data);
              } else {
                addMaterial(data);
              }
              setIsMaterialModalOpen(false);
            }}>
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Nome do Material/Insumo</label>
                <input name="name" defaultValue={editingMaterial?.name} placeholder="Ex: Filamento PLA Branco" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none" />
              </div>

              <div>
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Categoria</label>
                <select name="category" defaultValue={editingMaterial?.category} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none">
                  <option value="Filamento">Filamento</option>
                  <option value="Resina">Resina</option>
                  <option value="Papel">Papel</option>
                  <option value="Ferragem">Ferragem</option>
                  <option value="Embalagem">Embalagem</option>
                  <option value="Químico">Químico (Cola, Tinta)</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Unidade de Medida</label>
                <select name="unit" defaultValue={editingMaterial?.unit} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none">
                  <option value="KG">Quilo (KG)</option>
                  <option value="G">Grama (G)</option>
                  <option value="L">Litro (L)</option>
                  <option value="ML">Mililitro (ML)</option>
                  <option value="UN">Unidade</option>
                  <option value="PCT">Pacote</option>
                  <option value="FOLHA">Folha</option>
                  <option value="M">Metro (M)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Quantidade Comprada</label>
                <input name="totalPurchaseQuantity" type="number" step="0.001" defaultValue={editingMaterial?.totalPurchaseQuantity} required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-mono" />
              </div>

              <div>
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Valor Total Pago (R$)</label>
                <input name="totalCost" type="number" step="0.01" defaultValue={editingMaterial?.totalCost} required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-mono" />
              </div>

              <div>
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Estoque Mínimo</label>
                <input name="minStock" type="number" step="0.001" defaultValue={editingMaterial?.minStock} required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none font-mono" />
              </div>

              {/* Conditional for Paper */}
              <div className="md:col-span-2 p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                 <div className="flex items-center gap-2">
                   <input type="checkbox" name="materialType" value="paper" defaultChecked={!!editingMaterial?.artsPerSheet} className="accent-emerald-500" />
                   <label className="text-[10px] uppercase font-black text-white/40 tracking-widest">Este material é do tipo Papel?</label>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    <div>
                      <label className="text-[10px] uppercase font-black text-white/20 tracking-widest mb-1.5 block">Artes por Unidade (Folha)</label>
                      <input name="artsPerSheet" type="number" defaultValue={editingMaterial?.artsPerSheet} className="w-full bg-black/60 border border-white/10 rounded-xl px-4 py-2 text-xs text-white outline-none" placeholder="Ex: 15" />
                    </div>
                 </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-black text-white/30 tracking-widest block mb-1.5">Observações</label>
                <textarea name="notes" defaultValue={editingMaterial?.notes} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none h-20 resize-none" />
              </div>

              <div className="md:col-span-2 flex gap-3 mt-4">
                <button type="button" onClick={() => setIsMaterialModalOpen(false)} className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20">Salvar Material</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  // Mobile Layout
  if (isMobile) {
    return (
      <>
        <div className="min-h-full bg-[#0A0A0A] text-white flex flex-col p-4 space-y-5 pb-16 select-text overflow-y-auto">
          {/* 2. Subabas */}
          <div className="grid grid-cols-3 bg-[#121212] border border-white/5 p-1 rounded-xl shrink-0">
          <button 
            onClick={() => setActiveTab('materials')}
            className={cn(
              "py-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
              activeTab === 'materials' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <Package className="w-3.5 h-3.5" /> Materiais
          </button>
          <button 
            onClick={() => setActiveTab('calculator')}
            className={cn(
              "py-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
              activeTab === 'calculator' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <Calculator className="w-3.5 h-3.5" /> Calculadora
          </button>
          <button 
            onClick={() => setActiveTab('productions')}
            className={cn(
              "py-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5",
              activeTab === 'productions' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" /> Produções
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'materials' && (
          <div className="flex flex-col gap-5">
            {/* 3. Logo abaixo das subabas: Buscar e Novo Material (sem card ao redor) */}
            <div className="flex flex-col gap-3 shrink-0">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Buscar material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#121212] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-xs text-white focus:border-emerald-500 outline-none transition-all"
                />
              </div>
              <button 
                onClick={() => {
                  setEditingMaterial(null);
                  setIsMaterialModalOpen(true);
                }}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Novo Material
              </button>
            </div>

            {/* 4. Lista de Materiais */}
            <div className="space-y-3">
              {filteredMaterials.map(m => (
                <div 
                  key={m.id}
                  className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden shadow-md"
                >
                  {m.currentQuantity <= m.minStock && (
                    <div className="absolute top-0 right-0 p-2 text-red-500 animate-pulse">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  )}
                  
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/20 tracking-widest block mb-0.5">{m.category}</span>
                    <h3 className="text-sm font-bold text-white uppercase">{m.name}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-black/20 rounded-xl p-3 border border-white/5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7.5px] uppercase font-black text-white/25 tracking-widest">Saldo Atual</span>
                      <span className={cn(
                        "text-xs font-bold font-mono",
                        m.currentQuantity <= m.minStock ? "text-red-500" : "text-emerald-400"
                      )}>
                        {m.currentQuantity} {m.unit}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[7.5px] uppercase font-black text-white/25 tracking-widest">Custo Unit.</span>
                      <span className="text-xs font-bold text-white font-mono">R$ {m.unitCost.toFixed(2)}</span>
                    </div>
                  </div>

                  {m.artsPerSheet && (
                    <div className="p-2.5 bg-blue-500/5 rounded-xl border border-blue-500/10 flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <FileText className="w-3.5 h-3.5 text-blue-400" />
                         <span className="text-[8px] uppercase font-black text-blue-400/60 tracking-widest">Artes Disp.</span>
                       </div>
                       <span className="text-xs font-bold text-blue-400 font-mono">{m.currentQuantity * m.artsPerSheet} artes</span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        setEditingMaterial(m);
                        setIsMaterialModalOpen(true);
                      }}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Editar
                    </button>
                    <button 
                      onClick={() => {
                        if (confirm('Deseja excluir este material?')) {
                          deleteMaterial(m.id);
                        }
                      }}
                      className="px-3 py-2 bg-red-500/10 hover:bg-red-500 text-white rounded-lg transition-all cursor-pointer flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              
              {filteredMaterials.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-white/20 uppercase font-black tracking-widest text-xs">Nenhum material cadastrado</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calculator' && (
          <div className="flex flex-col gap-4">
            {/* Simulation settings */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-emerald-500" /> Dados da Produção
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Nome da Produção</label>
                  <input 
                    type="text" 
                    placeholder="Ex: Chaveiro Naruto"
                    value={simulationName}
                    onChange={(e) => setSimulationName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Qtd no Lote</label>
                  <input 
                    type="number" 
                    min="1"
                    value={quantity || ''}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Perda e Mão de Obra */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 space-y-3">
              <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-emerald-500" /> Perda e Mão de Obra
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[8px] uppercase font-black text-white/20">Perda / Refugo (%)</label>
                    {results.wasteCost > 0 && <span className="text-[9px] text-[#FF5A5F] font-mono font-bold">+ R$ {results.wasteCost.toFixed(2)}</span>}
                  </div>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    placeholder="0"
                    value={wastePercent || ''}
                    onChange={(e) => setWastePercent(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                  />
                  <p className="text-[7.5px] text-white/30 uppercase mt-1">Estimativa de desperdício ou perda de insumos na produção.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Horas Mão de Obra</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.1"
                      placeholder="0"
                      value={laborHours || ''}
                      onChange={(e) => setLaborHours(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Custo por Hora</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={laborCostPerHour || ''}
                      onChange={(e) => setLaborCostPerHour(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:border-emerald-500 outline-none font-mono"
                    />
                  </div>
                </div>
                {results.laborCost > 0 && (
                  <div className="flex justify-between items-center text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/5 p-2 rounded-lg border border-emerald-500/10 font-mono">
                    <span>Total Mão de Obra:</span>
                    <span>R$ {results.laborCost.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Composition */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-white/5">
                <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" /> Composição
                </h3>
                <button 
                  onClick={addMaterialToSim}
                  className="py-1 px-3 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-md text-[8px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Adicionar
                </button>
              </div>

              <div className="space-y-3">
                {selectedMaterials.map((sm, idx) => {
                  const material = materials.find(m => m.id === sm.materialId);
                  return (
                    <div key={idx} className="bg-black/20 p-3 rounded-xl border border-white/5 space-y-2 relative">
                      <div>
                        <label className="text-[7px] uppercase font-black text-white/25 mb-0.5 block">Insumo</label>
                        <select 
                          value={sm.materialId}
                          onChange={(e) => updateMaterialInSim(idx, 'materialId', e.target.value)}
                          className="w-full bg-[#121212] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:border-emerald-500"
                        >
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[7px] uppercase font-black text-white/25 mb-0.5 block">Qtd Usada ({material?.unit || ''})</label>
                          <input 
                            type="number" 
                            step="0.001"
                            value={sm.quantity || ''}
                            onChange={(e) => updateMaterialInSim(idx, 'quantity', Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-xs text-white font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[7px] uppercase font-black text-white/25 mb-0.5 block">Subtotal</label>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 text-xs text-emerald-500 font-bold font-mono text-center">
                            R$ {((material?.unitCost || 0) * sm.quantity).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => removeMaterialFromSim(idx)}
                        className="absolute top-1 right-2 p-1 text-red-500/40 hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                {selectedMaterials.length === 0 && (
                  <p className="text-[9px] text-center text-white/20 uppercase font-black py-4">Nenhum material adicionado</p>
                )}
              </div>
            </div>

            {/* Machine Selection */}
            <div className="bg-[#121212] border border-white/5 rounded-2xl p-4 space-y-2">
              <h3 className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-emerald-500" /> Máquina
              </h3>
              <select 
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-emerald-500 outline-none"
              >
                <option value="">Nenhuma máquina utilizada</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.name} (R$ {m.price.toFixed(2)})</option>
                ))}
              </select>
            </div>

            {/* Resumo de Custos */}
            <div className="bg-[#121212] border border-emerald-500/20 rounded-2xl p-4 space-y-4">
              <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex justify-between items-center">
                  <span className="text-[8px] uppercase font-black text-white/40 tracking-widest">Total Lote</span>
                  <span className="text-sm font-bold font-mono text-white">R$ {results.total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center bg-emerald-500/10 p-3 rounded-xl">
                  <span className="text-[8px] uppercase font-black text-emerald-500 tracking-widest">Custo Unidade</span>
                  <span className="text-base font-black text-emerald-500 font-mono">R$ {results.unit.toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[8px] uppercase font-black text-white/40 mb-1 block">Preço Sugerido (Unid)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
                    <input 
                      type="number" 
                      value={desiredPrice || ''}
                      onChange={(e) => setDesiredPrice(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-8 pr-3 text-sm font-bold text-white font-mono focus:border-emerald-500 outline-none"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleSaveProduction}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" /> Salvar Produção
                </button>


              </div>
            </div>
          </div>
        )}

        {activeTab === 'productions' && (
          <div className="flex flex-col gap-4">
            {/* Search production */}
            <div className="relative w-full shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Buscar produção..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#121212] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-xs text-white focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* List productions */}
            <div className="space-y-3">
              {filteredProductions.map(prod => (
                <div 
                  key={prod.id}
                  className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col gap-3"
                >
                  <div>
                    <span className="text-[7px] uppercase font-black text-white/20 tracking-widest block mb-0.5">CRIADA EM {new Date(prod.createdAt).toLocaleDateString()}</span>
                    <h3 className="text-sm font-bold text-white uppercase">{prod.name}</h3>
                  </div>

                  <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-2">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-white/40">{prod.items.length} itens</span>
                      <span className="text-emerald-400 font-mono">Total Lote: R$ {prod.totalCost.toFixed(2)}</span>
                    </div>
                    <div className="pt-1 border-t border-white/5 flex justify-between items-center text-[10px] text-white/60">
                      <span>Custo Unitário ({prod.quantity || 1} un):</span>
                      <span className="font-mono font-bold text-white">R$ {(prod.totalCost / (prod.quantity || 1)).toFixed(2)}</span>
                    </div>
                    {prod.suggestedPrice && (
                      <div className="pt-1.5 border-t border-white/5 flex justify-between items-center text-[8px] uppercase font-black">
                         <span className="text-white/20">Preço Sugerido</span>
                         <span className="text-white font-mono">R$ {prod.suggestedPrice.toFixed(2)}</span>
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={() => {
                      setSimulationName(prod.name);
                      setSelectedMaterials(prod.items.map(i => ({ materialId: i.materialId, quantity: i.quantity })));
                      setDesiredPrice(prod.suggestedPrice || 0);
                      setQuantity(prod.quantity || 1);
                      setWastePercent(prod.wastePercent || 0);
                      setLaborHours(prod.laborHours || 0);
                      setLaborCostPerHour(prod.laborCostPerHour || 0);
                      setActiveTab('calculator');
                    }}
                    className="w-full py-2 bg-white/5 hover:bg-emerald-500 text-white hover:text-black rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Usar Base
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm('Excluir ficha técnica?')) {
                        deleteProduction(prod.id);
                      }
                    }}
                    className="w-full py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>
              ))}

              {filteredProductions.length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-white/20 uppercase font-black tracking-widest text-xs">Nenhuma produção salva</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {renderMaterialModal()}
    </>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-end gap-4 shrink-0">
        <div className="flex bg-[#121212] border border-white/5 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('materials')}
            className={cn(
              "px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === 'materials' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <Package className="w-3.5 h-3.5" /> Materiais
          </button>
          <button 
            onClick={() => setActiveTab('calculator')}
            className={cn(
              "px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === 'calculator' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <Calculator className="w-3.5 h-3.5" /> Calculadora
          </button>
          <button 
            onClick={() => setActiveTab('productions')}
            className={cn(
              "px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              activeTab === 'productions' ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "text-white/40 hover:text-white"
            )}
          >
            <FileText className="w-3.5 h-3.5" /> Produções
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col gap-4">
        {/* Materiais Tab */}
        {activeTab === 'materials' && (
          <div className="flex flex-col h-full gap-4">
            <div className="bg-[#121212] border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-inner">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">Materiais e Insumos</h2>
                  <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mt-0.5">Controle de estoque de insumos</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
                  <input 
                    type="text" 
                    placeholder="Buscar material..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={() => {
                    setEditingMaterial(null);
                    setIsMaterialModalOpen(true);
                  }}
                  className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 shrink-0"
                >
                  <Plus className="w-4 h-4" /> Novo Material
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredMaterials.map(m => (
                  <motion.div 
                    layout
                    key={m.id}
                    className="bg-[#121212] border border-white/5 rounded-3xl p-6 flex flex-col gap-4 group hover:border-white/10 transition-all shadow-lg relative overflow-hidden"
                  >
                    {m.currentQuantity <= m.minStock && (
                      <div className="absolute top-0 right-0 p-2 text-red-500 animate-pulse">
                        <AlertTriangle className="w-5 h-5" />
                      </div>
                    )}
                    
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] uppercase font-black text-white/20 tracking-widest block mb-1">{m.category}</span>
                          <h3 className="text-base font-bold text-white uppercase">{m.name}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                          <Package className="w-4 h-4" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-black/20 rounded-2xl p-4 border border-white/5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] uppercase font-black text-white/20 tracking-widest">Saldo Atual</span>
                        <span className={cn(
                          "text-sm font-bold font-mono",
                          m.currentQuantity <= m.minStock ? "text-red-500" : "text-emerald-500"
                        )}>
                          {m.currentQuantity} {m.unit}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[8px] uppercase font-black text-white/20 tracking-widest">Custo Unit.</span>
                        <span className="text-sm font-bold text-white font-mono">R$ {m.unitCost.toFixed(2)}</span>
                      </div>
                    </div>

                    {m.artsPerSheet && (
                      <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                           <FileText className="w-4 h-4 text-blue-400" />
                           <span className="text-[10px] uppercase font-black text-blue-400/60 tracking-widest">Artes Disp.</span>
                         </div>
                         <span className="text-xs font-bold text-blue-400">{m.currentQuantity * m.artsPerSheet} artes</span>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button 
                        onClick={() => {
                          setEditingMaterial(m);
                          setIsMaterialModalOpen(true);
                        }}
                        className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                      >
                        Editar
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('Deseja excluir este material?')) {
                            deleteMaterial(m.id);
                          }
                        }}
                        className="px-4 py-3 bg-red-500/10 hover:bg-red-500 text-white rounded-xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
                {filteredMaterials.length === 0 && (
                  <div className="col-span-full py-20 text-center">
                    <Package className="w-16 h-16 text-white/5 mx-auto mb-4" />
                    <p className="text-white/20 uppercase font-black tracking-widest text-xs">Nenhum material cadastrado</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Calculator Tab */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 h-full overflow-y-auto custom-scrollbar pb-10">
            <div className="xl:col-span-8 space-y-6">
              {/* Product Info */}
              <section className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
                <h3 className="text-xs uppercase font-black text-white/40 tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-emerald-500" /> DADOS DA PRODUÇÃO
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-8">
                    <label className="text-[9px] uppercase font-black text-white/20 mb-1.5 block">Nome da Produção / Modelo</label>
                    <input 
                      type="text" 
                      placeholder="Ex: Chaveiro Naruto"
                      value={simulationName}
                      onChange={(e) => setSimulationName(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[9px] uppercase font-black text-white/20 mb-1.5 block">Quantidade no Lote</label>
                    <input 
                      type="number" 
                      min="1"
                      value={quantity || ''}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all font-mono"
                    />
                  </div>
                </div>
              </section>

              {/* Waste & Labor Info */}
              <section className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-inner relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/50" />
                <h3 className="text-xs uppercase font-black text-white/40 tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-emerald-500" /> PERDA E MÃO DE OBRA
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  <div className="md:col-span-4">
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-[9px] uppercase font-black text-white/20 block">Perda / Refugo (%)</label>
                      {results.wasteCost > 0 && <span className="text-[9px] text-[#FF5A5F] font-semibold font-mono">+ R$ {results.wasteCost.toFixed(2)}</span>}
                    </div>
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      placeholder="0"
                      value={wastePercent || ''}
                      onChange={(e) => setWastePercent(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all font-mono"
                    />
                    <span className="text-[7.5px] text-white/20 uppercase mt-1 block">Perda estimada de materiais</span>
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[9px] uppercase font-black text-white/20 mb-1.5 block">Horas Mão de Obra</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.1"
                      placeholder="Ex: 2"
                      value={laborHours || ''}
                      onChange={(e) => setLaborHours(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all font-mono"
                    />
                    <span className="text-[7.5px] text-white/20 uppercase mt-1 block">Tempo em horas</span>
                  </div>
                  <div className="md:col-span-4">
                    <label className="text-[9px] uppercase font-black text-white/20 mb-1.5 block">Custo por Hora</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      placeholder="Ex: 15.00"
                      value={laborCostPerHour || ''}
                      onChange={(e) => setLaborCostPerHour(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all font-mono"
                    />
                    <span className="text-[7.5px] text-white/20 uppercase mt-1 block">Valor hora do operador</span>
                  </div>
                </div>
                {results.laborCost > 0 && (
                  <div className="mt-4 flex justify-between items-center text-xs font-black uppercase text-emerald-500 bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10 font-mono">
                    <span>Total Mão de Obra:</span>
                    <span>R$ {results.laborCost.toFixed(2)}</span>
                  </div>
                )}
              </section>

              {/* Composition */}
              <section className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-inner relative overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs uppercase font-black text-white/40 tracking-[0.2em] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-500" /> COMPOSIÇÃO DE MATERIAIS
                  </h3>
                  <button 
                    onClick={addMaterialToSim}
                    className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 rounded-lg transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4"
                  >
                    <Plus className="w-4 h-4" /> Adicionar Insumo
                  </button>
                </div>

                <div className="space-y-3">
                  {selectedMaterials.map((sm, idx) => {
                    const material = materials.find(m => m.id === sm.materialId);
                    return (
                      <div key={idx} className="flex flex-col md:flex-row gap-4 items-center bg-black/20 p-4 rounded-2xl border border-white/5 group animate-in slide-in-from-left-2">
                        <div className="flex-1 w-full">
                          <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Material</label>
                          <select 
                            value={sm.materialId}
                            onChange={(e) => updateMaterialInSim(idx, 'materialId', e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-emerald-500 outline-none"
                          >
                            {materials.map(m => (
                              <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-full md:w-32">
                          <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Custo Unit.</label>
                          <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white/40 font-mono">
                            R$ {material?.unitCost.toFixed(2) || '0.00'}
                          </div>
                        </div>
                        <div className="w-full md:w-32">
                          <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Qtd Usada ({material?.unit || ''})</label>
                          <input 
                            type="number" 
                            step="0.001"
                            value={sm.quantity || ''}
                            onChange={(e) => updateMaterialInSim(idx, 'quantity', Number(e.target.value))}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono"
                          />
                        </div>
                        <div className="w-full md:w-32">
                          <label className="text-[8px] uppercase font-black text-white/20 mb-1 block">Subtotal</label>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 text-xs text-emerald-500 font-black font-mono">
                            R$ {((material?.unitCost || 0) * sm.quantity).toFixed(2)}
                          </div>
                        </div>
                        <button 
                          onClick={() => removeMaterialFromSim(idx)}
                          className="p-2 text-red-500/30 hover:text-red-500 transition-all self-end mb-1"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    );
                  })}
                  {selectedMaterials.length === 0 && (
                    <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl">
                       <Layers className="w-12 h-12 text-white/5 mx-auto mb-2" />
                       <p className="text-[10px] text-white/20 uppercase font-black tracking-widest">Nenhum material selecionado para o cálculo</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Machine Selection */}
              <section className="bg-[#121212] border border-white/5 rounded-3xl p-6 shadow-inner relative overflow-hidden">
                <h3 className="text-xs uppercase font-black text-white/40 tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-500" /> MÁQUINA (DESGASTE + FIXO)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-12">
                     <select 
                      value={selectedMachineId}
                      onChange={(e) => setSelectedMachineId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                    >
                      <option value="">Nenhuma máquina utilizada</option>
                      {machines.map(m => (
                        <option key={m.id} value={m.id}>{m.name} (R$ {m.price.toFixed(2)})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            </div>

            <div className="xl:col-span-4 space-y-6">
              <div className="sticky top-0 space-y-6">
                <section className="bg-[#121212] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col gap-8">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-emerald-500">
                    <TrendingUp className="w-32 h-32" />
                  </div>
                  
                  <div>
                    <h3 className="text-xs uppercase font-black text-emerald-500 tracking-[0.3em] mb-4">RESUMO DE CUSTOS</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-end border-b border-white/5 pb-2">
                        <span className="text-[10px] uppercase font-black text-white/40 tracking-widest">Custo Total Lote</span>
                        <span className="text-2xl font-black text-white font-mono leading-none">R$ {results.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-end bg-emerald-500/10 p-4 rounded-2xl">
                        <span className="text-[10px] uppercase font-black text-emerald-500 tracking-widest">Custo por Unidade</span>
                        <div className="text-right">
                          <span className="text-2xl font-black text-emerald-500 font-mono leading-none block">R$ {results.unit.toFixed(2)}</span>
                          <span className="text-[9px] text-emerald-500/50 uppercase font-black mt-1 block">Base: {quantity || 1} unid.</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/5 space-y-6">
                    <div>
                      <label className="text-[10px] uppercase font-black text-white/40 tracking-widest block mb-1.5 flex justify-between">
                        PREÇO SUGERIDO (UNID)
                        <span className="text-emerald-500 font-mono">Markup: {results.unit > 0 ? (desiredPrice / results.unit).toFixed(2) : 0}x</span>
                      </label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-5 h-5" />
                        <input 
                          type="number" 
                          value={desiredPrice || ''}
                          onChange={(e) => setDesiredPrice(Number(e.target.value))}
                          className="w-full bg-black/60 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-xl font-black text-white focus:border-emerald-500 outline-none shadow-inner font-mono"
                          placeholder="0,00"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={handleSaveProduction}
                      className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-black rounded-3xl text-[12px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 group active:scale-[0.98]"
                    >
                      <Save className="w-5 h-5 transition-transform group-hover:scale-110" /> Salvar como Produção
                    </button>


                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* Produções Tab */}
        {activeTab === 'productions' && (
          <div className="flex flex-col h-full gap-4">
             <div className="bg-[#121212] border border-white/5 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-inner">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">Fichas Técnicas</h2>
                  <p className="text-[10px] text-white/30 uppercase font-black tracking-widest mt-0.5">Gestão de produtos e composições</p>
                </div>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Buscar produção..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-10">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredProductions.map(prod => (
                    <motion.div 
                      layout
                      key={prod.id}
                      className="bg-[#121212] border border-white/5 rounded-3xl p-6 flex flex-col gap-4 group hover:border-white/10 transition-all shadow-lg"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[8px] uppercase font-black text-white/20 tracking-widest block mb-1">CRIADA EM {new Date(prod.createdAt).toLocaleDateString()}</span>
                          <h3 className="text-base font-bold text-white uppercase truncate max-w-[200px]">{prod.name}</h3>
                        </div>
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-black text-white/20 tracking-widest px-1">
                          <span>Insumos</span>
                          <span>Custo Unit.</span>
                        </div>
                        <div className="bg-black/20 rounded-2xl p-4 border border-white/5 space-y-2">
                          <div className="flex justify-between items-center text-sm font-bold">
                            <span className="text-white/40">{prod.items.length} itens</span>
                            <span className="text-emerald-500 font-mono">Total Lote: R$ {prod.totalCost.toFixed(2)}</span>
                          </div>
                          <div className="pt-1 border-t border-white/5 flex justify-between items-center text-xs text-white/60">
                            <span>Custo Unitário ({prod.quantity || 1} un):</span>
                            <span className="font-mono font-bold text-white">R$ {(prod.totalCost / (prod.quantity || 1)).toFixed(2)}</span>
                          </div>
                          {prod.suggestedPrice && (
                            <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[10px] uppercase font-black">
                               <span className="text-white/20 tracking-tighter">Preço Sugerido</span>
                               <span className="text-white font-mono">R$ {prod.suggestedPrice.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            // Load to calculator
                            setSimulationName(prod.name);
                            setSelectedMaterials(prod.items.map(i => ({ materialId: i.materialId, quantity: i.quantity })));
                            setDesiredPrice(prod.suggestedPrice || 0);
                            setQuantity(prod.quantity || 1);
                            setWastePercent(prod.wastePercent || 0);
                            setLaborHours(prod.laborHours || 0);
                            setLaborCostPerHour(prod.laborCostPerHour || 0);
                            setActiveTab('calculator');
                          }}
                          className="flex-1 py-3 bg-white/5 hover:bg-emerald-500 text-white hover:text-black rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          Usar como Base
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Excluir ficha técnica?')) {
                              deleteProduction(prod.id);
                            }
                          }}
                          className="px-4 py-3 bg-red-500/10 hover:bg-red-500 text-white rounded-xl transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                  {filteredProductions.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <FileText className="w-16 h-16 text-white/5 mx-auto mb-4" />
                      <p className="text-white/20 uppercase font-black tracking-widest text-xs">Nenhuma produção salva</p>
                    </div>
                  )}
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden Buffer for Printing */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div id="production-calculator-report" className="bg-white text-black p-8 w-[210mm]">
          <div className="text-center mb-8 border-b-2 border-black pb-4">
            <h1 className="text-2xl font-bold uppercase tracking-tighter">Cálculo de Produção</h1>
            <p className="text-xs uppercase font-bold tracking-widest mt-1">{simulationName}</p>
            <div className="flex justify-between items-center mt-4 text-[10px] font-bold uppercase">
              <span>Data: {new Date().toLocaleDateString()}</span>
              <span>Quantidade: {quantity} unidades</span>
            </div>
          </div>
          
          <table className="w-full border-collapse mb-8">
            <thead>
              <tr className="border-b border-black text-[10px] font-bold uppercase">
                <th className="py-2 text-left">Insumo</th>
                <th className="py-2 text-right">Qtd</th>
                <th className="py-2 text-right">Unitário</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="text-[10px]">
              {results.items.map((item, idx) => {
                const mat = materials.find(m => m.id === item.materialId);
                return (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-2">{mat?.name}</td>
                    <td className="py-2 text-right">{item.quantity} {mat?.unit}</td>
                    <td className="py-2 text-right">R$ {mat?.unitCost.toFixed(2)}</td>
                    <td className="py-2 text-right font-bold">R$ {item.cost.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end pt-4 border-t-2 border-black space-y-2 flex-col items-end">
            <div className="flex justify-between w-64 text-[10px] uppercase font-bold">
              <span>Custo de Materiais:</span>
              <span>R$ {results.materialCost.toFixed(2)}</span>
            </div>
            {results.wasteCost > 0 && (
              <div className="flex justify-between w-64 text-[10px] uppercase font-bold text-red-500">
                <span>Perda / Refugo ({wastePercent}%):</span>
                <span>R$ {results.wasteCost.toFixed(2)}</span>
              </div>
            )}
            {results.laborCost > 0 && (
              <div className="flex justify-between w-64 text-[10px] uppercase font-bold text-blue-500">
                <span>Mão de Obra ({laborHours}h):</span>
                <span>R$ {results.laborCost.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between w-64 text-[10px] uppercase font-bold">
              <span>Custo de Máquina:</span>
              <span>R$ {results.machineCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-64 text-xl font-black uppercase">
              <span>Custo Total:</span>
              <span>R$ {results.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between w-64 text-sm font-bold text-gray-500 uppercase border-t border-gray-200 pt-2">
              <span>Custo Unitário:</span>
              <span>R$ {results.unit.toFixed(2)}</span>
            </div>
            {desiredPrice > 0 && (
              <div className="flex justify-between w-64 text-lg font-black text-emerald-600 uppercase pt-2">
                <span>Preço Venda:</span>
                <span>R$ {desiredPrice.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        <div id="production-recipe-report" className="bg-white text-black p-8 w-[210mm]">
           <div className="text-center p-20 text-black">Ficha Técnica Detalhada</div>
        </div>
      </div>

      {/* Material Modal */}
      {renderMaterialModal()}
    </div>
  );
}
