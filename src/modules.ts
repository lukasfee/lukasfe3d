import { 
  LayoutDashboard, 
  ShoppingCart, 
  Search, 
  ClipboardList, 
  Users, 
  Package, 
  Box, 
  Truck, 
  CreditCard, 
  CircleDollarSign, 
  LockKeyholeOpen, 
  History, 
  Clock, 
  RotateCcw, 
  Store, 
  Warehouse, 
  BookOpen, 
  Calculator, 
  HeartHandshake, 
  ShieldCheck, 
  Sparkles, 
  Bell, 
  Zap, 
  Settings,
  TrendingUp,
  Radio,
  Tablet,
  ChefHat,
  UserCog
} from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface ModuleConfig {
  id: string;
  name: string;
  icon: LucideIcon;
  path: string;
  category: string;
}

export const MODULES: ModuleConfig[] = [
  // Prioritários
  { id: 'abrir-caixa', name: 'Abrir/Fechar Caixa', icon: LockKeyholeOpen, path: '/abrir-caixa', category: 'Financeiro' },
  { id: 'pdv', name: 'Vender', icon: ShoppingCart, path: '/pdv', category: 'Operacional' },
  { id: 'em-producao', name: 'Em Produção', icon: ChefHat, path: '/em-producao', category: 'Operacional' },
  { id: 'gestao-pedidos', name: 'Gestão de Pedidos', icon: ClipboardList, path: '/gestao-pedidos', category: 'Logística' },
  { id: 'separacao', name: 'Separação', icon: Box, path: '/separacao', category: 'Logística' },
  { id: 'entrega', name: 'Entrega', icon: Truck, path: '/entrega', category: 'Logística' },
  { id: 'estoque', name: 'Estoque', icon: Package, path: '/estoque', category: 'Logística' },
  { id: 'clientes', name: 'Clientes', icon: Users, path: '/clientes', category: 'Gestão' },
  { id: 'experiencia-cliente', name: 'Experiência do Cliente', icon: HeartHandshake, path: '/experiencia-cliente', category: 'Marketing' },
  
  // Demais menus
  { id: 'financeiro', name: 'Financeiro', icon: CircleDollarSign, path: '/financeiro', category: 'Financeiro' },
  { id: 'custos', name: 'Custos de Produção', icon: Calculator, path: '/custos', category: 'Financeiro' },
  { id: 'pre-encomenda', name: 'Pré-Encomenda', icon: ClipboardList, path: '/pre-encomenda', category: 'Operacional' },
  { id: 'devolucao', name: 'Devolução', icon: RotateCcw, path: '/devolucao', category: 'Operacional' },
  { id: 'central-operacional', name: 'Central Operacional', icon: Radio, path: '/central-operacional', category: 'Operacional' },
  { id: 'pagamentos', name: 'Pagamentos', icon: CreditCard, path: '/pagamentos', category: 'Financeiro' },
  { id: 'auditoria', name: 'Auditoria', icon: ShieldCheck, path: '/auditoria', category: 'Inteligência' },
  { id: 'operadores', name: 'Operadores', icon: UserCog, path: '/operadores', category: 'Inteligência' },
  { id: 'lojistas', name: 'Lojistas', icon: Store, path: '/lojistas', category: 'Gestão' },
  { id: 'ia', name: 'IA Operacional', icon: Sparkles, path: '/ia', category: 'Inteligência' },
  { id: 'pdv-totem', name: 'PDV Totem', icon: Tablet, path: '/pdv-totem', category: 'Operacional' },
  { id: 'rede', name: 'Sincronização Local', icon: Settings, path: '/rede', category: 'Configurações' },
];
