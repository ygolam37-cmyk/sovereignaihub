export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative h-8 w-8 rounded-md bg-gradient-gold shadow-gold flex items-center justify-center">
        <span className="font-display text-primary-foreground text-lg leading-none">S</span>
      </div>
      <span className="font-display text-xl tracking-wide">
        Sovereign<span className="text-gold"> AI</span>
      </span>
    </div>
  );
}
