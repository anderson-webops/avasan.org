<script setup lang="ts">
definePageMeta({
  layout: 'home',
})
</script>

<template>
  <section class="home">
    <div class="intro">
      <p class="eyebrow">
        Julio
      </p>
      <h1>Math and computer science for young learners.</h1>
      <p class="lede">
        I teach math and computer science to grade-school students.
      </p>
      <a class="site-link" href="https://cs.avasan.org">
        Visit the computer science site
        <span aria-hidden="true">→</span>
      </a>
    </div>
  </section>
</template>

<style scoped>
.home {
  position: relative;
  isolation: isolate;
  display: grid;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  place-items: center;
  overflow: hidden;
  padding: clamp(2rem, 7vw, 5rem);
  background:
    radial-gradient(circle at 12% 18%, var(--page-accent-soft), transparent 28rem),
    radial-gradient(circle at 88% 82%, var(--page-accent-soft), transparent 24rem), var(--page-background);
}

.home::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  background-image: radial-gradient(var(--page-dot) 1px, transparent 1px);
  background-size: 2rem 2rem;
  content: '';
  mask-image: radial-gradient(circle at center, black, transparent 76%);
}

.intro {
  width: min(100%, 58rem);
  text-align: center;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0 0 1.5rem;
  color: var(--page-accent);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.eyebrow::before {
  width: 1.65rem;
  height: 2px;
  background: currentcolor;
  content: '';
}

h1 {
  max-width: 15ch;
  margin: 0 auto;
  font-family: 'DM Serif Display', serif;
  font-size: clamp(3.25rem, 9vw, 7.5rem);
  font-weight: 400;
  letter-spacing: -0.045em;
  line-height: 0.94;
  text-wrap: balance;
}

.lede {
  max-width: 34rem;
  margin: clamp(1.6rem, 4vw, 2.4rem) auto 0;
  color: var(--page-muted);
  font-size: clamp(1.05rem, 2.1vw, 1.3rem);
  line-height: 1.65;
  text-wrap: balance;
}

.site-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
  margin-top: clamp(2rem, 5vw, 3rem);
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.92rem 1.3rem 0.92rem 1.45rem;
  background: var(--page-accent);
  color: var(--page-background);
  font-weight: 700;
  line-height: 1.2;
  text-decoration: none;
  transition:
    background-color 160ms ease,
    transform 160ms ease;
}

.site-link span {
  font-size: 1.2em;
  transition: transform 160ms ease;
}

.site-link:hover {
  background: var(--page-accent-strong);
  transform: translateY(-2px);
}

.site-link:hover span {
  transform: translateX(0.18rem);
}

.site-link:focus-visible {
  outline: 3px solid var(--page-focus);
  outline-offset: 4px;
}

@media (width <= 36rem) {
  .home {
    padding-inline: 1.35rem;
  }

  h1 {
    font-size: clamp(3.15rem, 16vw, 5rem);
  }

  .site-link {
    width: 100%;
    max-width: 21rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-link,
  .site-link span {
    transition: none;
  }
}
</style>
