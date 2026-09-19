import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { panelAutocomplete, type PanelPrediction } from "@/lib/mapbox-panel";

interface PlaceAutocompleteProps {
  placeholder: string;
  onPick: (prediction: PanelPrediction) => void;
  clearOnPick?: boolean;
}

export function PlaceAutocomplete({ placeholder, onPick, clearOnPick = true }: PlaceAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PanelPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 350);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    panelAutocomplete(trimmed)
      .then((predictions) => {
        if (cancelled) return;
        setSuggestions(predictions);
        setOpen(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Autocomplete failed");
        setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="bg-card/60 pl-9"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-destructive/25 bg-background p-2 text-xs text-destructive shadow-lg">
          {error}
        </div>
      )}

      {open && !error && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              className="flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-3 py-2 text-left last:border-0 hover:bg-muted/60"
              onClick={() => {
                onPick(suggestion);
                setOpen(false);
                if (clearOnPick) setQuery("");
                else setQuery(suggestion.primaryText);
              }}
            >
              <span className="truncate text-sm font-medium">{suggestion.primaryText}</span>
              <span className="truncate text-xs text-muted-foreground">{suggestion.secondaryText}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
