import { createApp } from "vue";

import App from "./App.vue";
import { initTheme } from "./composables/useTheme";
import { i18n } from "./i18n";
import router from "./router";
import { authStore } from "./stores/Auth";
import "./styles.css";

initTheme();

const app = createApp(App);
app.use(i18n);
app.use(router);

await authStore.ensureSession();
await router.isReady();

app.mount("#app");
