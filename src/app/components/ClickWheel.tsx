import { useRef, useCallback, useId } from 'react';

interface ClickWheelProps {
  size: number;
  rotationAngle: number;
  onRotate: (deltaAngle: number) => void;
  onCenterClick: () => void;
  accentColor?: string;
  isActive?: boolean;
}

export function ClickWheel({
  size,
  rotationAngle,
  onRotate,
  onCenterClick,
  accentColor = '#e8961c',
  isActive = false,
}: ClickWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const prevAngle = useRef(0);
  const hasMoved = useRef(false);
  const uid = useId().replace(/:/g, 'x');

  const r = size / 2;
  const ringWidth = Math.round(size * 0.14);
  const innerR = r - ringWidth;
  const hubR = Math.round(size * 0.255);
  const centerBtnR = Math.round(size * 0.145);
  const numTicks = 32;
  const spokeCount = 5;

  const getAngle = (clientX: number, clientY: number) => {
    const rect = wheelRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  };

  const isOverCenter = (clientX: number, clientY: number) => {
    const rect = centerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return Math.sqrt(dx * dx + dy * dy) <= rect.width / 2 + 4;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isOverCenter(e.clientX, e.clientY)) return;
    e.preventDefault();
    isDragging.current = true;
    hasMoved.current = false;
    prevAngle.current = getAngle(e.clientX, e.clientY);
    wheelRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const newAngle = getAngle(e.clientX, e.clientY);
    let delta = newAngle - prevAngle.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) > 0.3) {
      hasMoved.current = true;
      onRotate(delta);
      prevAngle.current = newAngle;
    }
  }, [onRotate]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    wheelRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const ticks = Array.from({ length: numTicks }, (_, i) => {
    const angle = (i * 360 / numTicks) * (Math.PI / 180);
    const isMajor = i % (numTicks / 8) === 0;
    const outerR = r - 4;
    const innerTickR = r - (isMajor ? ringWidth * 0.75 : ringWidth * 0.45);
    return { angle, isMajor, outerR, innerTickR };
  });

  const spokes = Array.from({ length: spokeCount }, (_, i) => ({
    rotation: (i * 360) / spokeCount,
  }));

  return (
    <div
      ref={wheelRef}
      style={{ width: size, height: size, position: 'relative', userSelect: 'none', cursor: 'grab', flexShrink: 0 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Rotating SVG wheel body */}
      <svg
        width={size}
        height={size}
        style={{
          position: 'absolute',
          inset: 0,
          transform: `rotate(${rotationAngle}deg)`,
          overflow: 'visible',
          filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.85))',
        }}
      >
        <defs>
          <radialGradient id={`${uid}ring`} cx="38%" cy="33%" r="68%">
            <stop offset="0%" stopColor="#323028" />
            <stop offset="100%" stopColor="#191714" />
          </radialGradient>
          <radialGradient id={`${uid}inner`} cx="38%" cy="33%" r="68%">
            <stop offset="0%" stopColor="#1e1c18" />
            <stop offset="100%" stopColor="#0e0d0a" />
          </radialGradient>
          <radialGradient id={`${uid}hub`} cx="40%" cy="36%" r="65%">
            <stop offset="0%" stopColor="#252320" />
            <stop offset="100%" stopColor="#141210" />
          </radialGradient>
          <filter id={`${uid}glow`}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer ring */}
        <circle cx={r} cy={r} r={r - 1} fill={`url(#${uid}ring)`} stroke="#0d0c0a" strokeWidth={1.5} />

        {/* Tick marks */}
        {ticks.map(({ angle, isMajor, outerR, innerTickR }, i) => (
          <line
            key={i}
            x1={r + Math.cos(angle) * innerTickR}
            y1={r + Math.sin(angle) * innerTickR}
            x2={r + Math.cos(angle) * outerR}
            y2={r + Math.sin(angle) * outerR}
            stroke={isMajor ? accentColor : '#35322c'}
            strokeWidth={isMajor ? 2 : 1}
            strokeLinecap="round"
            opacity={isMajor ? 0.85 : 0.6}
            filter={isMajor ? `url(#${uid}glow)` : undefined}
          />
        ))}

        {/* Inner recessed disc */}
        <circle cx={r} cy={r} r={innerR - 2} fill={`url(#${uid}inner)`} />

        {/* Inner ring shadow line */}
        <circle cx={r} cy={r} r={innerR - 2} fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth={3} />
        <circle cx={r} cy={r} r={innerR - 4} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={1} />

        {/* Reel hub outer ring */}
        <circle cx={r} cy={r} r={hubR + 3} fill="none" stroke="#0a0908" strokeWidth={4} />
        <circle cx={r} cy={r} r={hubR} fill={`url(#${uid}hub)`} />

        {/* Spoke arms (cassette reel arms) */}
        {spokes.map(({ rotation }, i) => (
          <rect
            key={i}
            x={r - 3.5}
            y={r - hubR + 4}
            width={7}
            height={hubR * 0.52}
            rx={3}
            fill="#2a2824"
            stroke="#1a1816"
            strokeWidth={0.5}
            transform={`rotate(${rotation}, ${r}, ${r})`}
          />
        ))}

        {/* Hub center fill */}
        <circle cx={r} cy={r} r={centerBtnR + 8} fill="#131210" />
        <circle cx={r} cy={r} r={centerBtnR + 7} fill="none" stroke="#252320" strokeWidth={1} />
      </svg>

      {/* Fixed position indicator dot (does NOT rotate) */}
      <div
        style={{
          position: 'absolute',
          top: 5,
          left: r - 5,
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: accentColor,
          boxShadow: `0 0 8px ${accentColor}, 0 0 16px ${accentColor}55`,
          pointerEvents: 'none',
          zIndex: 3,
        }}
      />

      {/* Center button (fixed, does NOT rotate) */}
      <div
        ref={centerRef}
        onClick={(e) => { e.stopPropagation(); onCenterClick(); }}
        style={{
          position: 'absolute',
          width: centerBtnR * 2,
          height: centerBtnR * 2,
          top: r - centerBtnR,
          left: r - centerBtnR,
          borderRadius: '50%',
          background: isActive
            ? `radial-gradient(circle at 38% 33%, #3d3928, #1e1c14)`
            : `radial-gradient(circle at 38% 33%, #28261e, #141210)`,
          border: `1.5px solid ${isActive ? '#3a3522' : '#201e18'}`,
          boxShadow: isActive
            ? `0 0 0 1px #2a2818, 0 2px 8px rgba(0,0,0,0.9), 0 0 16px ${accentColor}35`
            : `0 0 0 1px #18160e, 0 2px 8px rgba(0,0,0,0.9)`,
          cursor: 'pointer',
          zIndex: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.25s ease, background 0.25s ease',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: accentColor,
            opacity: isActive ? 1 : 0.3,
            boxShadow: isActive ? `0 0 10px ${accentColor}, 0 0 20px ${accentColor}88` : 'none',
            transition: 'all 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}
