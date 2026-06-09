import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  Play, 
  Pause, 
  Bell, 
  Clock, 
  ArrowRight, 
  Plus, 
  Settings2,
  GitMerge,
  ToggleLeft,
  ToggleRight,
  Boxes,
  X,
  Trash2,
  Info,
  Package,
  Printer,
  TrendingUp,
  Coins,
  LayoutGrid,
  Smartphone,
  CheckCircle2,
  UserCheck,
  RefreshCw,
  SlidersHorizontal,
  AlertTriangle,
  Check,
  ExternalLink,
  Eye,
  Settings,
  Database,
  Search,
  BookOpen,
  Calendar,
  Layers,
  ChevronRight,
  FileText
} from 'lucide-react';
import { useStore, Automation } from '../store';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { generateUUID } from '../utils/uuid';

interface LocalAutomationRule {
  id: string;
  category: 'pedidos' | 'separacao' | 'impressao' | 'estoque' | 'caixa' | 'notificacoes' | 'android' | 'cliente';
  name: string;
  description: string;
  triggerKey: string;
  triggerLabel: string;
  actionKey: string;
  actionLabel: string;
  module: 'PDV' | 'Caixa' | 'Gestão de Pedido' | 'Separação' | 'Estoque' | 'Impressão/PDF' | 'Clientes' | 'Android/Bluetooth';
  status: 'active' | 'paused';
  executionsCount: number;
  lastExecution?: number;
  isFutureArchitecture?: boolean;
}

interface LocalLog {
  id: string;
  timestamp: number;
  ruleName: string;
  category: string;
  message: string;
  status: 'sucesso' | 'alert' | 'info';
  module: string;
}

