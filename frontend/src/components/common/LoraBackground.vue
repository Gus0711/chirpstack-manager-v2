<script setup lang="ts">
withDefaults(defineProps<{
  intensity?: 'full' | 'subtle'
}>(), { intensity: 'full' })

// ── Network mesh nodes (in a square 100×100 viewBox) ──
const nodes = [
  { x: 10, y: 15 }, { x: 25, y: 38 }, { x: 15, y: 65 },
  { x: 8,  y: 88 }, { x: 40, y: 12 }, { x: 48, y: 50 },
  { x: 35, y: 78 }, { x: 62, y: 22 }, { x: 70, y: 55 },
  { x: 58, y: 85 }, { x: 85, y: 15 }, { x: 80, y: 45 },
  { x: 90, y: 72 }, { x: 95, y: 30 }, { x: 92, y: 88 },
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
    if (Math.sqrt(dx * dx + dy * dy) < 35) {
      connections.push({
        x1: nodes[i].x, y1: nodes[i].y,
        x2: nodes[j].x, y2: nodes[j].y,
        delay: ((i * 3 + j * 7) % 10) * 0.5,
        duration: 3 + ((i + j) % 4),
      })
    }
  }
}

// ── Particles ──
const particles = Array.from({ length: 18 }, (_, i) => ({
  left: `${(7 + i * 31) % 93}%`,
  top: `${(12 + i * 37) % 88}%`,
  size: 1.5 + (i % 4),
  delay: (i * 0.6) % 10,
  duration: 8 + (i % 5) * 2,
  dx: ((i % 7) - 3) * 15,
  dy: -(20 + (i % 5) * 12),
  opacity: 0.12 + (i % 4) * 0.06,
  hue: [186, 260, 210, 195][i % 4],
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
    'background-color': `hsla(${p.hue}, 70%, 65%, 0.7)`,
    'box-shadow': `0 0 ${p.size * 3}px hsla(${p.hue}, 70%, 60%, 0.3)`,
  } as Record<string, string>
}
</script>

<template>
  <div
    class="absolute inset-0 overflow-hidden pointer-events-none"
    :class="intensity === 'subtle' ? 'opacity-25' : ''"
  >
    <!-- ═══════════ L0 · BASE GRADIENT ═══════════ -->
    <div class="base-grad" />

    <!-- ═══════════ L1 · AURORA BLOBS ═══════════ -->
    <div class="aurora a1" />
    <div class="aurora a2" />
    <div class="aurora a3" />

    <!-- ═══════════ L2 · NETWORK MESH (SVG) ═══════════ -->
    <svg
      class="absolute inset-0 w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id="bg-glow">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="ng">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.7" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Connection lines -->
      <line
        v-for="(c, i) in connections" :key="'cl' + i"
        :x1="c.x1" :y1="c.y1" :x2="c.x2" :y2="c.y2"
        stroke="rgba(6,182,212,0.05)" stroke-width="0.12"
      />

      <!-- Data packets -->
      <circle
        v-for="(c, i) in connections" :key="'dp' + i"
        r="0.4"
        fill="#22d3ee" opacity="0.6"
        filter="url(#bg-glow)"
      >
        <animateMotion
          :dur="c.duration + 's'"
          repeatCount="indefinite"
          :begin="c.delay + 's'"
          :path="`M${c.x1} ${c.y1} L${c.x2} ${c.y2}`"
        />
      </circle>

      <!-- Network nodes -->
      <g v-for="(n, i) in nodes" :key="'nd' + i">
        <circle
          :cx="n.x" :cy="n.y" r="1.5"
          fill="url(#ng)" opacity="0.2"
        >
          <animate attributeName="r" values="1;2;1"
            :dur="(4 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.4) + 's'" />
          <animate attributeName="opacity" values="0.1;0.25;0.1"
            :dur="(4 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.4) + 's'" />
        </circle>
        <circle
          :cx="n.x" :cy="n.y" r="0.35"
          fill="#22d3ee" opacity="0.5"
        >
          <animate attributeName="opacity" values="0.3;0.7;0.3"
            :dur="(4 + (i % 3)) + 's'" repeatCount="indefinite" :begin="(i * 0.4) + 's'" />
        </circle>
      </g>
    </svg>

    <!-- ═══════════ L3 · PARTICLES ═══════════ -->
    <div
      v-for="(p, i) in (intensity === 'full' ? particles : particles.slice(0, 8))"
      :key="'pt' + i"
      class="particle"
      :style="particleStyle(p)"
    />

    <!-- ═══════════ L4 · SOFT VIGNETTE ═══════════ -->
    <div class="vignette" />
  </div>
</template>

<style scoped>
/* ──────────── BASE ──────────── */
.base-grad {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 30%, rgba(6,182,212,0.03) 0%, transparent 55%),
    radial-gradient(ellipse at 70% 60%, rgba(139,92,246,0.025) 0%, transparent 50%);
}

/* ──────────── AURORA ──────────── */
.aurora {
  position: absolute;
  border-radius: 50%;
  filter: blur(min(10vmin, 100px));
  will-change: transform;
}
.a1 {
  width: 45vmin; height: 45vmin;
  background: radial-gradient(circle, rgba(6,182,212,0.12) 0%, rgba(6,182,212,0.03) 40%, transparent 70%);
  top: -8%; left: -5%;
  animation: au1 30s cubic-bezier(0.45,0.05,0.55,0.95) infinite alternate;
}
.a2 {
  width: 38vmin; height: 38vmin;
  background: radial-gradient(circle, rgba(139,92,246,0.10) 0%, rgba(139,92,246,0.02) 40%, transparent 70%);
  top: 25%; right: -5%;
  animation: au2 36s cubic-bezier(0.45,0.05,0.55,0.95) infinite alternate;
}
.a3 {
  width: 35vmin; height: 35vmin;
  background: radial-gradient(circle, rgba(59,130,246,0.08) 0%, rgba(59,130,246,0.02) 40%, transparent 70%);
  bottom: -5%; left: 25%;
  animation: au3 28s cubic-bezier(0.45,0.05,0.55,0.95) infinite alternate;
}

@keyframes au1 {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(8vw, 6vh) scale(1.08); }
  100% { transform: translate(12vw, 4vh) scale(0.96); }
}
@keyframes au2 {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(-6vw, 4vh) scale(1.1); }
  100% { transform: translate(-4vw, -3vh) scale(0.98); }
}
@keyframes au3 {
  0%   { transform: translate(0, 0) scale(1); }
  50%  { transform: translate(5vw, -4vh) scale(1.06); }
  100% { transform: translate(-3vw, -2vh) scale(1.02); }
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
  12%  { opacity: var(--p-opacity, 0.2); transform: translate(0, 0) scale(1.1); }
  50%  { transform: translate(calc(var(--p-dx, 0px) * 0.5), calc(var(--p-dy, -30px) * 0.5)) scale(1); }
  88%  { opacity: var(--p-opacity, 0.2); }
  100% { transform: translate(var(--p-dx, 0px), var(--p-dy, -50px)) scale(0.7); opacity: 0; }
}

/* ──────────── VIGNETTE ──────────── */
.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.25) 100%);
}
</style>
