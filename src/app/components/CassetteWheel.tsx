import { useRef, useCallback, useState } from 'react';

// SVG path for the reel/pencil-hole hub (from Figma import)
const REEL_HUB_PATH =
  'M43.6582 0C49.7102 0 55.4766 1.22313 60.7246 3.43359L55.4238 12.6182L64.9629 18.126L70.2588 8.95117C79.4504 15.9379 85.8101 26.4557 87.3145 38.4844H76.7051V49.5H87.3164C85.8148 61.5413 79.4473 72.0689 70.2441 79.0586L64.9473 69.8828L55.4082 75.3906L60.709 84.5723C55.4651 86.7786 49.7043 88 43.6582 88C37.6035 87.9999 31.8348 86.7759 26.585 84.5635L31.8945 75.3672L22.3555 69.8594L17.0527 79.0439C7.86031 72.0541 1.50048 61.5326 0 49.5H10.6123V38.4844H0.00195312C1.50713 26.4491 7.87349 15.9262 17.0732 8.93945L22.3721 18.1172L31.9121 12.6104L26.6094 3.42578C31.8527 1.21989 37.6129 5.84431e-05 43.6582 0Z';

interface CassetteWheelProps {
  /** Visual rotation angle in degrees (user-drag driven only) */
  rotationAngle: number;
  /** Called with delta degrees each time the pointer moves around the wheel */
  onRotate: (delta: number) => void;
  /** Called when the user taps the center without dragging */
  onCenterClick: () => void;
  /** Position within TapeControls: 'left' | 'right' */
  side: 'left' | 'right';
  /** Force the pressed-in visual from outside (e.g. a keyboard shortcut) */
  forcePressed?: boolean;
  /** Fires true/false when the center is held down via touch/mouse (not just tapped) */
  onHoldChange?: (held: boolean) => void;
}

export function CassetteWheel({ rotationAngle, onRotate, onCenterClick, side, forcePressed = false, onHoldChange }: CassetteWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const prevAngle = useRef(0);
  const [pressed, setPressed] = useState(false);
  const isPressed = pressed || forcePressed;

  const getAngle = (clientX: number, clientY: number): number => {
    const rect = wheelRef.current!.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * (180 / Math.PI);
  };

  const isOverCenter = (clientX: number, clientY: number): boolean => {
    const rect = centerRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.hypot(clientX - cx, clientY - cy) <= rect.width / 2 + 4;
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isOverCenter(e.clientX, e.clientY)) return;
    e.preventDefault();
    isDragging.current = true;
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
      onRotate(delta);
      prevAngle.current = newAngle;
    }
  }, [onRotate]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    try { wheelRef.current?.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  }, []);

  const handlePointerCancel = useCallback(() => {
    isDragging.current = false;
  }, []);

  const posClass = side === 'left'
    ? '-translate-y-1/2 absolute left-[37px] top-1/2'
    : '-translate-y-1/2 absolute right-[37px] top-1/2';

  return (
    <div
      ref={wheelRef}
      className={posClass}
      style={{
        width: 124,
        height: 124,
        cursor: 'grab',
        userSelect: 'none',
        flexShrink: 0,
        touchAction: 'none',   /* claim the touch gesture: no page scroll/zoom while turning */
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Pressed-state wrapper: scales the whole wheel down when the center is tapped */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `scale(${isPressed ? 0.94 : 1})`,
          transition: 'transform 0.12s ease-out',
        }}
      >
        {/* Rotating visual: outer ring + reel hub */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transform: `rotate(${rotationAngle}deg)`,
            willChange: 'transform',
          }}
        >
          {/* Outer circle stroke */}
          <div className="absolute left-[3px] size-[118px] top-[3px]">
            <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 118 118">
              <circle cx="59" cy="59" r="57.5" stroke="var(--shell-wheel, #202020)" strokeWidth="3" />
            </svg>
          </div>
          {/* Reel hub (pencil hole gear shape) */}
          <div className="absolute h-[88px] left-[18px] top-[18px] w-[87.316px]">
            <svg className="absolute block inset-0 size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 87.3164 88">
              <path d={REEL_HUB_PATH} fill="var(--shell-wheel, #202020)" />
            </svg>
          </div>
        </div>

        {/* Transparent center click target (does not rotate) */}
        <div
          ref={centerRef}
          onClick={(e) => { e.stopPropagation(); onCenterClick(); }}
          onPointerDown={(e) => {
            e.stopPropagation();
            setPressed(true);
            onHoldChange?.(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            setPressed(false);
            onHoldChange?.(false);
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => { setPressed(false); onHoldChange?.(false); }}
          onPointerLeave={() => { setPressed(false); onHoldChange?.(false); }}
          style={{
            position: 'absolute',
            width: 44,
            height: 44,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: 10,
            background: isPressed ? 'rgba(0,0,0,0.18)' : 'transparent',
            boxShadow: isPressed ? 'inset 0 2px 4px rgba(0,0,0,0.35)' : 'none',
            transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out',
          }}
        />
      </div>
    </div>
  );
}
