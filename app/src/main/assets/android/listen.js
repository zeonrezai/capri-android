// "Capri, …": what you say to her out loud (Ears.kt hears it, only while you turned it on in the
// app's Settings and the screen is on). The phone's own quick things first (the time, the date,
// the flashlight, hide, come back, her chat), then whatever her chat already does when you type it
// (music, volume, an app, a timer, a reminder, the battery…), and anything else is a question for
// her AI. She shows her answer in her panel and says it out loud.

import { on, send, call } from './native.js';
import { clean, mood } from '../capri/src/renderer/js/chat.js';

const WORDS = {
  es: {
    yes: ['¿Sí?', 'Dime.', 'Aquí estoy.', '¿Qué se te ofrece, choom?'],
    time: ["Son las {time}.", "Son las {time}, choom.", "Mi reloj dice {time}."],
    date: 'Hoy es {date}.',
    torchOn: 'Linterna encendida.',
    torchOff: 'Linterna apagada.',
    noTorch: 'Este teléfono no me deja usar la linterna.',
    back: 'Aquí estoy.',
    iconOn: 'Me hago ícono. Desde aquí te sigo hablando.',
    iconOff: '¡Ya salí!',
    bye: 'Me escondo. Dime «Capri, ven» y regreso.',
    deaf: 'Dejo de escuchar. Lo vuelves a activar en Ajustes.',
    thinking: '…',
    wait: ['Déjame pensarlo…', 'Ya casi, la IA va lenta ahorita.'],
    failed: 'No pude contestarte ahora.',
    late: "Ya es tarde, ¿no deberías dormir?",
    moves: ["¡Mira esto!", "¡Ahí va!", "Tú pediste show."],
    dance: "¡A bailar!",
    sleepy: "Me echo una siestita. Tócame para despertarme.",
    awake: "¡Ya desperté!",
    play: "Le doy play.",
    weather: "Te abro el clima de hoy.",
    shot: "Para una captura: botón de encendido + bajar volumen a la vez. Yo me quito de en medio.",
    radio: "Android no deja que las apps prendan o apaguen eso solas: te abro el panel, es un toque.",
    settings: "Te abro los ajustes.",
    closet: "Te abro mi vestuario. ¿Qué me pongo?",
    call: "Te abro el teléfono{who}.",
    cant: "Eso no lo pude hacer en tu teléfono.",
    help: "Puedo decirte la hora, poner música, abrir apps, poner temporizadores y recordatorios, mirar tu pantalla, bailar… La lista completa está en la app, pestaña Comandos.",
  },
  en: {
    yes: ['Yes?', 'Go on.', 'Right here.', 'What do you need, choom?'],
    time: ["It's {time}.", "It's {time}, choom.", "My clock says {time}."],
    date: 'Today is {date}.',
    torchOn: 'Flashlight on.',
    torchOff: 'Flashlight off.',
    noTorch: "This phone won't let me use the flashlight.",
    back: 'Right here.',
    iconOn: "I'll be an icon. I'll keep talking from here.",
    iconOff: "I'm out!",
    bye: "I'll hide. Say “Capri, come back” and I'm here.",
    deaf: "I'll stop listening. Turn it back on in Settings.",
    thinking: '…',
    wait: ['Let me think…', 'Almost there, the AI is slow right now.'],
    failed: "I couldn't answer you right now.",
    late: "It's late, shouldn't you sleep?",
    moves: ["Watch this!", "Here goes!", "You asked for a show."],
    dance: "Let's dance!",
    sleepy: "Taking a little nap. Tap me to wake me up.",
    awake: "I'm up!",
    play: "Hitting play.",
    weather: "Opening today's weather.",
    shot: "For a screenshot: power + volume down together. I'll get out of the way.",
    radio: "Android doesn't let apps switch that on their own: here's its panel, one tap.",
    settings: "Opening the settings.",
    closet: "Here's my wardrobe. What should I wear?",
    call: "Opening your phone app{who}.",
    cant: "I couldn't do that on your phone.",
    help: "I can tell you the time, play music, open apps, set timers and reminders, look at your screen, dance… The full list is in the app, Commands tab.",
  },
  fr: {
    yes: ['Oui ?', 'Je t’écoute.', 'Je suis là.', 'Qu’est-ce qu’il te faut, choom ?'],
    time: ["Il est {time}.", "Il est {time}, choom.", "Mon horloge dit {time}."],
    date: 'On est {date}.',
    torchOn: 'Lampe allumée.',
    torchOff: 'Lampe éteinte.',
    noTorch: 'Ce téléphone ne me laisse pas utiliser la lampe.',
    back: 'Je suis là.',
    iconOn: 'Je me mets en icône. Je continue à te parler d’ici.',
    iconOff: 'Me revoilà !',
    bye: 'Je me cache. Dis « Capri, reviens » et je reviens.',
    deaf: 'J’arrête d’écouter. Tu le réactives dans Réglages.',
    thinking: '…',
    wait: ['Laisse-moi réfléchir…', 'Presque, l’IA est lente en ce moment.'],
    failed: 'Je n’ai pas pu te répondre là.',
    late: "Il est tard, tu ne devrais pas dormir ?",
    moves: ["Regarde ça !", "C’est parti !", "Tu voulais un show."],
    dance: "On danse !",
    sleepy: "Je fais une petite sieste. Touche-moi pour me réveiller.",
    awake: "Je suis réveillée !",
    play: "J’appuie sur play.",
    weather: "Je t’ouvre la météo du jour.",
    shot: "Pour une capture : bouton marche + volume bas en même temps. Je me pousse.",
    radio: "Android ne laisse pas les applis changer ça toutes seules : voilà son panneau, un toucher suffit.",
    settings: "Je t’ouvre les réglages.",
    closet: "Voilà ma garde-robe. Je mets quoi ?",
    call: "Je t’ouvre le téléphone{who}.",
    cant: "Je n’ai pas pu le faire sur ton téléphone.",
    help: "Je peux te dire l’heure, mettre de la musique, ouvrir des applis, lancer des minuteurs et des rappels, regarder ton écran, danser… La liste complète est dans l’appli, onglet Commandes.",
  },
  pt: {
    yes: ['Sim?', 'Fala.', 'Tô aqui.', 'O que você precisa, choom?'],
    time: ["São {time}.", "São {time}, choom.", "Meu relógio diz {time}."],
    date: 'Hoje é {date}.',
    torchOn: 'Lanterna ligada.',
    torchOff: 'Lanterna desligada.',
    noTorch: 'Este celular não me deixa usar a lanterna.',
    back: 'Tô aqui.',
    iconOn: 'Virei ícone. Daqui continuo falando com você.',
    iconOff: 'Saí!',
    bye: 'Vou me esconder. Diz “Capri, volta” e eu volto.',
    deaf: 'Parei de escutar. Liga de novo em Ajustes.',
    thinking: '…',
    wait: ['Deixa eu pensar…', 'Quase lá, a IA tá lenta agora.'],
    failed: 'Não consegui te responder agora.',
    late: "Já tá tarde, não devia dormir?",
    moves: ["Olha isso!", "Lá vai!", "Você pediu show."],
    dance: "Bora dançar!",
    sleepy: "Vou tirar um cochilo. Toca em mim pra me acordar.",
    awake: "Acordei!",
    play: "Dando play.",
    weather: "Abrindo o tempo de hoje.",
    shot: "Pra print: botão de ligar + abaixar volume juntos. Eu saio da frente.",
    radio: "O Android não deixa os apps ligarem ou desligarem isso sozinhos: abri o painel, é só um toque.",
    settings: "Abrindo os ajustes.",
    closet: "Abri meu guarda-roupa. O que eu visto?",
    call: "Abrindo o telefone{who}.",
    cant: "Não consegui fazer isso no seu celular.",
    help: "Posso dizer as horas, tocar música, abrir apps, pôr timers e lembretes, olhar sua tela, dançar… A lista completa está no app, aba Comandos.",
  },
  ru: {
    yes: ['Да?', 'Слушаю.', 'Я здесь.', 'Что нужно, чум?'],
    time: ["Сейчас {time}.", "Сейчас {time}, чум.", "Мои часы говорят {time}."],
    date: 'Сегодня {date}.',
    torchOn: 'Фонарик включён.',
    torchOff: 'Фонарик выключен.',
    noTorch: 'Этот телефон не даёт мне включить фонарик.',
    back: 'Я здесь.',
    iconOn: 'Становлюсь иконкой. Отсюда тоже буду с тобой говорить.',
    iconOff: 'Я вернулась!',
    bye: 'Прячусь. Скажи «Капри, вернись», и я вернусь.',
    deaf: 'Перестаю слушать. Включить снова можно в Настройках.',
    thinking: '…',
    wait: ['Дай подумать…', 'Почти всё, ИИ сейчас медленный.'],
    failed: 'Не смогла ответить сейчас.',
    late: "Уже поздно, тебе не пора спать?",
    moves: ["Смотри!", "Поехали!", "Ты хотел шоу."],
    dance: "Танцуем!",
    sleepy: "Немного вздремну. Коснись, чтобы разбудить.",
    awake: "Я проснулась!",
    play: "Включаю.",
    weather: "Открываю погоду на сегодня.",
    shot: "Для скриншота: кнопка питания + громкость вниз вместе. Я отойду.",
    radio: "Android не даёт приложениям переключать это самим: открыла панель, одно касание.",
    settings: "Открываю настройки.",
    closet: "Открываю гардероб. Что мне надеть?",
    call: "Открываю звонилку{who}.",
    cant: "Не получилось сделать это на телефоне.",
    help: "Могу сказать время, включить музыку, открыть приложения, поставить таймер и напоминание, посмотреть на экран, потанцевать… Полный список в приложении, вкладка «Команды».",
  },
};
const LOCALES = { it: 'it-IT', es: 'es-MX', en: 'en-US', fr: 'fr-FR', pt: 'pt-BR', ru: 'ru-RU' };

