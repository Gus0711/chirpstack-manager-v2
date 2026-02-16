<script setup lang="ts">
withDefaults(defineProps<{
  intensity?: 'full' | 'subtle'
}>(), { intensity: 'full' })

// ── Network mesh nodes ──
const nodes = [
  { x: 8,  y: 14 }, { x: 25, y: 38 }, { x: 14, y: 65 },
  { x: 6,  y: 90 }, { x: 38, y: 10 }, { x: 45, y: 50 },
  { x: 35, y: 80 }, { x: 60, y: 20 }, { x: 68, y: 55 },
  { x: 55, y: 88 }, { x: 82, y: 12 }, { x: 78, y: 42 },
  { x: 88, y: 68 }, { x: 95, y: 28 }, { x: 92, y: 82 },
  { x: 50, y: 95 }, { x: 20, y: 52 }, { x: 72, y: 78 },
]

// ── Connections between nearby nodes ──
interface Connection {
  x1: number; y1: number; x2: number; y2: number
  delay: number; duration: number
}
const connections: Connection[] = []
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[i].x - nodes[j].x
    const dy = nodes[i].y - nodes[j].y
    if (Math.sqrt(dx * dx + dy * dy) < 32) {
      connections.push({
        x1: nodes[i].x, y1: nodes[i].y,
        x2: nodes[j].x, y2: nodes[j].y,
        delay: ((i * 3 + j * 7) % 10) * 0.4,
        duration: 2.5 + ((i + j) % 4),
      })
    }
  }
}
const reverseConnections = connections.filter((_, i) => i % 3 === 0)

// ── Wave emitters ──
const waveEmitters = [
  { x: 15, y: 20 },
  { x: 75, y: 45 },
  { x: 40, y: 85 },
]

// ── Particles (with glow) ──
const particles = Array.from({ length: 35 }, (_, i) => ({
  left: `${(7 + i * 31) % 93}%`,
  top: `${(12 + i * 37) % 88}%`,
  size: 2 + (i % 5),
  delay: (i * 0.45) % 8,
  duration: 7 + (i % 6) * 1.5,
  dx: ((i % 7) - 3) * 22,
  dy: -(25 + (i % 6) * 16),
  opacity: 0.15 + (i % 5) * 0.08,
  hue: [186, 270, 210, 195, 258][i % 5],
}))

