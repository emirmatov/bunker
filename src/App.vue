<script setup>
import { RouterView } from 'vue-router'
import Toast from 'primevue/toast'

</script>

<template>
  <Toast position="top-center" />
  <RouterView />
</template>

<style>
/* Сюда позже добавим базовые стили (сброс отступов, шрифты) */
body {
  margin: 0;
  font-family: sans-serif;
  background-color: #1a1a1a; /* Мрачный фон для атмосферы бункера */
  color: #ffffff;
}
</style>
