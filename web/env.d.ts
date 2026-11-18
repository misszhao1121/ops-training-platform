/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module 'element-plus/dist/locale/*.mjs' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locale: { name: string; el: any };
  export default locale;
}
