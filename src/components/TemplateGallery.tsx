import React from 'react';
import { Check, Layout, Sparkles, Ghost, ShoppingBag } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export interface Template {
  id: string;
  name: string;
  description: string;
  preview: React.ReactNode;
  isPremium?: boolean;
}

interface TemplateGalleryProps {
  templates: Template[];
  selectedId: string;
  onSelect: (id: string) => void;
  title?: string;
}

export default function TemplateGallery({ templates, selectedId, onSelect, title = "Galeria de Templates" }: TemplateGalleryProps) {
  return (
    <div className="space-y-4">
      {title && (
        <div className="flex items-center gap-2 px-1">
          <Layout className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{title}</h3>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => {
          const isSelected = selectedId === template.id;
          
          return (
            <motion.div
              key={template.id}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(template.id)}
              className={cn(
                "relative group cursor-pointer rounded-2xl border-2 transition-all duration-300 overflow-hidden",
                isSelected 
                  ? "border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]" 
                  : "border-white/5 bg-white/5 hover:border-white/20"
              )}
            >
              {/* Preview Area */}
              <div className="aspect-[3/4] p-4 bg-white/5 flex flex-col items-center justify-center relative overflow-hidden">
                {template.preview}
                
                {isSelected && (
                  <div className="absolute top-3 right-3 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
                    <Check className="w-5 h-5 text-black font-bold" />
                  </div>
                )}

                {template.isPremium && (
                  <div className="absolute top-3 left-3 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-md flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500" />
                    <span className="text-[9px] font-bold text-amber-500 uppercase">Premium</span>
                  </div>
                )}
              </div>

              {/* Info Area */}
              <div className="p-4 border-t border-white/5">
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-white text-sm">{template.name}</h4>
                </div>
                <p className="text-xs text-white/40 line-clamp-1">{template.description}</p>
                
                <div className="mt-4">
                   <button
                    className={cn(
                      "w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                      isSelected
                        ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                        : "bg-white/5 text-white/60 group-hover:bg-white/10 group-hover:text-white"
                    )}
                  >
                    {isSelected ? "Selecionado" : "Selecionar Template"}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
