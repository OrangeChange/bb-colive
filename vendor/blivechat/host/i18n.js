import Vue from 'vue';
import VueI18n from 'vue-i18n';
import zh from '../upstream/frontend/src/lang/zh';
import en from '../upstream/frontend/src/lang/en';
import ja from '../upstream/frontend/src/lang/ja';
Vue.use(VueI18n);
const defaultLocale = navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('ja') ? 'ja' : 'en';
export const i18n = new VueI18n({ locale: defaultLocale, fallbackLocale: 'zh', messages: { zh, en, ja } });
export function setLocale(locale) { if (['zh','en','ja'].includes(locale)) i18n.locale = locale; }