// the phone's own quick things, in each of her languages (Spanish, English, French, Portuguese,
// Russian). \b doesn't see Cyrillic or accents: (?![\p{L}]) does
const TIME_ASK = /qu[eé] hora|la hora|what time|the time|quelle heure|que horas|котор(?:ый|ого) час|сколько времени/iu;
const DATE_ASK = /qu[eé] d[ií]a|qu[eé] fecha|la fecha|what day|the date|what's the date|quel jour|quelle date|que dia|qual (?:é )?a data|какое (?:сегодня )?число|какой (?:сегодня )?день/iu;
const TORCH = /linterna|l[aá]mpara|flash|torch|flashlight|lampe|torche|lanterna|фонар/iu;
const OFF = /apaga|desactiva|quita|turn off|switch off|\boff\b|[ée]teins|d[ée]sactive|desliga|выключи|погаси/iu;
const ON = /enciende|prende|activa|pon|turn on|switch on|\bon\b|allume|active|liga|acende|включи/iu;
const HIDE_ASK = /^(?:esc[oó]ndete|vete|desaparece|ocúltate|ocultate|hide|go away|get lost|cache-toi|va-t[’']en|dispara[iî]s|(?:se )?esconde|some daqui|спрячься|уйди|исчезни)(?![\p{L}])/iu;
const SHOW_ASK = /^(?:ven|aparece|regresa|vuelve|mu[eé]strate|sal|come back|come here|show up|appear|reviens|viens|appara[iî]s|volta|vem|вернись|появись|иди сюда)(?![\p{L}])/iu;
const DEAF_ASK = /deja de escuchar|no me escuches|stop listening|arr[êe]te d[’']?[ée]couter|para de (?:escutar|ouvir)|не слушай|перестань слушать/iu;
export const GAMER_ASK = /modo gamer|modo juego|voy a jugar|gamer mode|gaming mode|mode gamer|mode jeu|vou jogar|игровой режим|режим игры/iu;
// her icon mode (icon.js): on, or off ("sal del ícono", "quita el modo ícono")
export const ICON_ASK = /modo [ií]cono|hazte (?:un )?[ií]cono|en (?:tu )?[ií]cono|del [ií]cono|icon mode|as an icon|mode ic[ôo]ne|du mode ic[ôo]ne|modo [ií]cone|do [ií]cone|режим[а-я]* (?:иконки|значка)|из иконки|иконкой/iu;
// "off" for gamer and icon mode, in her languages
export const OFF_ASK = /quita|apaga|sin |desactiva|salir|sal |sal$|sal del|off|stop|leave|exit|d[ée]sactive|quitte|sors|desativa|desliga|sai |sai$|sai do|выключи|выйди|убери/iu;
export const iconOff = (text) => OFF_ASK.test(text);
const CHAT_ASK = /^(?:abre (?:el |tu )?chat|hablemos|quiero hablar|platiquemos|open (?:the |your )?chat|let'?s talk|ouvre (?:le |ton )?chat|parlons|abre o chat|vamos conversar|открой чат|давай поговорим)(?![\p{L}])/iu;
const LOOK_ASK = /mira (?:mi|la) pantalla|qu[ée] (?:ves|hay en mi pantalla)|look at my screen|what do you see|regarde (?:mon|l[’']) ?[ée]cran|olha (?:minha|a) tela|посмотри на (?:мой )?экран/iu;
// her own moves, asked plainly ("Capri, baila"): only when that's about all you said
const MOVES = [
  ['dance', /^(?:baila|bailemos|ponte a bailar|dance|let'?s dance|danse|dan[çc]a|танцуй|потанцуй)(?![\p{L}])/iu],
  ['hop', /^(?:salta|brinca|da un brinco|jump|hop|saute|pula|прыгни|подпрыгни)(?![\p{L}])/iu],
  ['spin', /^(?:gira|da (?:una )?vuelta|date (?:una )?vuelta|spin|turn around|tourne|fais un tour|gire|d[aá] uma volta|покружись|крутись)(?![\p{L}])/iu],
  ['stretch', /^(?:est[ií]rate|stretch|[ée]tire-toi|alongue-se|espregui[çc]a|потянись)(?![\p{L}])/iu],
  ['victory', /^(?:celebra|victoria|festeja|celebrate|victory|c[ée]l[èe]bre|victoire|comemora|vit[óo]ria|победа|отпразднуй)(?![\p{L}])/iu],
  ['zap', /^(?:(?:lanza|tira|echa) (?:un )?rayo|rayo|zap|lightning|[ée]clair|lance un [ée]clair|raio|solta um raio|молния|ударь молнией)(?![\p{L}])/iu],
  ['split', /^(?:(?:haz|has) (?:un |el )?split|split|do (?:a|the) split|fais le grand [ée]cart|grand [ée]cart|faz (?:um )?espacate|espacate|шпагат|сделай шпагат)(?![\p{L}])/iu],
  ['plop', /^(?:si[ée]ntate|sit(?: down)?|assieds-toi|senta|sente-se|сядь|присядь)(?![\p{L}])/iu],
  ['teleport', /^(?:teletransp[oó]rtate|teleport(?:ate)?|t[ée]l[ée]porte-toi|teletransporta-te|se teletransporta|телепортируйся)(?![\p{L}])/iu],
  ['satellite', /^(?:(?:mira|busca) el sat[ée]lite|sat[ée]lite|satellite|look at the satellite|regarde le satellite|olha o sat[ée]lite|спутник)(?![\p{L}])/iu],
  ['sleep', /^(?:du[ée]rmete|a dormir|ve a dormir|go to sleep|sleep|dors|va dormir|dorme|vai dormir|спи|засыпай|иди спать)(?![\p{L}])/iu],
  ['wake', /^(?:despierta|desp[ií]ertate|wake up|r[ée]veille-toi|acorda|просыпайся|проснись)(?![\p{L}])/iu],
];
const PLAY_SOMETHING = /^(?:pon|ponme|reproduce|play|put on|mets|joue|coloca|toca|bota|включи|поставь)\s+(?:(?:algo de|some|de la|un peu de|uma|um pouco de|alguma)\s+)?(?:m[uú]sica|music|musique|музыку|una canci[oó]n|a song|une chanson|uma m[uú]sica)(?:\s+(?:por favor|please|s'il te pla[iî]t|пожалуйста))?[.!]?$/iu;
const WEATHER_ASK = /qu[ée] tiempo hace|el clima|va a llover|how'?s the weather|what'?s the weather|weather|will it rain|quel temps|la m[ée]t[ée]o|va-t-il pleuvoir|como est[aá] o tempo|previs[ãa]o do tempo|vai chover|какая погода|погод[аы]|будет дождь/iu;
const SHOT_VOICE = /captura(?: de pantalla)?|pantallazo|screenshot|capture d['’]?[ée]cran|print(?: da tela)?|скриншот|снимок экрана/iu;
const RADIO_ASK = /(?:wi-?fi|wifi|bluetooth|datos(?: m[oó]viles)?|mobile data|donn[ée]es mobiles|dados m[oó]veis|modo avi[oó]n|airplane mode|mode avion|modo avi[aã]o|ubicaci[oó]n|location|localisation|localiza[çc][ãa]o|gps|nfc|вай-?фай|блютуз|мобильн\p{L}* данн\p{L}*|режим полёта|геолокаци\p{L}*)/iu;
const RADIO_PAGE = [['bluetooth', /bluetooth|блютуз/i], ['data', /datos|data|donn[ée]es|dados|данн/i], ['airplane', /avi[oó]n|airplane|avion|avi[aã]o|полёт/i], ['location', /ubicaci|location|localis|localiza|gps|геолок/i], ['nfc', /nfc/i], ['wifi', /./]];
const RADIO_VERB = /prende|enciende|activa|apaga|desactiva|quita|pon|turn|switch|enable|disable|allume|[ée]teins|active|d[ée]sactive|liga|desliga|ativa|desativa|включи|выключи|ajustes|settings|r[ée]glages|configura|настройк/iu;
const CALL_ASK = /^(?:llama(?:le)? a|marca(?:le)? a|call|phone|appelle|liga(?: para| pra)?|позвони)\s*(.*)$/iu;
const WARDROBE_ASK = /(?:vest[ií]te|v[ií]stete|c[aá]mbiate de ropa|(?:abre|muestra|ens[eé][ñn]a(?:me)?) (?:tu|el) (?:vestuario|ropa|armario|closet)|tu vestuario|change (?:your )?clothes|get dressed|(?:open|show)(?: me)? your (?:wardrobe|closet|clothes)|your wardrobe|habille[- ]toi|change de v[eê]tements|(?:ouvre|montre)(?:[- ]moi)? ta garde[- ]robe|ta garde[- ]robe|troca de roupa|se veste|(?:abre|mostra)(?: o)? (?:teu|seu) guarda[- ]roupa|guarda[- ]roupa|переоденься|оденься|(?:открой|покажи) (?:свой )?гардероб|гардероб)/iu;
const HELP_ASK = /^(?:qu[ée] (?:puedes|sabes) hacer|ayuda|comandos|what can you do|help|commands|qu['’]est-ce que tu sais faire|aide|commandes|o que voc[êe] (?:pode|sabe) fazer|ajuda|comandos|что ты умеешь|помощь|команды)(?![\p{L}])/iu;

// what's left of her name at the start, as the recognizer may write it (Капри in Russian)
// (and whatever came before it: "oye Capri", "ok Kapri")
const NAME = /^.*?(?<![\p{L}])(?:[ck]a[pb]r[iíy]s?|ка[пб]р[иы])(?![\p{L}])[\s,.!?:]*/iu;

let busy = 0;

export function listen({ toggleVisible, visible }) {
  on('capri:heard', (heard) => {
    // one at a time, but never stuck on one that never finished
    if (!window.dev || (busy && Date.now() - busy < 20000)) return;
    busy = Date.now();
    if (String(heard?.text || '').replace(NAME, '').trim()) window.dev.hearing?.off(); // (heard you: she answers now)
    handle(String(heard?.text || '').replace(NAME, '').trim(), { toggleVisible, visible })
      .catch((err) => console.error('[capri] voice', err))
      .finally(() => { busy = 0; });
  });
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fill = (line, vars) => line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

async function handle(text, { toggleVisible, visible }) {
  const dev = window.dev;
  const { capri, panel, chat, brain } = dev;
  const lang = WORDS[brain.lang] ? brain.lang : 'en';
  const t = WORDS[lang];
  const locale = LOCALES[lang];

  // her answer: in her panel, and out loud
  const answer = (line, face = 'smug', quote = text, aloud = true) => {
    if (!chat.open) panel.say({ kind: 'info', face, line, quote: quote || '', hold: 5000 + line.length * 45 });
    if (aloud) send('voice:say', { text: spoken(line), lang: locale });
  };

  if (HIDE_ASK.test(text)) {
    answer(t.bye, 'aside');
    window.dev?.poses?.cue('bye', { times: 1 }); // a wave and she glitches out, when it's drawn
    setTimeout(() => toggleVisible(false), 1800);
    return;
  }
  // her icon mode, before "sal…" / "ven…" (come back) would take "sal del ícono"
  if (ICON_ASK.test(text)) {
    const on = !iconOff(text);
    window.host.setConfig({ icon: on, visible: true }); // (put away: out again, as an icon or whole)
    return setTimeout(() => answer(on ? t.iconOn : t.iconOff, on ? 'smug' : 'laugh'), 1200);
  }
  // anything else, she's out for it
  if (!visible()) {
    toggleVisible(true);
    await new Promise((r) => setTimeout(r, 900));
    if (!text || SHOW_ASK.test(text)) return answer(t.back, 'laugh', '');
  }
  capri.wake?.();

  // just her name: she listens for what comes next (Ears.kt keeps the mic open a few seconds)
  if (!text) {
    // shown, not said: her voice would cover what you say next (her ears stay open for it)
    dev.hearing?.on(10000); // (and her sign that she's listening: hearing.js)
    capri.perform?.('hop');
    window.dev.voice?.play?.('tick');
    return answer(pick(t.yes), 'look', '', false);
  }
  if (SHOW_ASK.test(text)) {
    setTimeout(() => dev.poses?.wave(), 400);
    return answer(t.back, 'laugh');
  }
  // (a secret: wedding.js)
  if (await dev.wedding?.heard(text, (line) => send('voice:say', { text: spoken(line), lang: locale }))) return;
  if (DEAF_ASK.test(text)) {
    answer(t.deaf, 'aside');
    send('voice:off');
    return;
  }
  if (TIME_ASK.test(text) && text.split(/\s+/).length <= 8) {
    const now = new Date();
    const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(now);
    const late = now.getHours() >= 0 && now.getHours() < 5 ? ` ${t.late}` : '';
    return answer(fill(pick(t.time), { time }).replace(/\.\.$/, '.') + late, late ? 'aside' : 'look');
  }
  if (DATE_ASK.test(text) && text.split(/\s+/).length <= 8) {
    const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    return answer(fill(t.date, { date }), 'look');
  }
  if (TORCH.test(text)) {
    const want = OFF.test(text) ? false : ON.test(text) ? true : null;
    const res = await Promise.race([call('voice:torch', { on: want }), new Promise((r) => setTimeout(() => r(null), 4000))]).catch(() => null);
    if (res == null) return answer(t.noTorch, 'aside');
    capri.pulse?.();
    return answer(res ? t.torchOn : t.torchOff, 'smug');
  }
  if (CHAT_ASK.test(text)) return chat.start();
  if (HELP_ASK.test(text)) return answer(t.help, 'smug');
  if (WARDROBE_ASK.test(text) && dev.wardrobe) {
    dev.wardrobe.open();
    return answer(t.closet, 'smug');
  }


  // Italian personal-assistant commands. They open apps/drafts; they never send or purchase.
  let m = /^(?:cerca|cercami) (.+?) su spotify$/iu.exec(text);
  if (m) {
    const ok = await call('spotify:search', { query: m[1] }).catch(() => false);
    return answer(ok ? 'Apro la ricerca su Spotify.' : t.cant, ok ? 'smug' : 'aside');
  }
  m = /^(?:cerca|cercami) (.+?) su youtube$/iu.exec(text);
  if (m) {
    const ok = await call('youtube:search', { query: m[1] }).catch(() => false);
    return answer(ok ? 'Apro i risultati su YouTube.' : t.cant, ok ? 'smug' : 'aside');
  }
  m = /^(?:portami|naviga|vai) (?:a|verso) (.+)$/iu.exec(text);
  if (m) {
    const ok = await call('maps:navigate', { destination: m[1] }).catch(() => false);
    return answer(ok ? 'Apro la navigazione.' : t.cant, ok ? 'smug' : 'aside');
  }
  m = /^(?:apri|avvia) (?:l'app )?(.+)$/iu.exec(text);
  if (m) {
    const result = await call('apps:openByName', { name: m[1] }).catch(() => 'failed');
    if (typeof result === 'string' && result.startsWith('opened:')) return answer('Apro ' + result.slice(7) + '.', 'smug');
    if (typeof result === 'string' && result.startsWith('ambiguous:')) return answer('Ho trovato più app: ' + result.slice(10), 'aside');
    return answer('Non trovo un’app con quel nome.', 'aside');
  }
  m = /^(?:scrivi|prepara) (?:un )?messaggio whatsapp(?: dicendo)?\s+(.+)$/iu.exec(text);
  if (m) {
    const ok = await call('whatsapp:draft', { message: m[1] }).catch(() => false);
    return answer(ok ? 'Ho preparato il messaggio in WhatsApp. Scegli tu il destinatario e invialo quando vuoi.' : t.cant, ok ? 'smug' : 'aside');
  }
  if (/^(?:leggi|leggimi|cosa c['’]è scritto|che cosa c['’]è scritto) (?:sullo )?(?:schermo|schermata|display)|^leggi questa schermata$/iu.test(text)) {
    const visibleText = await call('accessibility:readVisible', {}).catch(() => '');
    if (typeof visibleText !== 'string' || !visibleText.trim()) {
      return answer('Per leggere il testo devi attivare il servizio di accessibilità di Capri nelle impostazioni Android.', 'aside');
    }
    await chat.start();
    if (chat.open) chat.send('Interpreta questo testo visibile sullo schermo e aiutami in italiano. Non inventare informazioni mancanti.\\n\\n' + visibleText.slice(0, 5000));
    return;
  }
  m = /^(?:tocca|premi|seleziona) (.+)$/iu.exec(text);
  if (m) {
    const result = await call('accessibility:clickVisible', { label: m[1] }).catch(() => 'click_failed');
    if (result === 'clicked') return answer('Fatto.', 'smug');
    if (result === 'service_not_enabled') return answer('Attiva prima il servizio di accessibilità di Capri nelle impostazioni Android.', 'aside');
    if (result === 'sensitive_action_blocked') return answer('Non eseguo direttamente invii, cancellazioni, pagamenti o conferme.', 'aside');
    if (result === 'not_unique') return answer('Ci sono più elementi con quel nome: non ne seleziono nessuno.', 'aside');
    return answer('Non sono riuscita a premere quell’elemento.', 'aside');
  }

  // her own moves
  const words = text.split(/\s+/).length;
  const move = words <= 5 && !/canci|song|chanson|m[uú]sica|music|faixa|песн|трек|v[ií]deo/iu.test(text) && MOVES.find(([, re]) => re.test(text))?.[0];
  if (move) return moveFor(move, { capri, answer, t });

  // the phone's own things, said plainly
  if (PLAY_SOMETHING.test(text)) {
    const ok = await window.host.media('play').catch(() => false);
    return answer(ok ? t.play : t.cant, ok ? 'laugh' : 'aside');
  }
  if (WEATHER_ASK.test(text) && words <= 10) {
    send('open:url', { url: `https://www.google.com/search?q=${encodeURIComponent(WEATHER_SEARCH[lang])}` });
    return answer(t.weather, 'smug');
  }
  if (SHOT_VOICE.test(text) && words <= 8 && !LOOK_ASK.test(text)) return answer(t.shot, 'aside');
  if (RADIO_ASK.test(text) && RADIO_VERB.test(text) && words <= 10) {
    const page = RADIO_PAGE.find(([, re]) => re.test(text))[0];
    const ok = await call('pc:do', { action: 'settings', page }).catch(() => false);
    return answer(ok ? (ON.test(text) || OFF.test(text) ? t.radio : t.settings) : t.cant, 'smug');
  }
  const calling = words <= 6 && CALL_ASK.exec(text);
  if (calling) {
    const who = calling[1].replace(/[.!?]+$/, '').trim();
    send('open:url', { url: 'tel:' });
    return answer(fill(t.call, { who: who ? ` (${who})` : '' }), 'smug');
  }
  // gamer mode: she says so herself (host.js gamerMode), and her ears rest until it's off
  if (GAMER_ASK.test(text)) return window.host.setConfig({ gamer: true });
  // streaming mode: her co-hosting your live (stream.js), on or off
  if (dev.stream?.wants(text)) return dev.stream.set(!OFF_ASK.test(text));

  // her chat open: what you said goes into it, as if you typed it
  if (chat.open) return chat.send(text);

  // "Capri, tradúceme esto" / "dame un consejo": in her chat, where it can be read (translate.js, coach.js)
  if (dev.translate?.wants(text) || dev.coach?.wants(text)) {
    await chat.start();
    if (chat.open) chat.send(text);
    return;
  }

  // what her chat does right away when you ask it plainly (music, volume, an app, a timer…)
  const asked = chat.asked(text);
  // "Capri, mira mi pantalla": her look (Android asks first)
  if (asked?.kind === 'look' || LOOK_ASK.test(text)) {
    return dev.look?.once();
  }
  if (asked && !['look', 'close', 'files', 'shot'].includes(asked.kind)) {
    chat.listApps();
    const done = await chat.doNow(asked).catch(() => null);
    if (done?.line) return answer(done.line, done.face || 'smug');
    // something to do on the phone that didn't work: said so, not a long wait for her AI
    if (['media', 'music', 'youtube', 'pc'].includes(asked.kind)) return answer(t.cant, 'aside');
  }

  // anything else: a question for her AI, answered short, to be said out loud
  const status = await window.host.chatStatus().catch(() => ({ ok: false }));
  if (!status.ok) return chat.start(); // nothing to talk with yet: her setup
  panel.say({ kind: 'info', face: 'aside', line: t.thinking, quote: text, hold: null });
  const id = Date.now();
  const note = `(Note for you, never repeat it: this was said out loud and your answer will be read out loud, so answer in one to three short sentences, plain words, no lists. ${chat.languageNote()})`;
  const messages = [
    { role: 'system', content: chat.persona() },
    ...chat.history.slice(-20),
    { role: 'user', content: `${text}\n\n${note}` },
  ];
  // a slow answer (the free AI gives one every 45 s): she says out loud that she heard you
  const waits = [5000, 22000].map((ms, i) => setTimeout(() => answer(t.wait[i], 'aside', text), ms));
  const res = await window.host.chatSend({ id, messages }).catch((err) => ({ ok: false, error: err.message }))
    .finally(() => waits.forEach(clearTimeout));
  if (!res?.ok) return answer(t.failed, 'wide');
  const said = clean(res.text) || '…';
  chat.history.push({ role: 'user', content: text });
  chat.remember({ role: 'assistant', content: said });
  answer(said, mood(said));
}

const WEATHER_SEARCH = { it: 'meteo oggi', es: 'clima hoy', en: 'weather today', fr: 'météo aujourd’hui', pt: 'previsão do tempo hoje', ru: 'погода сегодня' };

// one of her moves, by name, with a word about it
async function moveFor(move, { capri, answer, t }) {
  const host = window.host;
  const side = capri.towardCenter?.() || 1;
  if (move === 'teleport' || move === 'satellite') {
    host.command?.(move);
    return;
  }
  if (move === 'sleep') {
    answer(t.sleepy, 'calm');
    setTimeout(() => capri.doze?.(), 2500);
    return;
  }
  if (move === 'wake') {
    await capri.rouse?.();
    return answer(t.awake, 'laugh');
  }
  if (move === 'dance') {
    answer(t.dance, 'laugh');
    // her dance, drawn cel by cel (poses.js), when it's in
    if (window.dev?.poses?.has('dance') && await window.dev.poses.play('dance', { hold: 7000 })) return;
    for (const [act, ms] of [['spin', 0], ['hop', 1300], ['split', 2300], ['victory', 3700]]) setTimeout(() => capri.perform?.(act, side), ms);
    return;
  }
  answer(pick(t.moves), 'laugh', '', false);
  setTimeout(() => capri.perform?.(move, side), 300);
}

// what TTS reads: no tags, no markdown, no emoji
function spoken(line) {
  return String(line)
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
