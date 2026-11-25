import { useState, useMemo, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search, X, User } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface ColaboradorOption {
  id: string;
  nome: string;
  cargo?: string | null;
  turno?: string | null;
  letra?: string | null;
  cpf?: string | null;
  frente_atendimento?: string | null;
}

interface ColaboradorSearchSelectProps {
  colaboradores: ColaboradorOption[];
  value: string;
  onValueChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TURNO_SHORT: Record<string, string> = {
  dia_a: 'Dia A',
  dia_b: 'Dia B',
  noite_a: 'Noite A',
  noite_b: 'Noite B',
  adm: 'ADM',
};

function normalizeText(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function ColaboradorSearchSelect({
  colaboradores,
  value,
  onValueChange,
  placeholder = 'Pesquisar e selecionar colaborador...',
  disabled = false,
}: ColaboradorSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [escalaFilter, setEscalaFilter] = useState<'TODOS' | 'A' | 'B' | 'ADM'>('TODOS');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchInputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    } else {
      setQuery('');
    }
  }, [open]);

  const selected = useMemo(
    () => colaboradores.find((c) => c.id === value) || null,
    [colaboradores, value]
  );

  const filtered = useMemo(() => {
    const q = normalizeText(query.trim());
    const qDigits = query.replace(/\D/g, '');
    return colaboradores.filter((c) => {
      if (escalaFilter === 'A' && (c.letra || '').toUpperCase() !== 'A' && !(c.turno || '').endsWith('_a')) {
        return false;
      }
      if (escalaFilter === 'B' && (c.letra || '').toUpperCase() !== 'B' && !(c.turno || '').endsWith('_b')) {
        return false;
      }
      if (escalaFilter === 'ADM' && (c.turno || '').toLowerCase() !== 'adm') {
        return false;
      }
      if (!q) return true;
      const hay = normalizeText(
        `${c.nome} ${c.cargo || ''} ${c.letra || ''} ${TURNO_SHORT[c.turno || ''] || ''} ${c.frente_atendimento || ''}`
      );
      if (hay.includes(q)) return true;
      if (qDigits && (c.cpf || '').replace(/\D/g, '').includes(qDigits)) return true;
      return false;
    });
  }, [colaboradores, query, escalaFilter]);

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-10 px-3 text-left"
        >
          {selected ? (
            <span className="truncate flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="font-semibold text-foreground truncate">{selected.nome}</span>
              {selected.cargo && (
                <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                  ({selected.cargo})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0 shadow-xl border-border"
      >
        {/* Search Input + Quick Turno/Letra Filter */}
        <div className="p-2.5 border-b border-border space-y-2 bg-muted/20">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o nome, função ou letra..."
              className="w-full h-9 pl-8 pr-8 rounded-md border border-border bg-background text-xs outline-none focus:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'TODOS', label: 'Todos' },
                  { id: 'A', label: 'Letra A' },
                  { id: 'B', label: 'Letra B' },
                  { id: 'ADM', label: 'ADM' },
                ] as const
              ).map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setEscalaFilter(chip.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    escalaFilter === chip.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {filtered.length}/{colaboradores.length}
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum colaborador encontrado para "{query}".
            </div>
          ) : (
            filtered.map((c) => {
              const isSelected = c.id === value;
              const turnoBadge =
                TURNO_SHORT[c.turno || ''] || (c.letra ? `Letra ${c.letra}` : '');
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onValueChange(c.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors hover:bg-muted/60 ${
                    isSelected ? 'bg-primary/10' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.cargo || 'Colaborador'}
                      {c.frente_atendimento ? ` • ${c.frente_atendimento}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {turnoBadge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {turnoBadge}
                      </span>
                    )}
                    {isSelected && <Check className="w-4 h-4 text-primary" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