function particleStyle(p: typeof particles[0]) {
  return {
    left: p.left,
    top: p.top,
    width: p.size + 'px',
    height: p.size + 'px',
    '--p-dx': p.dx + 'px',
    '--p-dy': p.dy + 'px',
    '--p-opacity': String(p.opacity),
    'animation-delay': p.delay + 's',
    'animation-duration': p.duration + 's',
    'background-color': `hsla(${p.hue}, 80%, 65%, 0.8)`,
    'box-shadow': `0 0 ${p.size * 3}px hsla(${p.hue}, 80%, 60%, 0.4), 0 0 ${p.size * 6}px hsla(${p.hue}, 80%, 60%, 0.15)`,
  } as Record<string, string>
}
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="intensity === 'subtle' ? 'opacity-30' : ''"
  >
    <!-- ═══════════ L0 · BASE GRADIENT ═══════════ -->
    <div class="base-grad" />

    <!-- ═══════════ L1 · AURORA BLOBS (×4) ═══════════ -->
    <div class="aurora a1" />
    <div class="aurora a2" />
    <div class="aurora a3" />
    <div class="aurora a4" />

    <!-- ═══════════ L2 · NETWORK MESH (SVG) ═══════════ -->
    <svg
      class="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="bg-glow-sm">
          <feGaussianBlur stdDeviation="1" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="bg-glow-lg">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="ng">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.9" />
          <stop offset="50%" stop-color="#22d3ee" stop-opacity="0.2" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Connection lines (subtle, with glow) -->
      <line
        v-for="(c, i) in connections" :key="'cl' + i"
        :x1="c.x1" :y1="c.y1" :x2="c.x2" :y2="c.y2"
        stroke="rgba(6,182,212,0.06)" stroke-width="0.15"
      />
      <line
        v-for="(c, i) in connections" :key="'clg' + i"
        :x1="c.x1" :y1="c.y1" :x2="c.x2" :y2="c.y2"
        stroke="rgba(6,182,212,0.03)" stroke-width="0.6"
        filter="url(#bg-glow-sm)"
      />

      <!-- Data packets (forward · rect streaks) -->
      <rect
        v-for="(c, i) in connections" :key="'dp' + i"
        width="1.8" height="0.35" rx="0.17"
        fill="#22d3ee" opacity="0.8"
        filter="url(#bg-glow-lg)"
      >
        <animateMotion
          :dur="c.duration + 's'"
          repeatCount="indefinite"
          :begin="c.delay + 's'"
          rotate="auto"
          :path="`M${c.x1} ${c.y1} L${c.x2} ${c.y2}`"
        />
      </rect>

      <!-- Data packets (reverse · violet) -->
      <rect
        v-for="(c, i) in reverseConnections" :key="'rp' + i"
        width="1.2" height="0.3" rx="0.15"
        fill="#a78bfa" opacity="0.6"
        filter="url(#bg-glow-sm)"
      >
        <animateMotion
          :dur="(c.duration + 1.5) + 's'"
          repeatCount="indefinite"
          :begin="(c.delay + 2) + 's'"
          rotate="auto"
          :path="`M${c.x2} ${c.y2} L${c.x1} ${c.y1}`"
        />
      </rect>

      <!-- Network nodes -->
      <g v-for="(n, i) in nodes" :key="'nd' + i">
        <!-- Outer halo -->
        <circle
          :cx="n.x" :cy="n.y" r="2"
          fill="url(#ng)" opacity="0.25"
        >
          <animate attributeName="r" values="1.5;3;1.5"
            :dur="(3.5 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.35) + 's'" />
          <animate attributeName="opacity" values="0.1;0.35;0.1"
            :dur="(3.5 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.35) + 's'" />
        </circle>
        <!-- Core -->
        <circle
          :cx="n.x" :cy="n.y" r="0.5"
          fill="#22d3ee" filter="url(#bg-glow-sm)"
        >
          <animate attributeName="opacity" values="0.4;0.9;0.4"
            :dur="(3.5 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.35) + 's'" />
        </circle>
      </g>
    </svg>

    <!-- ═══════════ L3 · WAVE EMITTERS ═══════════ -->
    <div
      v-for="(e, i) in waveEmitters" :key="'we' + i"
      v-show="intensity === 'full'"
      class="wave-emitter"
      :style="{ left: e.x + '%', top: e.y + '%' }"
    >
      <!-- Center glow -->
      <div class="wave-center" />
      <!-- Expanding rings -->
      <div class="wave-ring" />
      <div class="wave-ring" style="animation-delay: 1.3s" />
      <div class="wave-ring" style="animation-delay: 2.6s" />
      <div class="wave-ring ring-violet" style="animation-delay: 3.9s" />
    </div>

    <!-- ═══════════ L4 · RADAR SWEEP ═══════════ -->
    <div v-if="intensity === 'full'" class="radar-sweep" />

    <!-- ═══════════ L5 · PARTICLES ═══════════ -->
    <div
      v-for="(p, i) in (intensity === 'full' ? particles : particles.slice(0, 12))"
      :key="'pt' + i"
      class="particle"
      :style="particleStyle(p)"
    />

    <!-- ═══════════ L6 · SCAN BAND ═══════════ -->
    <div v-if="intensity === 'full'" class="scan-band">
      <div class="scan-core" />
      <div class="scan-trail" />
    </div>

    <!-- ═══════════ L7 · VIGNETTE ═══════════ -->
    <div v-if="intensity === 'full'" class="vignette" />
  </div>
</template>

<style scoped>
/* ──────────── BASE ──────────── */
.base-grad {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 40%, rgba(6,182,212,0.04) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 70%, rgba(139,92,246,0.03) 0%, transparent 50%);
}

/* ──────────── AURORA ──────────── */
.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(130px);
  will-change: transform;
}
.a1 {
  width: 600px; height: 600px;
  background: radial-gradient(circle, rgba(6,182,212,0.2) 0%, rgba(6,182,212,0.05) 40%, transparent 70%);
  top: -20%; left: -10%;
  animation: au1 28s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
}
.a2 {
  width: 520px; height: 520px;
  background: radial-gradient(circle, rgba(139,92,246,0.16) 0%, rgba(139,92,246,0.04) 40%, transparent 70%);
  top: 20%; right: -12%;
  animation: au2 34s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
}
.a3 {
  width: 450px; height: 450px;
  background: radial-gradient(circle, rgba(59,130,246,0.14) 0%, rgba(59,130,246,0.03) 40%, transparent 70%);
  bottom: -15%; left: 20%;
  animation: au3 26s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
}
.a4 {
  width: 380px; height: 380px;
  background: radial-gradient(circle, rgba(20,184,166,0.12) 0%, rgba(20,184,166,0.03) 40%, transparent 70%);
  bottom: 10%; right: 15%;
  animation: au4 32s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate;
}

