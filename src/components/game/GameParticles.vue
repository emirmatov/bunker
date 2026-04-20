<script setup>
defineProps({
  show:     { type: Boolean, required: true },
  particles: { type: Array,   default: () => [] },
  origin:   { type: Object,  default: () => ({ x: 0, y: 0 }) },
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="particles-root" aria-hidden="true">
      <span
        v-for="(p, i) in particles" :key="i"
        class="particle"
        :style="{
          left: origin.x + 'px', top: origin.y + 'px',
          width: p.size + 'px', height: p.size + 'px',
          background: p.color,
          '--tx': p.tx + 'px', '--ty': p.ty + 'px',
          animationDuration: p.dur + 's',
          animationDelay: p.delay + 's',
        }"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.particles-root { position:fixed; inset:0; pointer-events:none; z-index:10000; overflow:visible; }
.particle {
  position:absolute; border-radius:50%;
  transform:translate(-50%,-50%);
  animation:particle-fly var(--dur,0.8s) ease-out forwards;
  will-change:transform,opacity;
}
@keyframes particle-fly {
  0%   { transform:translate(-50%,-50%) scale(1); opacity:1; }
  100% { transform:translate(calc(-50% + var(--tx)),calc(-50% + var(--ty))) scale(0); opacity:0; }
}
</style>
