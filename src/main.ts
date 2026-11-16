import { App } from './app';
import { getLang, setLang } from './i18n';
import './style.css';

setLang(getLang());
const app = new App(document.getElementById('app')!);
void app.start();
// ułatwia diagnozę w konsoli przeglądarki
(window as unknown as { editor: App }).editor = app;