@keyframes au1 {
  0%   { transform: translate(0, 0) scale(1); }
  25%  { transform: translate(80px, 50px) scale(1.12); }
  50%  { transform: translate(160px, 120px) scale(0.92); }
  75%  { transform: translate(100px, 160px) scale(1.08); }
  100% { transform: translate(200px, 100px) scale(1.02); }
}
@keyframes au2 {
  0%   { transform: translate(0, 0) scale(1); }
  30%  { transform: translate(-100px, 60px) scale(1.18); }
  60%  { transform: translate(-180px, 130px) scale(0.95); }
  100% { transform: translate(-90px, -50px) scale(1.06); }
}
@keyframes au3 {
  0%   { transform: translate(0, 0) scale(1); }
  40%  { transform: translate(120px, -70px) scale(1.14); }
  70%  { transform: translate(60px, -120px) scale(0.96); }
  100% { transform: translate(-40px, -50px) scale(1.1); }
}
@keyframes au4 {
  0%   { transform: translate(0, 0) scale(1); }
  35%  { transform: translate(-70px, -40px) scale(1.1); }
  65%  { transform: translate(-120px, 30px) scale(0.94); }
  100% { transform: translate(-50px, 60px) scale(1.04); }
}

/* ──────────── WAVE EMITTERS ──────────── */
.wave-emitter {
  position: absolute;
  transform: translate(-50%, -50%);
}
.wave-center {
  position: absolute;
  width: 6px; height: 6px;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(6,182,212,0.6) 0%, transparent 100%);
  box-shadow: 0 0 12px 4px rgba(6,182,212,0.2), 0 0 30px 8px rgba(6,182,212,0.08);
  animation: center-pulse 3s ease-in-out infinite;
}
.wave-ring {
  position: absolute;
  width: 100px; height: 100px;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) scale(0.08);
  border-radius: 50%;
  border: 1.5px solid rgba(6,182,212,0.4);
  box-shadow: 0 0 6px rgba(6,182,212,0.1), inset 0 0 6px rgba(6,182,212,0.05);
  animation: ring-expand 5.2s ease-out infinite;
  will-change: transform, opacity;
}
.ring-violet {
  border-color: rgba(139,92,246,0.3);
  box-shadow: 0 0 6px rgba(139,92,246,0.08), inset 0 0 6px rgba(139,92,246,0.04);
}

@keyframes center-pulse {
  0%, 100% { box-shadow: 0 0 12px 4px rgba(6,182,212,0.2), 0 0 30px 8px rgba(6,182,212,0.08); }
  50%      { box-shadow: 0 0 18px 6px rgba(6,182,212,0.35), 0 0 45px 12px rgba(6,182,212,0.12); }
}
@keyframes ring-expand {
  0%   { transform: translate(-50%, -50%) scale(0.08); opacity: 0.7; }
  70%  { opacity: 0.15; }
  100% { transform: translate(-50%, -50%) scale(6); opacity: 0; }
}

/* ──────────── RADAR SWEEP ──────────── */
.radar-sweep {
  position: absolute;
  width: min(900px, 90vw); height: min(900px, 90vw);
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    rgba(6,182,212,0.04) 10deg,
    rgba(6,182,212,0.06) 20deg,
    rgba(139,92,246,0.03) 35deg,
    transparent 55deg
  );
  animation: radar-spin 14s linear infinite;
  will-change: transform;
}
@keyframes radar-spin {
  from { transform: translate(-50%, -50%) rotate(0deg); }
  to   { transform: translate(-50%, -50%) rotate(360deg); }
}

/* ──────────── PARTICLES ──────────── */
.particle {
  position: absolute;
  border-radius: 50%;
  will-change: transform, opacity;
  animation: pdrift ease-in-out infinite;
}
@keyframes pdrift {
  0%   { transform: translate(0, 0) scale(1); opacity: 0; }
  10%  { opacity: var(--p-opacity, 0.3); transform: translate(0, 0) scale(1.2); }
  50%  { transform: translate(calc(var(--p-dx, 0px) * 0.5), calc(var(--p-dy, -40px) * 0.5)) scale(1); }
  90%  { opacity: var(--p-opacity, 0.3); }
  100% { transform: translate(var(--p-dx, 0px), var(--p-dy, -60px)) scale(0.6); opacity: 0; }
}

/* ──────────── SCAN BAND ──────────── */
.scan-band {
  position: absolute;
  left: 0; right: 0;
  height: 120px;
  animation: scan-move 12s linear infinite;
  will-change: top;
}
.scan-core {
  position: absolute;
  left: 0; right: 0;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent 5%, rgba(6,182,212,0.25) 25%, rgba(139,92,246,0.2) 50%, rgba(6,182,212,0.25) 75%, transparent 95%);
  box-shadow: 0 0 8px 2px rgba(6,182,212,0.08);
}
.scan-trail {
  position: absolute;
  left: 0; right: 0;
  top: 50%;
  height: 80px;
  background: linear-gradient(180deg, rgba(6,182,212,0.03) 0%, transparent 100%);
  transform: translateY(-100%);
}

@keyframes scan-move {
  0%   { top: 110%; opacity: 0; }
  3%   { opacity: 1; }
  97%  { opacity: 1; }
  100% { top: -15%; opacity: 0; }
}

/* ──────────── VIGNETTE ──────────── */
.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 35%, rgba(0,0,0,0.35) 100%);
}
</style>
