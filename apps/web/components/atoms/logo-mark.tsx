/**
 * Logo mark — a small, gradient-orbiting icon for Stellar Payment Gateway.
 */
export const LogoMark = ({ size = 28 }: { size?: number }) => (
  <span
    className="relative inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-stellar-aurora via-stellar-nova to-stellar-comet shadow-glow"
    style={{ width: size, height: size }}
  >
    <span className="absolute h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white" />
    <span className="absolute h-1 w-1 animate-float rounded-full bg-white/80" style={{ top: 4, right: 4 }} />
    <span className="absolute h-1 w-1 animate-float rounded-full bg-white/60" style={{ bottom: 5, left: 5 }} />
  </span>
);
