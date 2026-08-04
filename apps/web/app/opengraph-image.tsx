import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Stellar Payment Gateway — Cross-Chain Wraps on Stellar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #05070d 0%, #0f1123 50%, #1a1040 100%)',
          padding: 80,
        }}
      >
        {/* Logo area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #7c5cff, #22d3ee)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: 'white',
            }}
          >
            ◈
          </div>
          <span
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            Stellar Payment Gateway
          </span>
          <span
            style={{
              fontSize: 14,
              color: '#7c5cff',
              border: '1px solid rgba(124,92,255,0.3)',
              borderRadius: 999,
              padding: '4px 12px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            testnet
          </span>
        </div>

        {/* Main headline */}
        <h1
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.15,
            maxWidth: 800,
            marginBottom: 20,
            letterSpacing: '-0.02em',
          }}
        >
          Wrap any ERC-20, SPL or Polygon token onto{' '}
          <span style={{ background: 'linear-gradient(135deg, #7c5cff, #22d3ee)', backgroundClip: 'text', color: 'transparent' }}>
            Stellar
          </span>
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: 22,
            color: '#8892b0',
            maxWidth: 700,
            lineHeight: 1.5,
          }}
        >
          Cross-chain wrapping middleware with Horizon-powered real-time settlement.
          Finality in under 5 seconds, fees in cents of a cent.
        </p>

        {/* Bottom tag line */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 80,
            display: 'flex',
            gap: 24,
            fontSize: 16,
            color: '#495670',
          }}
        >
          <span>✨ Soroban Smart Contracts</span>
          <span>🌉 Cross-Chain Bridge</span>
          <span>🏛️ DAO Governance</span>
          <span>📡 Real-Time SSE</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
