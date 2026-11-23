import { createApp } from 'vue'
import { hintDirective, installHintHost } from './components/hint'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.directive('hint', hintDirective)
installHintHost(document)
app.mount('#app')