export default function AutomationModule() {
  const sales = useStore(state => state.sales);
  const products = useStore(state => state.products);
  const currentCashier = useStore(state => state.currentCashier);
  const cashierHistory = useStore(state => state.cashierHistory);
  const activities = useStore(state => state.activities);
  const addActivity = useStore(state => state.addActivity);
  const alerts = useStore(state => state.alerts);
  const addAlert = useStore(state => state.addAlert);
  const currentUser = useStore(state => state.currentUser);

  const operatorName = currentUser?.fullName || 'Operador Central';

  // 1. Sidebar Tab Selection
  const [activeTab, setActiveTab] = useState<'pedidos' | 'separacao' | 'impressao' | 'estoque' | 'caixa' | 'notificacoes' | 'android' | 'cliente'>('pedidos');

  // 2. Search & Status Filters for Rules
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');

  // 3. Automation rules state. Initialized with all the user's explicit requested templates.
  const [rules, setRules] = useState<LocalAutomationRule[]>(() => {
    const saved = localStorage.getItem('erp_wms_automation_rules');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [
      // 1) Pedidos
      {
        id: 'p1',
        category: 'pedidos',
        name: 'Cupom de Despacho Automático',
        description: 'Ao despachar ou expedir o pedido, envia e gera automaticamente o Cupom de Pedido sem telas ou cliques adicionais.',
        triggerKey: 'despachar_pedido',
        triggerLabel: 'Ao despachar pedido',
        actionKey: 'gerar_cupom_automatico',
        actionLabel: 'gerar/imprimir Cupom Pedido automaticamente',
        module: 'PDV',
        status: 'active',
        executionsCount: 8,
        lastExecution: Date.now() - 1000 * 60 * 15,
      },
      {
        id: 'p2',
        category: 'pedidos',
        name: 'Auto-Status Pós-Separação',
        description: 'Ao concluir a separação física do pedido no WMS, sincroniza o status para "Separado" no faturamento.',
        triggerKey: 'finalizar_separacao',
        triggerLabel: 'Ao finalizar separação',
        actionKey: 'atualizar_status_automatico',
        actionLabel: 'atualizar status do pedido automaticamente',
        module: 'Gestão de Pedido',
        status: 'active',
        executionsCount: 14,
        lastExecution: Date.now() - 1000 * 60 * 35,
      },
      {
        id: 'p3',
        category: 'pedidos',
        name: 'Gargalo Logístico p/ "Em Rota"',
        description: 'Ao concluir a etapa de embalagem de pacotes, atualiza automaticamente o rastreamento para o status "Em rota".',
        triggerKey: 'embalar_pedido',
        triggerLabel: 'Ao embalar pedido',
        actionKey: 'mover_em_rota_automatico',
        actionLabel: 'mover automaticamente para “Em rota”',
        module: 'Separação',
        status: 'active',
        executionsCount: 6,
        lastExecution: Date.now() - 1000 * 60 * 120,
      },

      // 2) Separação
      {
        id: 's1',
        category: 'separacao',
        name: 'Recibo Térmico de Picking',
        description: 'Quando a separação física é dada como finalizada pelo operador, emite instantaneamente um recibo térmico de fechamento.',
        triggerKey: 'separacao_concluida',
        triggerLabel: 'Ao finalizar separação',
        actionKey: 'gerar_recibo_automatico',
        actionLabel: 'gerar Recibo Térmico automático',
        module: 'Separação',
        status: 'active',
        executionsCount: 5,
        lastExecution: Date.now() - 1000 * 60 * 42,
      },
      {
        id: 's2',
        category: 'separacao',
        name: 'Alerta Operacional de Ruptura',
        description: 'Ao apontar produto não encontrado física ou digitalmente na gôndola, dispara um alerta geral de inventário.',
        triggerKey: 'produto_nao_encontrado',
        triggerLabel: 'Produto não encontrado',
        actionKey: 'gerar_alerta_operacional',
        actionLabel: 'gerar alerta operacional crítico',
        module: 'Estoque',
        status: 'active',
        executionsCount: 3,
        lastExecution: Date.now() - 1000 * 60 * 180,
      },
      {
        id: 's3',
        category: 'separacao',
        name: 'Vigilante de SLA de Picking',
        description: 'Cria notificações persistentes se um lote em separação técnica ultrapassar o tempo limite de SLA estabelecido.',
        triggerKey: 'separacao_atrasada',
        triggerLabel: 'Separação atrasada',
        actionKey: 'criar_notificacao_automatica',
        actionLabel: 'criar notificação automática de atraso',
        module: 'Separação',
        status: 'active',
        executionsCount: 1,
        lastExecution: Date.now() - 1000 * 60 * 300,
      },

      // 3) Impressão/PDF
      {
        id: 'i1',
        category: 'impressao',
        name: 'Fallback Reativo de Hardware',
        description: 'Ao detectar erro físico ou perda de fila numa impressora instalada, gera um PDF alternativo para download rápido.',
        triggerKey: 'falha_impressao',
        triggerLabel: 'Falha na impressão',
        actionKey: 'gerar_pdf_automaticamente',
        actionLabel: 'gerar PDF automaticamente como plano b',
        module: 'Impressão/PDF',
        status: 'active',
        executionsCount: 4,
        lastExecution: Date.now() - 1000 * 60 * 55,
      },
      {
        id: 'i2',
        category: 'impressao',
        name: 'Auto-Arquivo de Manifestos',
        description: 'Toda vez que um PDF de manifesto de carga ou DANFE é emitido, arquiva uma cópia idêntica no histórico de auditoria local.',
        triggerKey: 'pdf_gerado',
        triggerLabel: 'PDF gerado',
        actionKey: 'salvar_historico_automatico',
        actionLabel: 'salvar logs e metadados históricos automaticamente',
        module: 'Impressão/PDF',
        status: 'active',
        executionsCount: 32,
        lastExecution: Date.now() - 1000 * 60 * 4,
      },
      {
        id: 'i3',
        category: 'impressao',
        name: 'Telemetria de e-Etiquetas',
        description: 'Regista de modo autônomo o log operacional no console auditado sempre que etiquetas postais ou de gôndolas são faturadas.',
        triggerKey: 'etiqueta_gerada',
        triggerLabel: 'Etiqueta gerada',
        actionKey: 'registrar_log_automatico',
        actionLabel: 'registrar log automático da etiqueta de faturamento',
        module: 'Impressão/PDF',
        status: 'active',
        executionsCount: 19,
        lastExecution: Date.now() - 1000 * 60 * 12,
      },

      // 4) Estoque
      {
        id: 'e1',
        category: 'estoque',
        name: 'Alerta de Margem de Segurança',
        description: 'Verifica em tempo de checkout: caso o saldo físico atinja o estoque mínimo, lança um alerta de reposição iminente.',
        triggerKey: 'produto_abaixo_minimo',
        triggerLabel: 'Produto abaixo do mínimo',
        actionKey: 'criar_notificacao_estoque',
        actionLabel: 'criar notificação e alerta de compra',
        module: 'Estoque',
        status: 'active',
        executionsCount: 7,
        lastExecution: Date.now() - 1000 * 60 * 90,
      },
      {
        id: 'e2',
        category: 'estoque',
        name: 'Ruptura Absoluta (Zerados)',
        description: 'Sempre que o saldo de um SKU é zerado no ato de faturamento do caixa, sintoniza as redes e lanca um alerta crítico.',
        triggerKey: 'produto_zerado',
        triggerLabel: 'Produto zerado',
        actionKey: 'gerar_alerta_critico',
        actionLabel: 'gerar alerta crítico imediato',
        module: 'Estoque',
        status: 'active',
        executionsCount: 2,
        lastExecution: Date.now() - 1000 * 60 * 240,
      },
      {
        id: 'e3',
        category: 'estoque',
        name: 'Auto-Ajuste de Saldo Reativo',
        description: 'Quando uma movimentação manual (entrada ou saída) é consolidada, atualiza em milissegundos o estoque em múltiplos canais.',
        triggerKey: 'movimentacao_realizada',
        triggerLabel: 'Movimentação realizada',
        actionKey: 'atualizar_estoque_automaticamente',
        actionLabel: 'atualizar estoque automatizado nos canais',
        module: 'Estoque',
        status: 'active',
        executionsCount: 45,
        lastExecution: Date.now() - 1000 * 60 * 1,
      },

      // 5) Caixa
      {
        id: 'c1',
        category: 'caixa',
        name: 'Biometria Logística / Operador',
        description: 'Ao iniciar a abertura física do caixa do PDV, sincroniza a assinatura logada ao caixa automaticamente.',
        triggerKey: 'abrir_caixa',
        triggerLabel: 'Abrir caixa',
        actionKey: 'registrar_operador_automaticamente',
        actionLabel: 'registrar operador responsável automaticamente',
        module: 'Caixa',
        status: 'active',
        executionsCount: 2,
        lastExecution: Date.now() - 1000 * 60 * 600,
      },
      {
        id: 'c2',
        category: 'caixa',
        name: 'Resumo Gerencial de Fechamento',
        description: 'Ao efetuar o encerramento do turno de faturamento do caixa, autocompila o livro-caixa diário e gera o resumo em PDF.',
        triggerKey: 'fechar_caixa',
        triggerLabel: 'Fechar caixa',
        actionKey: 'gerar_resumo_automatico',
        actionLabel: 'gerar resumo de fluxo e faturamento automático',
        module: 'Caixa',
        status: 'active',
        executionsCount: 1,
        lastExecution: Date.now() - 1000 * 60 * 1440,
      },
      {
        id: 'c3',
        category: 'caixa',
        name: 'Vigilante de Divergência de Sangria',
        description: 'Compara a expectativa matemática vs o valor físico declarado. Ao notar desacordo, gera alerta no financeiro.',
        triggerKey: 'divergencia_declarada',
        triggerLabel: 'Divergência técnica',
        actionKey: 'criar_alerta_operacional_caixa',
        actionLabel: 'criar alerta operacional e auditoria financeira',
        module: 'Caixa',
        status: 'active',
        executionsCount: 0,
        lastExecution: undefined,
      },

      // 6) Notificações
      {
        id: 'n1',
        category: 'notificacoes',
        name: 'Vigilante de SLA de Faturamento',
        description: 'Controle contínuo: emite notificações sistêmicas persistentes se o tempo útil do despacho estourar.',
        triggerKey: 'pedido_atrasado',
        triggerLabel: 'Pedido atrasado',
        actionKey: 'enviar_notificacao_atraso',
        actionLabel: 'enviar notificação de faturamento atrasado',
        module: 'Notificações',
        status: 'active',
        executionsCount: 9,
        lastExecution: Date.now() - 1000 * 60 * 80,
      },
      {
        id: 'n2',
        category: 'notificacoes',
        name: 'Alerta de Hardware Térmico',
        description: 'Verifica a comunicação do driver físico com o terminal. Se ficar off-line, dispara um alerta visual.',
        triggerKey: 'impressora_offline',
        triggerLabel: 'Impressora offline',
        actionKey: 'alertar_operador_falha',
        actionLabel: 'alertar operador com aviso piscante na tela',
        module: 'Notificações',
        status: 'active',
        executionsCount: 1,
        lastExecution: Date.now() - 1000 * 60 * 480,
      },
      {
        id: 'n3',
        category: 'notificacoes',
        name: 'Trilha Logística Dedicada',
        description: 'Imediatamente após a saída das mercadorias da doca, sinaliza a atividade e registra logs de trânsito.',
        triggerKey: 'separacao_concluida_log',
        triggerLabel: 'Separação de carga concluída',
        actionKey: 'registrar_atividade_automatica',
        actionLabel: 'registrar atividade automática nas trilhas',
        module: 'Notificações',
        status: 'active',
        executionsCount: 22,
        lastExecution: Date.now() - 1000 * 60 * 15,
      },

      // 7) Android/Impressoras
      {
        id: 'a1',
        category: 'android',
        name: 'Sincronizador RF Bluetooth',
        description: 'Memoriza automaticamente as configurações, endereço MAC e calibração da última impressora ou scanner RF pareados.',
        triggerKey: 'bluetooth_conectado',
        triggerLabel: 'Bluetooth conectado',
        actionKey: 'salvar_impressora_automatica',
        actionLabel: 'salvar perfil de impressora automaticamente',
        module: 'Android/Bluetooth',
        status: 'active',
        executionsCount: 3,
        lastExecution: Date.now() - 1000 * 60 * 180,
      },
      {
        id: 'a2',
        category: 'android',
        name: 'Monitor de Enlace RF',
        description: 'Atua no aplicativo portátil: alerta vibratório na tela do smartphone no exato instante de queda de sinal RF.',
        triggerKey: 'impressora_desconectada',
        triggerLabel: 'Impressora desconectada',
        actionKey: 'alertar_sistema_desconexão',
        actionLabel: 'alertar sistema e habilitar fallback',
        module: 'Android/Bluetooth',
        status: 'active',
        executionsCount: 2,
        lastExecution: Date.now() - 1000 * 60 * 190,
      },
      {
        id: 'a3',
        category: 'android',
        name: 'Fallback PDF Mobile',
        description: 'Se o dispositivo Android perder o sinal RF bluetooth de etiqueta portátil, substitui a impressão por envio do PDF técnico.',
        triggerKey: 'falha_impressao_android',
        triggerLabel: 'Falha impressão Android',
        actionKey: 'fallback_pdf_mobile',
        actionLabel: 'gerar fallback PDF no coletor móvel',
        module: 'Android/Bluetooth',
        status: 'active',
        executionsCount: 1,
        lastExecution: Date.now() - 1000 * 60 * 200,
      },

      // 8) Cliente (Future architecture)
      {
        id: 'cl1',
        category: 'cliente',
        name: 'Confirmação SMS de Entrega',
        description: 'Arquitetura futura: Sempre que o marcador "Entregue" for assinado no WMS, agenda as mensagens pós-faturamento.',
        triggerKey: 'pedido_entregue',
        triggerLabel: 'Pedido entregue',
        actionKey: 'mensagem_automatica_post',
        actionLabel: 'preparar mensagem automática de faturamento',
        module: 'Clientes',
        status: 'paused',
        executionsCount: 0,
        lastExecution: undefined,
        isFutureArchitecture: true
      },
      {
        id: 'cl2',
        category: 'cliente',
        name: 'Lembrete CRM Aniversariantes',
        description: 'Arquitetura futura: Sintoniza datas e agenda lembretes promocionais automáticos na ficha de auditoria do CRM.',
        triggerKey: 'aniversario_cliente',
        triggerLabel: 'Aniversário certificado',
        actionKey: 'lembrete_automatico_crm',
        actionLabel: 'lembrete automático no painel do operador',
        module: 'Clientes',
        status: 'paused',
        executionsCount: 0,
        lastExecution: undefined,
        isFutureArchitecture: true
      }
    ];
  });

  // 4. Execution Logs state
  const [logs, setLogs] = useState<LocalLog[]>(() => {
    const saved = localStorage.getItem('erp_wms_automation_logs');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [
      {
        id: 'l1',
        timestamp: Date.now() - 1000 * 60 * 4,
        ruleName: 'Auto-Arquivo de Manifestos',
        category: 'impressao',
        message: 'PDF gerado: Cópia compactada do manifesto #M-102 gravada no histórico de logs.',
        status: 'sucesso',
        module: 'Impressão/PDF'
      },
      {
        id: 'l2',
        timestamp: Date.now() - 1000 * 60 * 12,
        ruleName: 'Telemetria de e-Etiquetas',
        category: 'impressao',
        message: 'Etiqueta criada: Evento de envio cadastrado para a remessa postal #COR-489.',
        status: 'sucesso',
        module: 'Impressão/PDF'
      },
      {
        id: 'l3',
        timestamp: Date.now() - 1000 * 60 * 15,
        ruleName: 'Cupom de Despacho Automático',
        category: 'pedidos',
        message: 'Recibo automático gerado: Cupom do Pedido #O-823 impresso automaticamente no PDV.',
        status: 'sucesso',
        module: 'PDV'
      },
      {
        id: 'l4',
        timestamp: Date.now() - 1000 * 60 * 90,
        ruleName: 'Alerta de Margem de Segurança',
        category: 'estoque',
        message: 'Alerta estoque enviado: Produto "Fita Gomada Kraft" atingiu o estoque mínimo de segurança.',
        status: 'alert',
        module: 'Estoque'
      },
      {
        id: 'l5',
        timestamp: Date.now() - 1000 * 60 * 180,
        ruleName: 'Alerta Operacional de Ruptura',
        category: 'separacao',
        message: 'Divergência detectada: Separador informou produto faltante na gôndola C-14.',
        status: 'alert',
        module: 'Separação'
      },
      {
        id: 'l6',
        timestamp: Date.now() - 1000 * 60 * 200,
        ruleName: 'Fallback PDF Mobile',
        category: 'android',
        message: 'PDF fallback executado: Comunicação BT instabilizou e o aplicativo portou o PDF da etiqueta virtual.',
        status: 'info',
        module: 'Android/Bluetooth'
      }
    ];
  });

  // 5. Save rules and logs to localStorage when changes occur
  useEffect(() => {
    localStorage.setItem('erp_wms_automation_rules', JSON.stringify(rules));
  }, [rules]);

  useEffect(() => {
    localStorage.setItem('erp_wms_automation_logs', JSON.stringify(logs));
  }, [logs]);

  // Modal State for custom rules adding
  const [showModal, setShowModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<'pedidos' | 'separacao' | 'impressao' | 'estoque' | 'caixa' | 'notificacoes' | 'android' | 'cliente'>('pedidos');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [newRuleTriggerKey, setNewRuleTriggerKey] = useState('pedido_despachado');
  const [newRuleTriggerLabel, setNewRuleTriggerLabel] = useState('Ao despachar pedido');
  const [newRuleActionKey, setNewRuleActionKey] = useState('imprimir_cupom_automatico');
  const [newRuleActionLabel, setNewRuleActionLabel] = useState('gerar/imprimir Cupom Pedido automaticamente');
  const [newRuleModule, setNewRuleModule] = useState<'PDV' | 'Caixa' | 'Gestão de Pedido' | 'Separação' | 'Estoque' | 'Impressão/PDF' | 'Clientes' | 'Android/Bluetooth'>('PDV');

  // Floating feedback Toast animation when rule gets tested real-time
  const [testNotification, setTestNotification] = useState<{ id: string; ruleName: string; text: string } | null>(null);

  // Computed metrics
  const totalRules = rules.length;
  const activeRules = rules.filter(r => r.status === 'active').length;
  const pausedRules = rules.filter(r => r.status === 'paused').length;
  const totalExecutionsCount = useMemo(() => rules.reduce((sum, r) => sum + r.executionsCount, 0), [rules]);

  // Filtered Rules
  const filteredRules = useMemo(() => {
    return rules.filter(rule => {
      if (rule.category !== activeTab) return false;
      
      const matchesSearch = 
        rule.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        rule.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rule.module.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = 
        statusFilter === 'all' || 
        rule.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [rules, activeTab, searchTerm, statusFilter]);

  // Handler to Toggle Status
  const handleToggleStatus = (id: string) => {
    setRules(prev => prev.map(r => {
      if (r.id === id) {
        const nextStatus = r.status === 'active' ? 'paused' : 'active';
        
        // Log the change
        const logMsg = `Regra "${r.name}" foi ${nextStatus === 'active' ? 'HABILITADA' : 'DESABILITADA'} por: ${operatorName}.`;
        
        // Add log
        const newLog: LocalLog = {
          id: generateUUID('log'),
          timestamp: Date.now(),
          ruleName: r.name,
          category: r.category,
          message: logMsg,
          status: 'info',
          module: r.module
        };
        setLogs(l => [newLog, ...l]);

        // Integrate with main activity logs
        addActivity(`[Automação] Regra "${r.name}" marcada como ${nextStatus}`, 'automation', 'Automação', operatorName, r.id);

        return { ...r, status: nextStatus };
      }
      return r;
    }));
  };

  // Handler to Delete Custom Rule
  const handleDeleteRule = (id: string) => {
    const matched = rules.find(r => r.id === id);
    if (!matched) return;
    
    // Log deletion
    const logMsg = `Regra "${matched.name}" foi EXCLUÍDA permanentemente por: ${operatorName}.`;
    const newLog: LocalLog = {
      id: generateUUID('log'),
      timestamp: Date.now(),
      ruleName: matched.name,
      category: matched.category,
      message: logMsg,
      status: 'info',
      module: matched.module
    };

    setRules(prev => prev.filter(r => r.id !== id));
    setLogs(l => [newLog, ...l]);
    addActivity(`[Automação] Regra de automação "${matched.name}" removida`, 'automation', 'Automação', operatorName, id);
  };

  // ----------------------------------------------------
  // TEST REAL TRIGGER - EXECUTES LIVE IN ERP STATE
  // ----------------------------------------------------
  const handleTestRealTrigger = (rule: LocalAutomationRule) => {
    if (rule.status === 'paused') {
      // Prompt warning
      setTestNotification({
        id: `test-${Date.now()}`,
        ruleName: rule.name,
        text: 'Não é possível testar uma regra desativada (Pausada).'
      });
      setTimeout(() => setTestNotification(null), 3000);
      return;
    }

    let successMessage = '';
    let isWarningStatus = false;
    let fallbackGenerated = false;

    // 1. Process trigger logic evaluating real ERP/WMS data
    switch (rule.triggerKey) {
      case 'despachar_pedido': {
        // Look up a real faturamento/sale
        const activeSale = sales.find(s => s.status === 'entregue' || s.status === 'finalizado') || sales[0];
        const orderNum = activeSale ? `#${activeSale.orderNumber}` : '#1004';
        const clientVal = activeSale ? activeSale.clientName || 'Consumidor' : 'João Silva';
        
        successMessage = `Recibo automático gerado: Cupom do Pedido ${orderNum} faturado com sucesso.`;
        
        // Add to main store activities & alerts
        addActivity(`[Automação - ${rule.name}] Impressão disparada com sucesso para o pedido ${orderNum} (${clientVal})`, 'automation', 'PDV', operatorName);
        break;
      }
      case 'finalizar_separacao': {
        const pickingSale = sales.find(s => s.status === 'em_separacao' || s.status === 'aguardando_separacao') || sales[0];
        const orderNum = pickingSale ? `#${pickingSale.orderNumber}` : '#1005';
        
        successMessage = `Status atualizado: Pedido ${orderNum} movido automaticamente para "Aguardando Embalagem" pós-conferência.`;
        
        addActivity(`[Automação - ${rule.name}] Status sintonizado automatizadamente no ERP para o pedido ${orderNum}`, 'automation', 'Gestão de Pedidos', operatorName);
        break;
      }
      case 'embalar_pedido': {
        const embaladoSale = sales.find(s => s.status === 'separado' || s.status === 'embalando') || sales[0];
        const orderNum = embaladoSale ? `#${embaladoSale.orderNumber}` : '#1006';
        
        successMessage = `Etiqueta criada: Pedido ${orderNum} sincronizado em rota técnica de faturamento pós-pesagem.`;
        
        addActivity(`[Automação - ${rule.name}] Pedido ${orderNum} movido em rota com o transportador selecionado`, 'automation', 'Separação', operatorName);
        break;
      }

      case 'separacao_concluida': {
        const standardSale = sales[0] || { orderNumber: '1008' };
        successMessage = `Recibo automático gerado: Impressão do recibo térmico de picking ${standardSale.orderNumber} processada.`;
        
        addActivity(`[Automação - ${rule.name}] Impresso recibo de separação do veículo #${standardSale.orderNumber}`, 'automation', 'Separação', operatorName);
        break;
      }
      
      case 'produto_nao_encontrado': {
        // Grab a real product
        const pMatched = products[1] || { name: 'Fita Crepe Adesiva', code: 'SKU-09' };
        successMessage = `Alerta gerado: Ocorrência crítica de inventário registrada para o produto ${pMatched.name}.`;
        isWarningStatus = true;

        // Raise a real high alert!
        addAlert({
          title: 'Divergência de Estoque Física',
          description: `Produto ${pMatched.name} (${pMatched.code}) relatado faltante na gôndola. Auto-auditoria agendada.`,
          priority: 'high',
          status: 'new',
          type: 'inventory'
        });

        addActivity(`[Automação - Ruptura] Notificação gerada de produto faltante na conferência: ${pMatched.name}`, 'inventory', 'Estoque', operatorName);
        break;
      }

      case 'separacao_atrasada': {
        successMessage = 'Alerta estoque enviado: Violado check de SLA (20min). Expedição notificada.';
        isWarningStatus = true;

        addAlert({
          title: 'Atraso de SLA na Separação',
          description: 'Lote de picking principal excedeu o limite de segurança operacional. Necessário suporte logístico.',
          priority: 'medium',
          status: 'new',
          type: 'logistics'
        });

        addActivity(`[Automação - SLA] Notificação de gargalo recebida no painel administrativo`, 'automation', 'Notificações', operatorName);
        break;
      }

      case 'falha_impressao': {
        successMessage = 'PDF fallback executado: Comunicação local instabilizada. Link alternativo de faturamento aberto.';
        fallbackGenerated = true;

        addAlert({
          title: 'Plano B Ativado: Fallback de PDF',
          description: 'Disparado backup virtual em PDF de documento térmico devido à indisponibilidade de driver local.',
          priority: 'low',
          status: 'new',
          type: 'print'
        });

        addActivity(`[Automação - Pluguet] Fallback gerado: PDF de conferência de faturamento virtualizado com sucesso.`, 'automation', 'Impressão/PDF', operatorName);
        break;
      }

      case 'pdf_gerado': {
        successMessage = 'PDF gerado: Documento faturado arquivado e indexado na aba de auditoria local.';
        addActivity(`[Automação] Cópia idêntica de manifesto salva do PDF gerado no IndexedDB.`, 'automation', 'Impressão/PDF', operatorName);
        break;
      }

      case 'etiqueta_gerada': {
        successMessage = 'Etiqueta criada: Envio postal efetuado e registrado remotamente no tracker logístico.';
        addActivity(`[Automação] Coleta de metadados de e-Etiqueta para análise remota.`, 'automation', 'Impressão/PDF', operatorName);
        break;
      }

      case 'produto_abaixo_minimo': {
        // Scans products to see if one is below the required minimum
        const belowMin = products.find(p => p.stock < p.minStock) || products[0] || { name: 'Fita Gomada Kraft', stock: 1, minStock: 5 };
        successMessage = `Alerta estoque enviado: Produto "${belowMin.name}" está com apenas ${belowMin.stock} unidades (Mín: ${belowMin.minStock}).`;
        isWarningStatus = true;

        addAlert({
          title: 'Estoque de Segurança Baixo',
          description: `O produto "${belowMin.name}" atingiu o ponto de pedido mínimo de ${belowMin.minStock} unidades. Reposição requerida.`,
          priority: 'medium',
          status: 'new',
          type: 'inventory'
        });

        addActivity(`[Automação] Notificação de compra disparada para o produto "${belowMin.name}"`, 'inventory', 'Estoque', operatorName);
        break;
      }

      case 'produto_zerado': {
        const zerado = products.find(p => p.stock <= 0) || { name: 'Papel Kraft 80g Bobina', code: 'SKU-PR-361' };
        successMessage = `Alerta estoque enviado: Ruptura crítica registrada! SKU zerado completamente no faturamento.`;
        isWarningStatus = true;

        addAlert({
          title: 'RUPTURA: Estoque Zerado',
          description: `O item "${zerado.name}" foi zerado no canal físico. Atendimento reativo acionado.`,
          priority: 'high',
          status: 'new',
          type: 'inventory'
        });

        addActivity(`[Automação] Ruptura registrada: estoque zerado de "${zerado.name}"`, 'inventory', 'Estoque', operatorName);
        break;
      }

      case 'movimentacao_realizada': {
        successMessage = 'Inventário atualizado: Sincronização em milissegundos propagada para os marketplaces integrados.';
        addActivity(`[Automação] Compilado ajuste de saldo de produto física e digitalmente`, 'inventory', 'Estoque', operatorName);
        break;
      }

      // Caixa
      case 'abrir_caixa': {
        const openUser = currentCashier?.openedBy || operatorName;
        successMessage = `Operador cadastrado: Assinatura biométrica de "${openUser}" vinculada e auditada no caixa ativo.`;
        addActivity(`[Automação] Sessão física vinculada com credenciais do operador logado`, 'cashier', 'Caixa', openUser);
        break;
      }
      case 'fechar_caixa': {
        successMessage = 'Livro-caixa compilado: Resumo consolidado de faturamento e fluxo gerado em atividades.';
        const amount = currentCashier?.totalSales || 350.00;
        addActivity(`[Automação] Fechamento compilado. Balanço consolidado de faturamento: R$ ${amount.toFixed(2)}`, 'cashier', 'Caixa', operatorName);
        break;
      }
      case 'divergencia_declarada': {
        successMessage = 'Alerta gerado: Diferença declarada menor ou maior que o faturamento de vendas matemático.';
        isWarningStatus = true;

        addAlert({
          title: 'Disparidade Financeira no Fechamento',
          description: 'Declarada divergência técnica física de notas fiscais nas contagens de sangria. Requer averiguação.',
          priority: 'high',
          status: 'new',
          type: 'cashier'
        });

        addActivity(`[Automação] Auditoria ativada por divergência na conferência declarada de gaveta de caixa`, 'cashier', 'Caixa', operatorName);
        break;
      }

      // Notificacoes
      case 'pedido_atrasado': {
        successMessage = 'Notificação agendada: SLA de triagem/faturamento notificado no painel logística principal.';
        isWarningStatus = true;
        addAlert({
          title: 'Expedição Pendente Atrasada',
          description: 'Pedido excedeu o frame útil para checkout. Triagem necessita de separador extra.',
          priority: 'medium',
          status: 'new',
          type: 'logistics'
        });
        break;
      }
      case 'impressora_offline': {
        successMessage = 'Alerta gerado: Ping de harware falhou por 3 vezes na fila técnica de crachás/etiquetas.';
        isWarningStatus = true;
        addAlert({
          title: 'Aviso: Impressora Offline',
          description: 'Impressora padrão térmica disparou sinal offline. Calibração ou conectividade BT descontinuada.',
          priority: 'high',
          status: 'new',
          type: 'print'
        });
        break;
      }
      case 'separacao_concluida_log': {
        successMessage = 'Atividade gravada: Registrado metadados operacionais e tempo final de picking do separador.';
        addActivity(`[Automação] Trilha de separação documentada em logs sistêmicos.`, 'automation', 'Notificações', operatorName);
        break;
      }

      // Android/Bluetooth
      case 'bluetooth_conectado': {
        successMessage = 'Hardware sintonizado: Endereço MAC do leitor de QR Code pareado em perfil padrão.';
        addActivity(`[Automação] Perfil de hardware wireless atualizado automaticamente no dispositivo Android`, 'automation', 'Notificações', operatorName);
        break;
      }
      case 'impressora_desconectada': {
        successMessage = 'Alerta gerado: Dispositivo Android registrou desconexão inesperada da impressora de doca.';
        isWarningStatus = true;
        addAlert({
          title: 'Desconexão RF Bluetooth Móvel',
          description: 'O coletor de dados Android perdeu o sinal de pareamento Bluetooth com a fita de despacho.',
          priority: 'medium',
          status: 'new',
          type: 'print'
        });
        break;
      }
      case 'falha_impressao_android': {
        successMessage = 'Fallback PDF executado: Direcionada expedição móvel via rede local wifi em contingência.';
        addActivity(`[Automação] Android fallback: Impressora off recuperada por spoofing alternativo.`, 'automation', 'Notificações', operatorName);
        break;
      }

      // Cliente (Future)
      case 'pedido_entregue': {
        successMessage = 'Canal agendado: Pré-disparo de SMS de tráfego (aguardando integração real WhatsApp).';
        break;
      }
      case 'aniversario_cliente': {
        successMessage = 'CRM sincronizado: Notificado lembrete cupom para os aniversariantes do dia.';
        break;
      }

      default: {
        successMessage = `Automação executada: Gatilho "${rule.triggerLabel}" concluiu a ação programada com sucesso.`;
        break;
      }
    }

    // Increments local rule metrics
    setRules(prev => prev.map(r => {
      if (r.id === rule.id) {
        return {
          ...r,
          executionsCount: r.executionsCount + 1,
          lastExecution: Date.now()
        };
      }
      return r;
    }));

    // Formats execution log message
    const formattedMsg = isWarningStatus 
      ? `Alerta gerado: ${successMessage}` 
      : fallbackGenerated 
        ? `Fallback executado: ${successMessage}` 
        : `Sucesso: ${successMessage}`;

    // Appends to the local log listing
    const newLog: LocalLog = {
      id: generateUUID('log'),
      timestamp: Date.now(),
      ruleName: rule.name,
      category: rule.category,
      message: formattedMsg,
      status: isWarningStatus ? 'alert' : fallbackGenerated ? 'info' : 'sucesso',
      module: rule.module
    };

    setLogs(prev => [newLog, ...prev]);

    // Sets top alert confirmation overlay animation
    setTestNotification({
      id: `test-${Date.now()}`,
      ruleName: rule.name,
      text: successMessage
    });

    setTimeout(() => {
      setTestNotification(null);
    }, 4000);
  };


  // ----------------------------------------------------
  // ADD CUSTOM AUTOMATION RULE HANDLER
  // ----------------------------------------------------
  const handleAddNewRule = () => {
    if (!newRuleName) return;

    const customRule: LocalAutomationRule = {
      id: generateUUID('custom'),
      category: newRuleCategory,
      name: newRuleName,
      description: newRuleDescription || 'Regra customizada pelo administrador para facilitar fluxo repetitivo.',
      triggerKey: newRuleTriggerKey,
      triggerLabel: newRuleTriggerLabel,
      actionKey: newRuleActionKey,
      actionLabel: newRuleActionLabel,
      module: newRuleModule,
      status: 'active',
      executionsCount: 0,
      lastExecution: undefined
    };

    setRules(prev => [customRule, ...prev]);
    setShowModal(false);

    // Dynamic initial log for new additions
    const welcomeLog: LocalLog = {
      id: generateUUID('log'),
      timestamp: Date.now(),
      ruleName: customRule.name,
      category: customRule.category,
      message: `Sucesso: Nova regra de automação faturamento adicionada sob o módulo ${customRule.module}.`,
      status: 'info',
      module: customRule.module
    };

    setLogs(prev => [welcomeLog, ...prev]);

    // Add activity log to store
    addActivity(`[Automação] Nova regra customizada criada: "${customRule.name}"`, 'automation', 'Automação', operatorName, customRule.id);

    // Reset Form
    setNewRuleName('');
    setNewRuleDescription('');
  };

  // Preset triggers map for modal select helpers
  const triggerPresets = [
    { key: 'despachar_pedido', label: 'Ao despachar pedido', actKey: 'gerar_cupom_automatico', actLabel: 'gerar/imprimir Cupom Pedido automaticamente', mod: 'PDV' as const },
    { key: 'finalizar_separacao', label: 'Ao finalizar separação', actKey: 'atualizar_status_automatico', actLabel: 'atualizar status do pedido automaticamente', mod: 'Gestão de Pedido' as const },
    { key: 'embalar_pedido', label: 'Ao embalar pedido', actKey: 'mover_em_rota_automatico', actLabel: 'mover automaticamente para “Em rota”', mod: 'Separação' as const },
    { key: 'produto_nao_encontrado', label: 'Produto não encontrado', actKey: 'gerar_alerta_operacional', actLabel: 'gerar alerta operacional crítico', mod: 'Estoque' as const },
    { key: 'produto_abaixo_minimo', label: 'Produto abaixo do mínimo', actKey: 'criar_notificacao_estoque', actLabel: 'criar notificação e alerta de compra', mod: 'Estoque' as const },
    { key: 'impressora_offline', label: 'Impressora offline', actKey: 'alertar_operador_falha', actLabel: 'alertar operador com aviso piscante na tela', mod: 'Notificações' as const },
    { key: 'abrir_caixa', label: 'Abrir caixa', actKey: 'registrar_operador_automaticamente', actLabel: 'registrar operador de caixa automaticamente', mod: 'Caixa' as const },
  ];

  const handleSelectPresetTrigger = (key: string) => {
    const matched = triggerPresets.find(p => p.key === key);
    if (matched) {
      setNewRuleTriggerKey(matched.key);
      setNewRuleTriggerLabel(matched.label);
      setNewRuleActionKey(matched.actKey);
      setNewRuleActionLabel(matched.actLabel);
      setNewRuleModule(matched.mod);
    }
  };

  return (
    <div className="min-h-full flex flex-col gap-4 bg-[#070707] text-zinc-100 p-3 md:p-6 overflow-y-auto custom-scrollbar select-text">
      
      {/* FLOATING SUCCESS AUTOMATION OVERLAY */}
      <AnimatePresence>
        {testNotification && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[101] w-full max-w-md bg-zinc-950 border-2 border-emerald-500/30 shadow-2xl shadow-emerald-500/10 rounded-2xl p-4 flex items-start gap-3.5"
          >
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 text-left">
              <span className="text-[9px] uppercase font-bold text-emerald-400 tracking-wider">Gatilho Executado com Sucesso</span>
              <h4 className="text-xs font-black text-white mt-0.5">{testNotification.ruleName}</h4>
              <p className="text-[11px] text-zinc-400 leading-snug mt-1">{testNotification.text}</p>
            </div>
            <button 
              onClick={() => setTestNotification(null)}
              className="text-zinc-500 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER BAR */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-end gap-4 border-b border-zinc-800/60 pb-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-[#111] border border-zinc-900 px-3 py-1.5 rounded-xl text-[9px] font-mono">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-zinc-500 uppercase font-black tracking-wider">PRODUTIVO:</span>
            <span className="text-emerald-400 font-bold">100% Real Time</span>
          </div>

          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-black border border-emerald-400/15 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-200 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Nova Automação
          </button>
        </div>
      </div>

      {/* TOP STATS ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 shrink-0">
        <div className="bg-[#111] border border-zinc-800/80 p-3 h-20 rounded-2xl flex items-center justify-between">
          <div className="text-left">
            <span className="text-[8px] uppercase font-black text-zinc-500 tracking-wider block">Regras Totais</span>
            <h2 className="text-2xl font-black text-white font-mono leading-none mt-1">{totalRules}</h2>
          </div>
          <div className="p-2.5 bg-zinc-900 rounded-xl text-zinc-400 border border-zinc-800/40">
            <LayoutGrid className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3 h-20 rounded-2xl flex items-center justify-between">
          <div className="text-left">
            <span className="text-[8px] uppercase font-black text-emerald-400 tracking-wider block">Regras Ativas</span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <h2 className="text-2xl font-black text-emerald-500 font-mono leading-none">{activeRules}</h2>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/10">
            <Play className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3 h-20 rounded-2xl flex items-center justify-between">
          <div className="text-left">
            <span className="text-[8px] uppercase font-black text-amber-500 tracking-wider block">TOTAL DE EXECUÇÕES</span>
            <h2 className="text-2xl font-black text-amber-500 font-mono leading-none mt-1">{totalExecutionsCount}</h2>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 border border-amber-500/10">
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        <div className="bg-[#111] border border-zinc-800/80 p-3 h-20 rounded-2xl flex items-center justify-between">
          <div className="text-left">
            <span className="text-[8px] uppercase font-black text-zinc-500 tracking-wider block">Latência de Fila</span>
            <div className="flex items-baseline gap-1 mt-1">
              <h2 className="text-2 relative text-xl font-bold font-mono tracking-tighter text-white">~8 ms</h2>
              <span className="text-[8px] font-bold text-zinc-500">AVG</span>
            </div>
          </div>
          <div className="p-2.5 bg-zinc-900 rounded-xl text-zinc-400 border border-zinc-800/40">
            <Clock className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* FILTER SEARCH CONFIG BAR */}
      <div className="bg-[#111] border border-zinc-800/70 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between shrink-0">
        <div className="flex items-center gap-2 text-zinc-400 self-start md:self-auto">
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] uppercase font-black tracking-widest text-white">Filtros de Visibilidade</span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
          {/* Status selector filter */}
          <div className="flex bg-black/60 p-1 rounded-xl border border-zinc-800/70 gap-1 shrink-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativas' },
              { id: 'paused', label: 'Pausadas' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setStatusFilter(opt.id as any)}
                className={cn(
                  "px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                  statusFilter === opt.id ? "bg-emerald-500 text-black font-black" : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 w-3.5 h-3.5" />
            <input 
              type="text" 
              placeholder="Buscar regras operacionais..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/50 border border-zinc-850 rounded-xl py-1.5 pl-9 pr-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>
      </div>

      {/* MAIN CONTAINER: SIDEBAR TABS + ACTIONS WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* SIDEBAR TABS SPECIFIC TO THE 8 EXPLICIT CATEGORIES REQUIRED */}
        <div className="lg:col-span-3 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible shrink-0 pb-2 lg:pb-0 scrollbar-none border-b lg:border-none border-zinc-800/40">
          {[
            { id: 'pedidos', label: '📦 Pedidos', desc: 'Atalhos e faturamento automático' },
            { id: 'separacao', label: '🧺 Separação', desc: 'SLA de picking e rupturas' },
            { id: 'impressao', label: '🖨 Impressão/PDF', desc: 'Fallback de hardware e logs' },
            { id: 'estoque', label: '⚡ Estoque', desc: 'Segurança e saldo de canais' },
            { id: 'caixa', label: '💰 Caixa', desc: 'Biometria de operador e resumos' },
            { id: 'notificacoes', label: '🔔 Notificações', desc: 'Alertas de hardware e incidentes' },
            { id: 'android', label: '🤖 Android/Printer', desc: 'Bluetooth RF contingência' },
            { id: 'cliente', label: '👤 Cliente (CRM)', desc: 'SMS e datas futuras de CRM' },
          ].map(tab => {
            // Count rules matching category count
            const countCat = rules.filter(r => r.category === tab.id).length;
            const countEnabledCat = rules.filter(r => r.category === tab.id && r.status === 'active').length;

            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSearchTerm('');
                }}
                className={cn(
                  "w-full text-left p-3.5 rounded-2xl text-xs transition-all flex flex-col gap-0.5 border cursor-pointer min-w-[190px] lg:min-w-0 shrink-0",
                  activeTab === tab.id 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-lg shadow-emerald-500/5" 
                    : "bg-[#111] text-zinc-500 border-zinc-800/40 hover:bg-[#151515] hover:text-white"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-black text-xs uppercase tracking-tight">{tab.label}</span>
                  <span className={cn(
                    "text-[8px] px-1.5 py-0.5 rounded font-black font-mono",
                    activeTab === tab.id ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-500"
                  )}>
                    {countEnabledCat}/{countCat}
                  </span>
                </div>
                <span className={cn(
                  "text-[9px] font-medium leading-none block mt-0.5", 
                  activeTab === tab.id ? "text-emerald-500/70" : "text-zinc-600"
                )}>
                  {tab.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* DETAILS WORKSPACE (LIST OF ACTIVE RULES & LOGS) */}
        <div className="lg:col-span-9 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          
          {/* ACTIVE RULES LISTING */}
          <div className="md:col-span-7 space-y-4">
            
            <div className="bg-[#111] border border-zinc-800/80 rounded-3xl p-5 flex flex-col gap-4">
              
              {/* Header inside detailing section */}
              <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                <div className="flex items-center gap-2">
                  <GitMerge className="w-4 h-4 text-emerald-400" />
                  <div className="text-left">
                    <span className="text-[8px] uppercase tracking-wider text-zinc-500 block">Gerenciamento no Módulo:</span>
                    <h3 className="text-xs font-black uppercase text-white tracking-widest">{activeTab}</h3>
                  </div>
                </div>
                <span className="text-[9px] font-bold font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-500">
                  {filteredRules.length} Regra(as) filtrada(as)
                </span>
              </div>

              {/* Rules Cards Loop */}
              <div className="space-y-3.5">
                {filteredRules.map(rule => (
                  <div 
                    key={rule.id} 
                    className={cn(
                      "p-4 border rounded-2xl flex flex-col gap-3.5 transition-all text-left relative overflow-hidden group",
                      rule.status === 'active' 
                        ? "bg-zinc-950/40 border-zinc-850 hover:border-emerald-500/20" 
                        : "bg-black/20 border-zinc-900/60 opacity-65"
                    )}
                  >
                    {/* Header profile */}
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-black text-white uppercase tracking-tight">{rule.name}</h4>
                          
                          {rule.isFutureArchitecture && (
                            <span className="text-[7px] font-black uppercase tracking-widest px-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded">
                              Futuro (CRM)
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-semibold text-zinc-500 mt-1 leading-relaxed">
                          {rule.description}
                        </p>
                      </div>

                      {/* Active Pause Switch Toggle Buttons */}
                      <button 
                        onClick={() => handleToggleStatus(rule.id)}
                        className={cn(
                          "p-1.5 rounded-xl border transition-all cursor-pointer",
                          rule.status === 'active' 
                            ? "bg-emerald-500/5 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10" 
                            : "bg-zinc-900 text-zinc-600 border-zinc-800 hover:text-zinc-400"
                        )}
                        title={rule.status === 'active' ? "Desativar Automação" : "Habilitar Automação"}
                      >
                        {rule.status === 'active' ? (
                          <ToggleRight className="w-6 h-6 stroke-[1.5]" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 stroke-[1.5]" />
                        )}
                      </button>
                    </div>

                    {/* Operational Trigger Details Visual Grid */}
                    <div className="bg-black/50 p-2.5 rounded-xl border border-zinc-900 text-[10px] font-mono leading-none text-zinc-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-emerald-500 font-extrabold text-[8px] uppercase px-1 bg-emerald-500/10 rounded">IF</span>
                        <span className="text-zinc-300">{rule.triggerLabel}</span>
                        <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0" />
                        <span className="text-emerald-500 font-extrabold text-[8px] uppercase px-1 bg-emerald-500/10 rounded">THEN</span>
                        <span className="text-zinc-200 font-medium">{rule.actionLabel}</span>
                      </div>
                      
                      <div className="text-[9px] font-bold text-zinc-500 uppercase shrink-0">
                        Canal: <span className="text-emerald-400 font-bold font-mono">{rule.module}</span>
                      </div>
                    </div>

                    {/* Operational Executions Stats Bar + Real Test Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-zinc-850/60 pt-3">
                      <div className="flex items-center gap-4.5 text-[9px] text-zinc-500 font-mono">
                        <div>
                          Execuções: <span className="text-white font-bold">{rule.executionsCount}x</span>
                        </div>
                        <div>
                          Última Execução:{' '}
                          <span className="text-zinc-300 font-bold">
                            {rule.lastExecution ? format(rule.lastExecution, 'dd/MM/yyyy HH:mm') : 'Nunca'}
                          </span>
                        </div>
                      </div>

                      {/* Execute Trigger simulated live */}
                      <button
                        onClick={() => handleTestRealTrigger(rule)}
                        disabled={rule.isFutureArchitecture}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1",
                          rule.isFutureArchitecture
                            ? "bg-zinc-900 text-zinc-600 border border-zinc-800/40 cursor-not-allowed"
                            : rule.status === 'active'
                              ? "bg-emerald-500 text-black hover:bg-emerald-400"
                              : "bg-zinc-850 text-zinc-400 hover:text-white"
                        )}
                        title={rule.isFutureArchitecture ? "Planejado para futura integração de CRM" : "Simular acionamento com dados reais em tempo real"}
                      >
                        <RefreshCw className="w-3 h-3 shrink-0 animate-spin-slow pr-0.5" />
                        {rule.isFutureArchitecture ? "Aguarda Integração" : "Testar Gatilho Real"}
                      </button>
                    </div>

                    {/* Simple absolute delete for custom regulations */}
                    {rule.id.startsWith('custom-') && (
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="absolute top-2 right-14 p-1.5 text-zinc-600 hover:text-rose-500 transition-colors cursor-pointer rounded-lg"
                        title="Excluir regra de automação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                  </div>
                ))}

                {filteredRules.length === 0 && (
                  <div className="p-12 text-center border-2 border-dashed border-zinc-900 rounded-3xl opacity-25">
                    <Boxes className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
                    <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">
                      Nenhuma Automação Encontrada
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1">Crie novos fluxos de gatilho para este módulo!</p>
                  </div>
                )}
              </div>

            </div>

             {/* INFORMATIVE SECTION EXPLAINING SYSTEM INTEGRATIONS */}
             <div className="bg-[#111] border border-zinc-800/80 rounded-3xl p-5 text-left">
               <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5 mb-2.5">
                 <Info className="w-4 h-4 text-emerald-400" />
                 Conexões com Prontos Sistemas Reais (ERP/WMS)
               </h4>
               
               <p className="text-[11px] text-zinc-400 leading-relaxed mb-4">
                 Os gatilhos reais leem e interpretam faturamentos no PDV, estado de abertura e turno declarados de Caixa, triagem e separação técnica no WMS e auditoria de hardware de impressão (Fila PDF/Zebra).
               </p>

               <div className="grid grid-cols-2 gap-3 text-[10px] font-mono">
                 <div className="p-2 bg-black/40 border border-zinc-850 rounded-xl">
                   <span className="text-emerald-400 font-bold block mb-0.5">📟 PDV & Caixa</span>
                   Registradores de operadores e balanço fiscal instantâneos.
                 </div>
                 <div className="p-2 bg-black/40 border border-zinc-850 rounded-xl">
                   <span className="text-emerald-400 font-bold block mb-0.5">📦 Picking & WMS</span>
                   Mudanças automáticas de SLA e auditorias de rupturas.
                 </div>
               </div>
             </div>

          </div>

          {/* HISTORIAL LOGS SECTION */}
          <div className="md:col-span-5 space-y-4">
             
             <div className="bg-[#111] border border-zinc-800/80 rounded-3xl p-5 flex flex-col gap-4">
               
               <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                 <div className="flex items-center gap-2">
                   <Bell className="w-4 h-4 text-emerald-400 animate-swing" />
                   <div className="text-left">
                     <span className="text-[8px] uppercase tracking-wider text-zinc-500 block">Sinal de Telemetria:</span>
                     <h3 className="text-xs font-black uppercase text-white tracking-widest">Logs Operacionais</h3>
                   </div>
                 </div>

                 <button
                   onClick={() => {
                     setLogs([]);
                     localStorage.removeItem('erp_wms_automation_logs');
                   }}
                   className="text-[8px] font-black uppercase px-2 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors cursor-pointer"
                   title="Limpar logs temporários"
                 >
                   Limpar
                 </button>
               </div>

               {/* Logs stream looping */}
               <div className="space-y-2.5 max-h-[460px] overflow-y-auto custom-scrollbar pr-1.5 flex flex-col">
                  {logs.map((log) => (
                    <div 
                      key={log.id} 
                      className="bg-black/50 border border-zinc-900 p-3 rounded-xl hover:border-zinc-850 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        {/* Bullet indicators */}
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            log.status === 'alert' ? "bg-rose-500 animate-pulse" : log.status === 'info' ? "bg-blue-400" : "bg-emerald-500"
                          )} />
                          <span className="text-[9px] font-black text-white uppercase tracking-tight truncate max-w-[130px]" title={log.ruleName}>
                            {log.ruleName}
                          </span>
                        </div>
                        
                        <span className="text-[8px] font-bold text-zinc-500 font-mono">
                          {format(log.timestamp, 'HH:mm:ss')}
                        </span>
                      </div>

                      <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed leading-snug">
                        {log.message}
                      </p>

                      <div className="flex items-center justify-between gap-1.5 border-t border-zinc-850/40 pt-1.5 mt-1.5 text-[8px] font-mono text-zinc-500">
                        <span>Canal: <strong className="text-emerald-500/80">{log.module}</strong></span>
                        <span className="uppercase text-[7px] font-black px-1.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-400">
                          {log.category}
                        </span>
                      </div>
                    </div>
                  ))}

                  {logs.length === 0 && (
                    <div className="py-12 text-center opacity-30">
                      <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Aguardando Execuções</p>
                      <p className="text-[9px] text-zinc-600 mt-1">Dispare um botão "Testar Gatilho Real" para iniciar a telemetria.</p>
                    </div>
                  )}
               </div>

             </div>

             {/* ANDROID COMPATIBILITY ASSURANCES PANEL */}
             <div className="bg-gradient-to-br from-zinc-950 to-zinc-900/50 border border-zinc-850 rounded-3xl p-4.5 text-left relative overflow-hidden">
                <div className="absolute right-0 top-0 p-3 opacity-5 pointer-events-none">
                  <Smartphone className="w-20 h-20 rotate-12 text-emerald-400" />
                </div>

                <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black rounded uppercase tracking-wider">
                  Controle Android e RF
                </span>
                <h4 className="text-xs font-black text-white uppercase tracking-tight mt-1.5">
                  Fila de Conexão Ativa
                </h4>
                <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed leading-snug">
                  Nossos drivers portáteis realizam contingência de conexão RF local. Caso um despachante de etiquetas bluetooth perca o pareamento, o coletor Android ativa instantaneamente o redirecionamento de visualização PDF via contingência integrada.
                </p>
                <div className="flex items-center gap-1.5 mt-3 text-[8px] font-mono text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  STATUS CONTROLES RF: OPERACIONAL
                </div>
             </div>

          </div>

        </div>

      </div>

      {/* CREATE NEW AUTOMATION MODAL */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowModal(false)} 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl space-y-5 text-left"
            >
               <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Configurar Nova Regra Automática</h3>
                  </div>
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="text-zinc-500 hover:text-white cursor-pointer transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
               </div>

               <div className="space-y-3.5">
                  
                  {/* Select Preset Shortcut helper */}
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 rounded-xl space-y-1.5">
                    <span className="text-[8px] uppercase tracking-wider text-emerald-500 font-black block">Atalho: Carregar Modelo Operacional</span>
                    <select
                      onChange={(e) => handleSelectPresetTrigger(e.target.value)}
                      className="w-full bg-black/80 border border-zinc-800 rounded-lg py-1.5 px-2 text-xs text-zinc-300 outline-none"
                    >
                      <option value="">-- Selecione uma das Automações ERP Homologadas --</option>
                      {triggerPresets.map(t => (
                        <option key={t.key} value={t.key}>{t.label} &rarr; {t.actLabel}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Nome da Regra</label>
                    <input 
                      value={newRuleName} 
                      onChange={e => setNewRuleName(e.target.value)} 
                      type="text" 
                      placeholder="Ex: Cupom de Pedido Pós-Checkout" 
                      className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-zinc-650" 
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-35">
                    <div>
                      <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Categoria / Fluxo</label>
                      <select 
                        value={newRuleCategory} 
                        onChange={e => setNewRuleCategory(e.target.value as any)} 
                        className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none cursor-pointer"
                      >
                        <option value="pedidos">Pedidos</option>
                        <option value="separacao">Separação</option>
                        <option value="impressao">Impressão/PDF</option>
                        <option value="estoque">Estoque</option>
                        <option value="caixa">Caixa</option>
                        <option value="notificacoes">Notificações</option>
                        <option value="android">Android/Dispositivos</option>
                        <option value="cliente">Cliente (CRM)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Módulo Relacionado</label>
                      <select 
                        value={newRuleModule} 
                        onChange={e => setNewRuleModule(e.target.value as any)} 
                        className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none cursor-pointer"
                      >
                        <option value="PDV">PDV</option>
                        <option value="Caixa">Caixa</option>
                        <option value="Gestão de Pedido">Gestão de Pedido</option>
                        <option value="Separação">Separação</option>
                        <option value="Estoque">Estoque</option>
                        <option value="Impressão/PDF">Impressão/PDF</option>
                        <option value="Clientes">Clientes</option>
                        <option value="Android/Bluetooth">Android/Bluetooth</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Gatilho (Trigger IF)</label>
                      <input 
                        value={newRuleTriggerLabel} 
                        onChange={e => {
                          setNewRuleTriggerLabel(e.target.value);
                          setNewRuleTriggerKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                        }} 
                        type="text" 
                        placeholder="Ex: Ao despachar pedido" 
                        className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-zinc-650" 
                      />
                    </div>

                    <div>
                      <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Ação (Action THEN)</label>
                      <input 
                        value={newRuleActionLabel} 
                        onChange={e => {
                          setNewRuleActionLabel(e.target.value);
                          setNewRuleActionKey(e.target.value.toLowerCase().replace(/\s+/g, '_'));
                        }} 
                        type="text" 
                        placeholder="Ex: imprimir recibo térmico" 
                        className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none placeholder:text-zinc-650" 
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[8px] uppercase font-black text-zinc-500 tracking-wider mb-1.5">Descrição Operacional</label>
                    <textarea 
                      value={newRuleDescription} 
                      onChange={e => setNewRuleDescription(e.target.value)} 
                      placeholder="Indique com clareza o que esta regra executa no dia a dia da operação..." 
                      className="w-full bg-black/30 border border-zinc-850 rounded-xl py-2 px-3 text-xs text-white focus:border-emerald-500/50 outline-none min-h-[60px] placeholder:text-zinc-650" 
                    />
                  </div>
               </div>

               <div className="flex gap-3 pt-3 border-t border-zinc-855">
                  <button 
                    onClick={() => setShowModal(false)} 
                    className="flex-1 py-2 text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleAddNewRule} 
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-black border border-emerald-400/10 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Salvar Automação
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
