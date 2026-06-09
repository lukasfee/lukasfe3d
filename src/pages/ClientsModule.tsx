import React, { useState, useMemo, FormEvent, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Search, 
  Plus, 
  UserPlus, 
  Edit2, 
  Trash2, 
  X,
  Save,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Image as ImageIcon,
  Camera,
  MessageCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore, Client } from '../store';
import MasterPasswordModal from '../components/MasterPasswordModal';

export default function ClientsModule() {
  const clients = useStore(state => state.clients);
  const addClient = useStore(state => state.addClient);
  const updateClient = useStore(state => state.updateClient);
  const sales = useStore(state => state.sales);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [isMasterPasswordModalOpen, setIsMasterPasswordModalOpen] = useState(false);
  const [pendingClientAction, setPendingClientAction] = useState<Client | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // Reset page when filters change to prevent empty states
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLetter, showInactive]);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    whatsapp: '',
    document: '',
    address: '',
    neighborhood: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
    image: ''
  });

  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchesSearch = searchTerm === '' || 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.document && c.document.includes(searchTerm));
      
      const matchesLetter = !selectedLetter || 
        c.name.toUpperCase().startsWith(selectedLetter);

      const matchesActive = showInactive || c.active !== false;

      return matchesSearch && matchesLetter && matchesActive;
    });
  }, [clients, searchTerm, selectedLetter, showInactive]);

  const pagedClients = useMemo(() => {
    return filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredClients, currentPage]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage) || 1;

  const [isSearchingCEP, setIsSearchingCEP] = useState(false);

  const fetchCEP = async (cep: string) => {
    const cleanCEP = cep.replace(/\D/g, '');
    if (cleanCEP.length !== 8) return;

    setIsSearchingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: data.logradouro,
          neighborhood: data.bairro,
          city: data.localidade,
          state: data.uf,
          zip: cleanCEP
        }));
      }
    } catch (error) {
      console.error('Error fetching CEP:', error);
    } finally {
      setIsSearchingCEP(false);
    }
  };

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        email: client.email,
        phone: client.phone || '',
        whatsapp: client.whatsapp || '',
        document: client.document || '',
        address: client.address || '',
        neighborhood: client.neighborhood || '',
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        notes: client.notes || '',
        image: client.image || ''
      });
    } else {
      setEditingClient(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        whatsapp: '',
        document: '',
        address: '',
        neighborhood: '',
        city: '',
        state: '',
        zip: '',
        notes: '',
        image: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateClient(editingClient.id, formData);
    } else {
      addClient(formData);
    }
    setIsModalOpen(false);
  };

  const toggleStatus = (client: Client) => {
    if (client.active) {
      setPendingClientAction(client);
      setIsMasterPasswordModalOpen(true);
    } else {
      updateClient(client.id, { active: true });
    }
  };

  const handleMasterPasswordConfirm = () => {
    if (pendingClientAction) {
      updateClient(pendingClientAction.id, { active: false });
      setPendingClientAction(null);
    }
    setIsMasterPasswordModalOpen(false);
  };

  return (
    <div className="h-full flex flex-col gap-3 md:overflow-hidden md:max-h-[calc(100vh-100px)]">
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-500" />
            Clientes
          </h1>
          <p className="text-[8px] uppercase font-black tracking-[0.3em] text-white/30 leading-none mt-1">Base de Dados e CRM</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowInactive(!showInactive)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all border border-white/5 text-[10px] font-black uppercase tracking-wider select-none cursor-pointer",
              showInactive ? "bg-amber-500 text-black border-amber-500/20 shadow-lg shadow-amber-500/10" : "bg-white/5 text-white/40 hover:text-white"
            )}
            title={showInactive ? "Esconder clientes inativos" : "Exibir todos os clientes, incluindo inativos"}
          >
            <Filter className="w-3.5 h-3.5" />
            {showInactive ? "Inativos Visíveis" : "Ver Inativos"}
          </button>
          <button 
            onClick={() => setIsSearchVisible(!isSearchVisible)}
            className={cn(
              "p-2 rounded-lg transition-all border border-white/5 cursor-pointer",
              isSearchVisible ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "bg-white/5 text-white/40 hover:text-white"
            )}
            title="Abrir Busca"
          >
            <Search className="w-4 h-4" />
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-emerald-500/10 group"
          >
            <UserPlus className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" /> Novo Cliente
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isSearchVisible && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-[#121212] border border-white/5 rounded-xl p-2 shadow-inner"
          >
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 w-3.5 h-3.5" />
              <input 
                type="text" 
                placeholder="Buscar por nome, documento, e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs text-white focus:border-emerald-500/50 outline-none transition-all placeholder:text-white/10"
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-[#121212] border border-white/5 rounded-2xl p-1.5 flex items-center justify-between gap-4 shrink-0 shadow-xl">
        <div className="flex items-center gap-1 flex-wrap flex-1">
          <button 
            onClick={() => setSelectedLetter(null)}
            className={cn(
              "px-4 h-9 rounded-xl text-[10px] font-black uppercase transition-all tracking-widest",
              !selectedLetter ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20" : "bg-white/5 text-white/30 hover:text-white"
            )}
          >
            Todos Clientes
          </button>
          <div className="w-px h-6 bg-white/10 mx-2 hidden md:block" />
          <div className="flex items-center gap-1">
            {alphabet.map(letter => (
              <button 
                key={letter}
                onClick={() => setSelectedLetter(letter === selectedLetter ? null : letter)}
                className={cn(
                  "w-8 h-8 md:w-9 md:h-9 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center tracking-tighter",
                  selectedLetter === letter 
                    ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-110 z-10" 
                    : "bg-black/40 text-white/20 hover:text-white hover:bg-white/5 border border-white/5"
                )}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-black/40 border border-white/5 rounded-2xl shrink-0 shadow-inner">
           <div className="flex flex-col items-center">
              <span className="text-[7px] uppercase font-black text-white/20 tracking-wider">Total</span>
              <span className="text-[10px] font-bold text-white">{clients.length}</span>
           </div>
           <div className="w-px h-3 bg-white/5" />
           <div className="flex flex-col items-center">
              <span className="text-[7px] uppercase font-black text-white/20 tracking-wider">Ativos</span>
              <span className="text-[10px] font-bold text-emerald-500">{clients.filter(c => c.active).length}</span>
           </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {pagedClients.map((client) => (
            <motion.div 
              layout
              key={client.id}
              onClick={() => handleOpenModal(client)}
              className={cn(
                "bg-[#121212] border border-white/5 rounded-xl p-3 flex flex-col gap-2 group hover:border-emerald-500/30 transition-all relative overflow-hidden cursor-pointer",
                !client.active && "opacity-50 grayscale"
              )}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/20 font-bold group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-colors overflow-hidden shrink-0">
                    {client.image ? (
                       <img src={client.image} alt={client.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      client.name.charAt(0)
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-white truncate">{client.name}</h3>
                    <span className="text-[7px] text-white/30 uppercase font-black tracking-widest block truncate">Desde {new Date(client.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenModal(client); }}
                    className="p-1.5 hover:bg-white/5 rounded-md text-white/20 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleStatus(client); }}
                    title={client.active ? "Inativar" : "Ativar"}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      client.active ? "text-white/20 hover:text-red-400" : "text-emerald-500 hover:text-emerald-400"
                    )}
                  >
                    {client.active ? <Trash2 className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1 py-1">
                <div className="flex items-center gap-2 text-[9px] text-white/40 truncate">
                  <Mail className="w-2.5 h-2.5 shrink-0" /> {client.email}
                </div>
                {client.phone && (
                  <div className="flex items-center gap-2 text-[9px] text-white/40">
                    <Phone className="w-2.5 h-2.5 shrink-0" /> {client.phone}
                  </div>
                )}
                {client.city && (
                  <div className="flex items-center gap-2 text-[9px] text-white/40 truncate">
                    <MapPin className="w-2.5 h-2.5 shrink-0" /> {client.city}, {client.state}
                  </div>
                )}
              </div>

              <div className="mt-auto pt-2 flex items-center justify-between border-t border-white/5">
                 <div className="flex items-center gap-1">
                    <div className={cn("w-1 h-1 rounded-full", client.active ? "bg-emerald-500" : "bg-red-500")} />
                    <span className="text-[7px] font-black uppercase text-white/20 tracking-widest">{client.active ? 'Ativo' : 'Offline'}</span>
                 </div>
                 <button 
                   onClick={(e) => { e.stopPropagation(); setHistoryClient(client); }}
                   className="text-[7px] font-black uppercase text-emerald-500/50 hover:text-emerald-500 transition-colors tracking-widest cursor-pointer"
                 >
                    Histórico
                 </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Clients Pagination controls */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 mt-4 border-t border-white/5 select-none font-mono text-[9px] font-black uppercase text-white/40 shrink-0">
            <div>
              Exibindo {currentPage} de {totalPages} Páginas ({filteredClients.length} clientes)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="p-1.5 border border-white/5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                title="Primeira Página"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="px-2.5 py-1.5 border border-white/5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none tracking-widest transition-colors text-[8px]"
              >
                Anterior
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                    if (pageNum + (4 - i) > totalPages) {
                      pageNum = totalPages - 4 + i;
                    }
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-6.5 h-6.5 rounded-lg font-bold flex items-center justify-center transition-all text-[8px]",
                        currentPage === pageNum 
                          ? "bg-emerald-500 text-black shadow-md shadow-emerald-500/10" 
                          : "bg-white/5 text-white/30 hover:bg-white/10"
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="px-2.5 py-1.5 border border-white/5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none tracking-widest transition-colors text-[8px]"
              >
                Próximo
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1.5 border border-white/5 rounded-lg hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-colors"
                title="Última Página"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setIsModalOpen(false)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm z-0" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              className="relative z-10 w-full max-w-2xl bg-[#121212] border border-white/10 rounded-xl p-4 shadow-2xl flex flex-col max-h-[95vh]"
            >
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-white leading-none">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
                  <p className="text-[9px] text-white/30 uppercase font-black tracking-widest mt-1">Cadastro Unificado</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-1.5 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* Image Picker */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-24 h-24 rounded-xl border-2 border-dashed border-white/10 bg-black/40 flex flex-col items-center justify-center cursor-pointer group hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all overflow-hidden relative"
                    >
                      {formData.image ? (
                        <>
                          <img src={formData.image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                             <Camera className="w-6 h-6 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center">
                          <ImageIcon className="w-6 h-6 text-white/20 mb-1 group-hover:text-emerald-500 transition-colors" />
                          <span className="text-[7px] font-black uppercase text-white/30 group-hover:text-white transition-colors text-center px-2">Adicionar Foto</span>
                        </div>
                      )}
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleImageChange} 
                      className="hidden" 
                      accept="image/*"
                    />
                  </div>

                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Nome Completo / Razão</label>
                      <input 
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">CPF / CNPJ</label>
                      <input 
                        value={formData.document}
                        onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">E-mail Principal</label>
                      <input 
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                       <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Status</label>
                       <select 
                         className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                         onChange={(e) => setFormData(prev => ({ ...prev }))}
                       >
                         <option value="active">Ativo</option>
                         <option value="inactive">Inativo</option>
                       </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/5 pt-3">
                  <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1 flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5" /> Fone
                    </label>
                    <input 
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1 flex items-center gap-1">
                      <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                    </label>
                    <input 
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-1 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">CEP</label>
                    <input 
                      value={formData.zip}
                      onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                      onBlur={(e) => fetchCEP(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-1 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Estado (UF)</label>
                    <input 
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                      maxLength={2}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                   <div className="sm:col-span-2 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Endereço / Logradouro</label>
                    <input 
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Bairro</label>
                    <input 
                      value={formData.neighborhood}
                      onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1">Cidade</label>
                    <input 
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[8px] uppercase font-black text-white/30 tracking-widest ml-1 flex items-center gap-1">
                       <FileText className="w-2.5 h-2.5" /> Observações
                    </label>
                    <input 
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full bg-black/40 border border-white/5 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-white/5"
                      placeholder="Alguma nota importante sobre o cliente..."
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-3 shrink-0">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] uppercase font-black tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" /> {editingClient ? 'Atualizar Cliente' : 'Salvar Cliente'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setHistoryClient(null)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 10 }} 
              className="relative w-full max-w-2xl bg-[#121212] border border-white/10 rounded-xl p-4 shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between mb-3 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-white leading-none">Histórico de Compras</h2>
                  <p className="text-[9px] text-emerald-400 uppercase font-black tracking-widest mt-1">
                    Cliente: {historyClient.name}
                  </p>
                </div>
                <button onClick={() => setHistoryClient(null)} className="p-1.5 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                {sales.filter(s => s.clientId === historyClient.id).length === 0 ? (
                  <div className="py-12 text-center text-white/20 flex flex-col items-center justify-center gap-2">
                    <FileText className="w-12 h-12" />
                    <p className="text-[10px] uppercase font-black tracking-wider">Nenhum pedido encontrado para este cliente</p>
                  </div>
                ) : (
                  sales.filter(s => s.clientId === historyClient.id).map(sale => (
                    <div key={sale.id} className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-black text-white/30 uppercase font-mono">Pedido #{sale.orderNumber}</span>
                          <span className="text-[9px] text-white/20 ml-2 font-mono">
                            {new Date(sale.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                          sale.status === 'entregue' || sale.status === 'finalizado' ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                        )}>
                          {sale.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="divide-y divide-white/5">
                        {sale.items.map((item, idx) => (
                          <div key={idx} className="py-2 text-[10px] flex items-center justify-between">
                            <span className="text-white/60 font-bold">
                              {item.quantity}x {item.name}
                            </span>
                            <span className="text-white/40 font-mono">
                              R$ {(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-between items-center text-xs font-bold text-emerald-400 pt-1 border-t border-white/5">
                        <span className="uppercase text-[9px] font-black tracking-wider text-white/30">Total Pago</span>
                        <span className="font-mono">R$ {sale.total.toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <MasterPasswordModal 
        isOpen={isMasterPasswordModalOpen}
        onClose={() => setIsMasterPasswordModalOpen(false)}
        onConfirm={handleMasterPasswordConfirm}
        description="Autorização gerencial necessária para inativar ou excluir registros de clientes."
      />
    </div>
  );
}
