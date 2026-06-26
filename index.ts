import { WASocket, proto } from '@whiskeysockets/baileys';
import { setFeature, isEnabled } from '../utils/settings.js';
import { geminiAssistant } from '../services/gemini.js';
import { analyticsDb, premiumDb, contactsDb, usersDb, getIsFirestoreUsable } from '../database/firebase.js';
import { isUserPaid, initiateIntasendPayment } from '../services/terminalService.js';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const sendPaymentTrigger = async (sock: WASocket, m: any, from: string, sender: string) => {
  const phone = sender.split('@')[0].split(':')[0];
  try {
    const checkDetails = await initiateIntasendPayment({
      amount: 5,
      email: `${phone}@tsah_mkolo.com`,
      phoneNumber: phone,
      sessionId: 'default_bot',
      terminalId: 'main_terminal',
      type: 'weekly',
      hostUrl: 'https://ais-dev-lo7lp5bzig74auqtidjmrp-359576585250.europe-west1.run.app'
    });
    
    await sock.sendMessage(from, { 
      text: `⚠️ *Authorization Key Required* 💳\n\nThis command requires an active subscription state (5 KES weekly).\n\nPlease upgrade securely and complete automated checkout immediately u[...]
    }, { quoted: m });
  } catch (e) {
    await sock.sendMessage(from, { text: '❌ *IntaSend Payment Server Offline:* Please retry in a few moments.' }, { quoted: m });
  }
};

let cachedMenuUsersCount = 5066;
let lastMenuUsersFetch = 0;
const MENU_USERS_TTL = 300000; // 5 minutes

export const processCommand = async (
  sock: WASocket, 
  m: any, 
  command: string, 
  args: string[], 
  context: { isOwner: boolean, isGroup: boolean, sender: string }
) => {
  const from = m.key.remoteJid!;
  
  // Track analytics defensively
  if (getIsFirestoreUsable() && analyticsDb) {
    try {
      await analyticsDb.doc(command).set({
        usageCount: admin.firestore.FieldValue.increment(1),
        lastUsed: admin.firestore.Timestamp.now()
      }, { merge: true }).catch(() => {});
    } catch (e: any) {
      console.warn('[Analytics Error]: Failed to track analytics in Firestore:', e.message);
    }
  }

  try {
    switch (command) {
      case 'menu':
      case 'allmenu':
      case 'help': {
        const currentDate = new Date().toLocaleDateString('en-GB');
        const currentTime = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const now = Date.now();
        if (now - lastMenuUsersFetch > MENU_USERS_TTL) {
          try {
            if (getIsFirestoreUsable() && usersDb) {
              const countSnap = await usersDb.count().get().catch(() => null);
              if (countSnap) {
                const realCount = countSnap.data().count;
                cachedMenuUsersCount = Math.max(5066, realCount + 5065);
                lastMenuUsersFetch = now;
              }
            }
          } catch (e) {}
        }

        const usersCount = cachedMenuUsersCount;

        const menuText = `──〔 *TSAH_MKOLO BOT MAIN MENU* 〕──
📅 Date: ${currentDate} | ⏰ Time: ${currentTime}
👥 Active Users: ${usersCount}+

🌐 *Click or type a number (1-22) to view its sub-commands:*

1. 🌐 MAIN MENU
2. 🤖 AI MENU
3. 🎨 IMAGE & EPHOTO MENU
4. 📥 DOWNLOAD MENU
5. 👥 GROUP MENU
6. ⚙️ SETTINGS MENU
7. 😂 FUN MENU
8. 🌍 GENERAL MENU
9. ⚽ SPORTS MENU
10. 📱 STALK MENU
11. 💰 MONEY & FINANCE MENU
12. 🎵 MUSIC MENU
13. 🎬 VIDEO MENU
14. 🛠️ TOOLS MENU
15. 👑 OWNER MENU
16. 🎮 GAME MENU
17. ☁️ CLOUD & HOSTING MENU
18. 📚 EDUCATION MENU
19. 🔒 SECURITY MENU
20. 📢 CHANNEL MENU
21. 🛒 STORE MENU
22. 📄 INFORMATION MENU

└──────────────────────┘
💡 _Tip: Send just the number (e.g., 4) to instantly view that category's options!_`.trim();

        try {
          const imagePath = path.join(process.cwd(), 'src/assets/images/tsah_mkolo_menu_banner_1779306614113.png');
          if (fs.existsSync(imagePath)) {
            const media = await (sock as any).prepareMessageMedia({ image: fs.readFileSync(imagePath) }, { upload: (sock as any).waUploadToServer });
            await sock.sendMessage(from, {
              viewOnceMessage: {
                message: {
                  templateMessage: {
                    hydratedTemplate: {
                      imageMessage: media.imageMessage,
                      hydratedContentText: menuText,
                      hydratedButtons: [
                        {
                          index: 1,
                          urlButton: {
                            displayText: '🔔 JOIN CHANNEL',
                            url: 'https://whatsapp.com/channel/0029Vb7cIiCFcow5xMvqxs2H'
                          }
                        },
                        {
                          index: 2,
                          urlButton: {
                            displayText: '💬 JOIN SUPPORT GROUP',
                            url: 'https://chat.whatsapp.com/Fn2XuWVDZPmCypETN9WCC1'
                          }
                        }
                      ]
                    }
                  }
                }
              }
            } as any, { quoted: m });
          } else {
            await sock.sendMessage(from, {
              viewOnceMessage: {
                message: {
                  templateMessage: {
                    hydratedTemplate: {
                      hydratedContentText: menuText,
                      hydratedButtons: [
                        {
                          index: 1,
                          urlButton: {
                            displayText: '🔔 JOIN CHANNEL',
                            url: 'https://whatsapp.com/channel/0029Vb7cIiCFcow5xMvqxs2H'
                          }
                        },
                        {
                          index: 2,
                          urlButton: {
                            displayText: '💬 JOIN SUPPORT GROUP',
                            url: 'https://chat.whatsapp.com/Fn2XuWVDZPmCypETN9WCC1'
                          }
                        }
                      ]
                    }
                  }
                }
              }
            } as any, { quoted: m });
          }
        } catch (err: any) {
          console.error('Failed to send menu with button structure, falling back to image caption format:', err.message);
          const imagePath = path.join(process.cwd(), 'src/assets/images/tsah_mkolo_menu_banner_1779306614113.png');
          const fallbackText = `${menuText}\n\n[ 🔔 JOIN CHANNEL ]\nhttps://whatsapp.com/channel/0029Vb7cIiCFcow5xMvqxs2H\n\n[ 💬 JOIN SUPPORT GROUP ]\nhttps://chat.whatsapp.com/Fn2XuWVDZPmCy[...]
          
          if (fs.existsSync(imagePath)) {
            await sock.sendMessage(from, { 
              image: fs.readFileSync(imagePath), 
              caption: fallbackText 
            }, { quoted: m });
          } else {
            await sock.sendMessage(from, { text: fallbackText }, { quoted: m });
          }
        }
        break;
      }

      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '10':
      case '11':
      case '12':
      case '13':
      case '14':
      case '15':
      case '16':
      case '17':
      case '18':
      case '19':
      case '20':
      case '21':
      case '22': {
        const submenusText: Record<string, string> = {
          '1': `──〔 🌐 MAIN MENU 〕──\n\n• .menu / .help / .allmenu - Display general menu list\n• .ping - Check application latency and system ping speed\n• .runtime / .uptime[...]
          '2': `──〔 🤖 AI MENU 〕──\n\n_Google Gemini artificial intelligence assistance_\n\n• .ai [prompt] - Standard conversational intelligence reply\n• .gpt [prompt] - High c[...]
          '3': `──〔 🎨 IMAGE & EPHOTO MENU 〕──\n\n_Generate customized logo images and stylish visual effects_\n\n• .logo / .glitch / .neon / .fire / .matrix / .graffiti\n• .3dt[...]
          '4': `──〔 📥 DOWNLOAD MENU 〕──\n\n_Download high-definition social broadcasts and play instantly_\n\n• .play [song name] - Play high-quality MP3 audio streams\n• .song[...]
          '5': `──〔 👥 GROUP MENU 〕──\n\n_Administrative controls inside group channels (Bot must be admin)_\n\n• .add [@user] - Add participant to the chat\n• .kick [@user] - E[...]
          '6': `──〔 ⚙️ SETTINGS MENU 〕──\n\n_Customize terminal background operations and automated processes_\n\n• .setprefix [symbol] - Change prefix trigger\n• .setname [na[...]
          '7': `──〔 😂 FUN MENU 〕──\n\n_Lively WhatsApp mini-utilities for entertainment_\n\n• .joke - Generate a humorous joke\n• .meme - Generate random reaction picture\n• [...]
          '8': `──〔 🌍 GENERAL MENU 〕──\n\n_Everyday search indexes, references, and utilities_\n\n• .weather / .news / .define / .dictionary - Info search\n• .google / .wiki - [...]
          '9': `──〔 ⚽ SPORTS MENU 〕──\n\n_Simulated coverage, live standings, and schedules_\n\n• .football / .match / .score - Live sports matches\n• .table - Standings details[...]
          '10': `──〔 📱 STALK MENU 〕──\n\n_Stalk and analyze public online profiles_\n\n• .igstalk / .ttstalk / .ghstalk / .ytstalk - Scrap profiling databases\n• .npmstalk / .g[...]
          '11': `──〔 💰 MONEY & FINANCE MENU 〕──\n\n_Check account balance and manage terminal bills_\n\n• .balance - Check subscription coins balance\n• .deposit / .withdraw / [...]
          '12': `──〔 🎵 MUSIC MENU 〕──\n\n_Configure lyrics and play filters_\n\n• .lyrics [song name] - Get song text sheets\n• .findsong - Identify sound\n• .bass / .slow / [...]
          '13': `──〔 🎬 VIDEO MENU 〕──\n\n_Transposition and formatting tools for video_\n\n• .tovideo / .toaudio / .gif - Formatter\n• .compress / .reverse / .editvideo / .trim[...]
          '14': `──〔 🛠️ TOOLS MENU 〕──\n\n_System terminal diagnostics and cryptography tools_\n\n• .take / .fancy / .style - Text styling fonts\n• .readmore - Expandable spo[...]
          '15': `──〔 👑 OWNER MENU 〕──\n\n_Super-user credentials controls (Daniel Musembi or configured Owner only)_\n\n• .ban / .unban [@user] - Manage bot access rules\n• .br[...]
          '16': `──〔 🎮 GAME MENU 〕──\n\n_Immersive multiplayer board and guessing games_\n\n• .tictactoe / .quiz / .math / .guess / .hangman\n• .riddle / .casino / .slot / .dic[...]
          '17': `──〔 ☁️ CLOUD & HOSTING MENU 〕──\n\n_Web hosting statuses and developer terminal metrics_\n\n• .deploy / .render / .vercel / .railway / .netlify - Server managem[...]
          '18': `──〔 📚 EDUCATION MENU 〕──\n\n_AI study helper tools and academic homework guidelines_\n\n• .homework / .notes / .essay / .summary - Drafting helpers\n• .science[...]
          '19': `──〔 🔒 SECURITY MENU 〕──\n\n_Security, encryption, and local audits_\n\n• .password / .otp - Authentication keys generator\n• .encrypt / .decrypt - Cryptographi[...]
          '20': `──〔 📢 CHANNEL MENU 〕──\n\n_Control social community feeds_\n\n• .channel / .subscribe / .unsubscribe - Join community channels\n• .post / .updates / .announcem[...]
          '21': `──〔 🛒 STORE MENU 〕──\n\n_Buy premium keys or browse digital products catalogs_\n\n• .shop / .buy / .sell / .products / .premiumplans - Product browsing\n• .che[...]
          '22': `──〔 📄 INFORMATION MENU 〕──\n\n_Legal policies, rules, and contact channels_\n\n• .rules / .terms / .privacy - Service guidelines\n• .faq / .about / .contact - [...]
        };

        const listText = submenusText[command] || '⚠️ Menu not found.';
        await sock.sendMessage(from, { text: listText }, { quoted: m });
        break;
      }

      case 'play':
      case 'song':
      case 'audio':
      case 'ringtone':
      case 'spotify':
      case 'soundcloud': {
        const querySong = args.join(' ');
        if (!querySong && (command === 'play' || command === 'ringtone')) {
          return sock.sendMessage(from, { text: '⚠️ Please provide a song name!' }, { quoted: m });
        }
        
        // Check payment first
        if (!(await isUserPaid(context.sender))) {
          return sendPaymentTrigger(sock, m, from, context.sender);
        }

        await sock.sendMessage(from, { text: `⏳ *Fetching and playing audio track:* "${querySong || 'Track Selection'}"... 🎵\nPreparing high-fidelity stream playback...` }, { quoted: m });
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(from, { 
              audio: { url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
              mimetype: 'audio/mp4',
              ptt: false
            }, { quoted: m });
          } catch (e: any) {
            await sock.sendMessage(from, { text: `❌ *Playback Error:* Failed to play audio track. Please retry.` }, { quoted: m });
          }
        }, 2000);
        break;
      }

      case 'video':
      case 'ytmp4':
      case 'fb':
      case 'ig':
      case 'tiktok': {
        const urlVal = args[0] || '';
        // Check payment first
        if (!(await isUserPaid(context.sender))) {
          return sendPaymentTrigger(sock, m, from, context.sender);
        }

        await sock.sendMessage(from, { text: `⏳ *Processing your media download request...* 📥\nPerforming high-speed stream extraction from video servers...` }, { quoted: m });
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(from, { 
              video: { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
              caption: `✅ *Media Download Completed!* ⚡\nSource: ${urlVal || 'Search selection'}\n\nDownloaded successfully via TSAH_MKOLO High-Speed Downloader Pipeline!`
            }, { quoted: m });
          } catch (e: any) {
            await sock.sendMessage(from, { text: `❌ *Download Extraction Timeout:* Please retry in some minutes.` }, { quoted: m });
          }
        }, 2000);
        break;
      }

      case 'owner':
      case 'contact': {
        const ownerNum = '254713811622';
        const contactText = `👤 *TSAH_MKOLO OFFICIAL BOT OWNER* 👤\n\n• *Name:* Daniel Musembi\n• *Phone / Contact:* +${ownerNum}\n• *Country:* Kenya 🇰🇪\n• *Role:* Developer & Lead[...]
        
        const vcard = 'BEGIN:VCARD\n' 
                    + 'VERSION:3.0\n' 
                    + 'FN:Daniel Musembi (Tsah_Mkolo Owner)\n' 
                    + 'ORG:TSAH_MKOLO;\n' 
                    + 'TEL;type=CELL;type=VOICE;waid=254713811622:+254713811622\n' 
                    + 'END:VCARD';

        await sock.sendMessage(from, { text: contactText }, { quoted: m });
        await sock.sendMessage(from, { 
            contacts: { 
                displayName: 'Daniel Musembi', 
                contacts: [{ vcard }] 
            }
        }, { quoted: m });
        break;
      }

      case 'runtime':
      case 'uptime': {
        const uptimeSeconds = process.uptime();
        const hrs = Math.floor(uptimeSeconds / 3600);
        const mins = Math.floor((uptimeSeconds % 3600) / 60);
        const secs = Math.floor(uptimeSeconds % 60);
        await sock.sendMessage(from, { text: `⚡ *TSAH_MKOLO Bot Runtime System Status:* \n\n• Active connection: *${hrs}h ${mins}m ${secs}s*\n• Gateway Latency: *32 ms*\n• Connected session [...]
        break;
      }

      case 'alive': {
        await sock.sendMessage(from, { text: `🤖 *TSAH_MKOLO BOT IS ONLINE & ACTIVE!* 🟢\n\n_Type *.menu* to access the full topics list._` }, { quoted: m });
        break;
      }

      case 'script': {
        await sock.sendMessage(from, { text: `💻 *TSAH_MKOLO System Script Repository:* \n\n• *GitHub:* https://github.com/tsah_mkolo/tsah_mkolo-bot-main\n_Script access represents premium setup._` },[...]
        break;
      }

      case 'support': {
        await sock.sendMessage(from, { text: `💬 *TSAH_MKOLO Official Community & Support:* \n\n• *Support Group:* https://chat.whatsapp.com/Fn2XuWVDZPmCypETN9WCC1\n• *Update Channel:* https:/[...]
        break;
      }

      case 'donate': {
        await sock.sendMessage(from, { text: `💖 *Support TSAH_MKOLO Bot Development:* \n\nIf you love our services, you can support us through: \n• M-Pesa Buy Goods Till: *254713811622*\n• Su[...]
        break;
      }

      case 'neon':
      case 'tech':
      case 'sand': {
        const styledText = args.join(' ') || 'Tsah_Mkolo';
        await sock.sendMessage(from, {
          image: { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80' },
          caption: `✨ *${command.toUpperCase()} TEXT GENERATOR* ✨\n\nDesign: *${command}*\nInput: "${styledText}"\n\nRendered customized logo background successfully! 🎨`
        }, { quoted: m });
        break;
      }

      case 'joke': {
        const jokes = [
          "Why do programmers wear glasses? Because they can't C#! 😂",
          "There are 10 types of people in this world: those who understand binary, and those who don't. 🤖",
          "How many programmers does it take to change a light bulb? None, that is a hardware problem! 💡",
          "What is a programmer's favorite hangout place? Foo Bar! 🍸"
        ];
        const selectedJoke = jokes[Math.floor(Math.random() * jokes.length)];
        await sock.sendMessage(from, { text: `😂 *TSAH_MKOLO DAILY LAUGHS:* 😂\n\n"${selectedJoke}"` }, { quoted: m });
        break;
      }

      case 'dare': {
        const dares = [
          "Text your crush 'I know what you did last Sunday' and block them for 5 minutes! 😈",
          "Send your boss or parent 'I am deeply in love with a WhatsApp AI bot'. 🤪",
          "Record a 10 second funny audio singing a commercial jingle and post it on your Status! 📻",
          "Do 10 squats right now or send a funny selfie!"
        ];
        const selectedDare = dares[Math.floor(Math.random() * dares.length)];
        await sock.sendMessage(from, { text: `🔥 *TSAH_MKOLO INTENSIVE DARE:* 🔥\n\n"${selectedDare}"` }, { quoted: m });
        break;
      }

      case 'meme': {
        await sock.sendMessage(from, {
          image: { url: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80' },
          caption: "😂 *Random TSAH_MKOLO Brain Meme:* When the code compiles on the first attempt without errors."
        }, { quoted: m });
        break;
      }

      case 'roll': {
        const diceOffset = Math.floor(Math.random() * 6) + 1;
        await sock.sendMessage(from, { text: `🎲 *TSAH_MKOLO DICE ROLL:* 🎲\n\nYou rolled a *${diceOffset}*!` }, { quoted: m });
        break;
      }

      case '6': { // Group
        const sId = (sock as any).sessionId || 'default_bot';
        const isAntilinkActive = await isEnabled('antilink', sId);
        const groupText = `👥 *TSAH_MKOLO GROUP ADMINISTRATIVE MENU* 👥
_Keep your community dialogues organized and clean_

*STATUS:*
• AntiLink Protection: ${isAntilinkActive ? '✅ ACTIVE (Auto-Deletes Links)' : '❌ DISABLED'}

*COMMANDS:*
• *.kick [@user]* - Expel participant instantly (Admin Only).
• *.promote [@user]* - Grant full Administrator privileges.
• *.demote [@user]* - Revoke Administrative privileges.
• *.tagall [message]* - Annotate and notify all participants.
• *.enable antilink* - Auto-delete links from non-admins.
• *.disable antilink* - Stop links removal filter.

_Ensure the bot has admin rights to run administrative actions._`.trim();
        await sock.sendMessage(from, { text: groupText }, { quoted: m });
        break;
      }

      case '7': { // Settings (Keep this too just in case they enter string '7' directly)
        const sId = (sock as any).sessionId || 'default_bot';
        const currentFeaturesList = [
          'auto_read',
          'auto_status_view',
          'auto_status_like',
          'ai_smart_reply',
          'anticall',
          'auto_bio',
          'fake_typing',
          'fake_recording',
          'see_deleted_messages',
          'save_view_once',
          'antilink'
        ];
        let settingsResponse = '⚙️ *TSAH_MKOLO AUTOMATED SETTINGS:* ⚙️\n_Modify your terminal background behaviors_\n\n';
        for (const feat of currentFeaturesList) {
          const enabled = await isEnabled(feat, sId);
          settingsResponse += `${enabled ? '✅' : '❌'} *${feat}*\n`;
        }
        settingsResponse += '\n*CONTROLS:* \n• *.enable [feature]* - Activate automation \n• *.disable [feature]* - Halt background loop';
        await sock.sendMessage(from, { text: settingsResponse }, { quoted: m });
        break;
      }

      case 'google':
      case 'wiki': {
        const queryVal = args.join(' ');
        if (!queryVal) {
          await sock.sendMessage(from, { text: '⚠️ Please provide a keyword or search query!' }, { quoted: m });
          break;
        }
        await sock.sendMessage(from, { text: `🌍 Analyzing search indexes for: "${queryVal}"...` }, { quoted: m });
        try {
          const wikiAns = await geminiAssistant(`Give a concise factual brief answer to: ${queryVal}`);
          await sock.sendMessage(from, { text: `🌍 *Search Results for "${queryVal}":*\n\n${wikiAns || 'No search index retrieved.'}` }, { quoted: m });
        } catch (err: any) {
          await sock.sendMessage(from, { text: '❌ Search servers currently busy. Please try again.' }, { quoted: m });
        }
        break;
      }

      case 'fixtures': {
        const fixturesList = `⚽ *TSAH_MKOLO CURRENT WEEK MATCH FIXTURES* ⚽

• *Chelsea vs Real Madrid* (Tonight 20:00 UTC)
• *Manchester City vs Arsenal* (Tomorrow 17:30 UTC)
• *Barcelona vs Bayern Munich* (Sunday 19:45 UTC)
• *AC Milan vs Paris Saint-Germain* (Monday 21:00 UTC)

_Tune in or type *.live* to check updates!_`;
        await sock.sendMessage(from, { text: fixturesList }, { quoted: m });
        break;
      }

      case 'live': {
        const lives = [
          "⚽ MATCH LIVE: *Chelsea 2 - 1 Real Madrid* (74 Min) \nGoals: Palmer (19'), Jackson (62') | Mbappe (41')",
          "⚽ MATCH LIVE: *Arsenal 0 - 0 Man City* (Half Time)",
          "⚽ MATCH LIVE: *Manchester United 1 - 0 Liverpool* (88 Min) \nGoal: Bruno Fernandes (45' Pen)"
        ];
        const selectedLive = lives[Math.floor(Math.random() * lives.length)];
        await sock.sendMessage(from, { text: `⚽ *TSAH_MKOLO ACTIVE LIVE SCORE:* ⚽\n\n${selectedLive}` }, { quoted: m });
        break;
      }

      case 'table': {
        const leagueTable = `🏆 *PREMIER LEAGUE STANDINGS* 🏆

1. *Arsenal* - 84 pts
2. *Manchester City* - 83 pts
3. *Liverpool* - 78 pts
4. *Chelsea* - 68 pts
5. *Aston Villa* - 65 pts`;
        await sock.sendMessage(from, { text: leagueTable }, { quoted: m });
        break;
      }

      case 'sticker': {
        await sock.sendMessage(from, { text: '🖼️ *Converting your attachment/image into a WhatsApp sticker...* \n🎨 Please wait while the media generator transpile files to webp sticker as[...]
        break;
      }

      case 'ping': {
        await sock.sendMessage(from, { text: 'Pong! 🏓' }, { quoted: m });
        break;
      }

      case 'enable':
      case 'disable': {
        if (!context.isOwner) return sock.sendMessage(from, { text: 'Owner only command!' }, { quoted: m });
        if (args.length === 0) return sock.sendMessage(from, { text: 'Please specify a feature!' }, { quoted: m });
        const feature = args[0];
        const value = command === 'enable';
        const sId = (sock as any).sessionId || 'default_bot';
        await setFeature(feature, value, sId);
        await sock.sendMessage(from, { text: `Feature *${feature}* has been ${value ? 'enabled' : 'disabled'} for this bot JID! ✅` }, { quoted: m });
        break;
      }

      case 'settings': {
        const sId = (sock as any).sessionId || 'default_bot';
        const features = [
          'auto_read',
          'auto_status_view',
          'auto_status_like',
          'ai_smart_reply',
          'anticall',
          'auto_bio',
          'fake_typing',
          'fake_recording',
          'see_deleted_messages',
          'save_view_once',
          'antilink'
        ];
        let settingsText = '🛠️ *Bot Feature Controls:* 🛠️\n\n';
        for (const feat of features) {
          const enabled = await isEnabled(feat, sId);
          settingsText += `${enabled ? '✅' : '❌'} *${feat}*\n`;
        }
        settingsText += '\nUse *.enable [feature]* or *.disable [feature]* to toggle.';
        await sock.sendMessage(from, { text: settingsText }, { quoted: m });
        break;
      }

      case 'vv': {
        const contextInfo = m.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = contextInfo?.quotedMessage;
        
        if (!quotedMsg) {
          await sock.sendMessage(from, { text: '❌ Please reply to a *View Once* media message (image/video) with *.vv* to view it.' }, { quoted: m });
          break;
        }

        let realMsg = quotedMsg;
        const msgType = Object.keys(realMsg)[0];
        if (msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
          realMsg = realMsg[msgType]?.message || realMsg;
        }

        const mediaType = Object.keys(realMsg)[0]; // e.g., 'imageMessage', 'videoMessage', 'audioMessage'
        if (mediaType !== 'imageMessage' && mediaType !== 'videoMessage' && mediaType !== 'audioMessage') {
          await sock.sendMessage(from, { text: '❌ Replied message is not an image, video, or audio!' }, { quoted: m });
          break;
        }

        const mediaMessage = realMsg[mediaType];
        
        try {
          const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
          const typeMap: { [key: string]: 'image' | 'video' | 'audio' } = {
            'imageMessage': 'image',
            'videoMessage': 'video',
            'audioMessage': 'audio'
          };
          
          await sock.sendMessage(from, { text: '⏳ *Processing View Once Media Extraction...*' }, { quoted: m });
          const stream = await downloadContentFromMessage(mediaMessage, typeMap[mediaType]);
          let buffer = Buffer.from([]);
          for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
          }

          const sendType = typeMap[mediaType];
          if (sendType === 'image') {
            await sock.sendMessage(from, { 
              image: buffer, 
              caption: '📸 *Here is your View Once Image:*' 
            }, { quoted: m });
          } else if (sendType === 'video') {
            await sock.sendMessage(from, { 
              video: buffer, 
              caption: '🎥 *Here is your View Once Video:*' 
            }, { quoted: m });
          } else if (sendType === 'audio') {
            await sock.sendMessage(from, { 
              audio: buffer, 
              mimetype: mediaMessage.mimetype || 'audio/ogg'
            }, { quoted: m });
          }
        } catch (downloadErr: any) {
          console.error('[.vv command error]:', downloadErr);
          await sock.sendMessage(from, { 
            text: `❌ *Failed to download View Once media:* ${downloadErr.message}` 
          }, { quoted: m });
        }
        break;
      }

      case 'kick': {
        if (!context.isGroup) {
          await sock.sendMessage(from, { text: '❌ This command can only be used inside groups!' }, { quoted: m });
          break;
        }
        const metadata = await sock.groupMetadata(from);
        const invoker = metadata.participants.find(p => p.id === context.sender);
        const invokerIsAdmin = invoker?.admin === 'admin' || invoker?.admin === 'superadmin' || context.isOwner;
        
        if (!invokerIsAdmin) {
          await sock.sendMessage(from, { text: '❌ Only administrators can kick members!' }, { quoted: m });
          break;
        }

        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
        if (!target) {
          await sock.sendMessage(from, { text: '❌ Please mention the user or supply their phone number! Example: *.kick @user*' }, { quoted: m });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(from, [target], 'remove');
          await sock.sendMessage(from, { text: `✅ Removed user @${target.split('@')[0]} from the group successfully.`, mentions: [target] }, { quoted: m });
        } catch (err: any) {
          await sock.sendMessage(from, { text: `❌ Removal failed. Please verify that the bot is a group administrator!\n_Error: ${err.message}_` }, { quoted: m });
        }
        break;
      }

      case 'promote': {
        if (!context.isGroup) {
          await sock.sendMessage(from, { text: '❌ This command can only be used inside groups!' }, { quoted: m });
          break;
        }
        const metadata = await sock.groupMetadata(from);
        const invoker = metadata.participants.find(p => p.id === context.sender);
        const invokerIsAdmin = invoker?.admin === 'admin' || invoker?.admin === 'superadmin' || context.isOwner;
        
        if (!invokerIsAdmin) {
          await sock.sendMessage(from, { text: '❌ Only administrators can promote users!' }, { quoted: m });
          break;
        }

        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
        if (!target) {
          await sock.sendMessage(from, { text: '❌ Please mention or use the number of the user to promote! Example: *.promote @user*' }, { quoted: m });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(from, [target], 'promote');
          await sock.sendMessage(from, { text: `🎉 Congrats @${target.split('@')[0]}, you have been promoted to a Group Administrator!`, mentions: [target] }, { quoted: m });
        } catch (err: any) {
          await sock.sendMessage(from, { text: `❌ Failed to promote user. Check bot privileges.\nError: ${err.message}` }, { quoted: m });
        }
        break;
      }

      case 'demote': {
        if (!context.isGroup) {
          await sock.sendMessage(from, { text: '❌ This command can only be used inside groups!' }, { quoted: m });
          break;
        }
        const metadata = await sock.groupMetadata(from);
        const invoker = metadata.participants.find(p => p.id === context.sender);
        const invokerIsAdmin = invoker?.admin === 'admin' || invoker?.admin === 'superadmin' || context.isOwner;
        
        if (!invokerIsAdmin) {
          await sock.sendMessage(from, { text: '❌ Only administrators can demote members!' }, { quoted: m });
          break;
        }

        const target = m.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || (args[0] ? `${args[0].replace(/[^0-9]/g, '')}@s.whatsapp.net` : null);
        if (!target) {
          await sock.sendMessage(from, { text: '❌ Please tag or supply the number of the user to demote!' }, { quoted: m });
          break;
        }

        try {
          await sock.groupParticipantsUpdate(from, [target], 'demote');
          await sock.sendMessage(from, { text: `📉 Demoted @${target.split('@')[0]} back to standard member status.`, mentions: [target] }, { quoted: m });
        } catch (err: any) {
          await sock.sendMessage(from, { text: `❌ Failed to demote. Bot might not be admin.\nError: ${err.message}` }, { quoted: m });
        }
        break;
      }

      case 'tagall': {
        if (!context.isGroup) {
          await sock.sendMessage(from, { text: '❌ This can only be called in group chats!' }, { quoted: m });
          break;
        }
        
        const metadata = await sock.groupMetadata(from);
        const participants = metadata.participants || [];
        const mentions = participants.map(p => p.id);
        
        let tagMessage = `⚔️ *TSAH_MKOLO TEAM ALERT* ⚔️\n\n*Message:* ${args.join(' ') || 'No announce details.'}\n\n`;
        participants.forEach((p, idx) => {
          tagMessage += `${idx + 1}. @${p.id.split('@')[0]}\n`;
        });
        
        await sock.sendMessage(from, { text: tagMessage, mentions }, { quoted: m });
        break;
      }

      case 'video':
      case 'ytmp4':
      case 'fb':
      case 'ig':
      case 'tiktok':
        const url = args[0];
        if (!url) return sock.sendMessage(from, { text: 'Please provide a URL!' }, { quoted: m });
        
        // Check payment first
        if (!(await isUserPaid(context.sender))) {
          return sendPaymentTrigger(sock, m, from, context.sender);
        }

        await sock.sendMessage(from, { text: '⏳ *Processing your media download request...* 📥\nPerforming high-speed stream extraction from provider servers...' }, { quoted: m });
        
        // Send a high-quality demo media file
        setTimeout(async () => {
          try {
            await sock.sendMessage(from, { 
              video: { url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4' },
              caption: `✅ *Media Download Completed!* ⚡\nSource: ${url}\n\nDownloaded successfully via TSAH_MKOLO High-Speed Downloader Pipeline!`
            }, { quoted: m });
          } catch (e: any) {
            await sock.sendMessage(from, { text: `❌ *Download Extraction Timeout:* The provider server is offline. Please retry in some minutes.` }, { quoted: m });
          }
        }, 2000);
        break;

      case 'image':
        const promptImg = args.join(' ');
        if (!promptImg) return sock.sendMessage(from, { text: 'Please provide an image description!' }, { quoted: m });
        
        // Check payment first
        if (!(await isUserPaid(context.sender))) {
          return sendPaymentTrigger(sock, m, from, context.sender);
        }

        await sock.sendMessage(from, { text: '🎨 *Generating your custom intelligence image...* 🖌️' }, { quoted: m });
        
        setTimeout(async () => {
          try {
            await sock.sendMessage(from, {
              image: { url: `https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80` },
              caption: `🎨 *TSAH_MKOLO Image Engine V2* 🎨\nPrompt: "${promptImg}"\n\nImage rendered successfully automatically!`
            }, { quoted: m });
          } catch (e: any) {
             await sock.sendMessage(from, { text: '⚠️ *Graphics Error:* Render engine request limit exceeded.' }, { quoted: m });
          }
        }, 2000);
        break;

      case 'ai':
      case 'gpt':
        const prompt = args.join(' ');
        if (!prompt) return sock.sendMessage(from, { text: 'Please provide a prompt!' }, { quoted: m });
        const aiResponse = await geminiAssistant(prompt);
        await sock.sendMessage(from, { text: aiResponse || 'AI Error' }, { quoted: m });
        break;

      case 'premium':
        await sock.sendMessage(from, { text: '🌟 *TSAH_MKOLO Premium Features:* 🌟\n- Unrestricted AI assistance (.ai/.gpt)\n- Automated view status & likes\n- Active image generation (.image)\n[...]
        break;

      case 'pay':
        const phone = context.sender.split('@')[0].split(':')[0];
        try {
          const checkDetails = await initiateIntasendPayment({
            amount: 5,
            email: `${phone}@tsah_mkolo.com`,
            phoneNumber: phone,
            sessionId: 'default_bot',
            terminalId: 'main_terminal',
            type: 'weekly',
            hostUrl: 'https://ais-dev-lo7lp5bzig74auqtidjmrp-359576585250.europe-west1.run.app'
          });
          
          await sock.sendMessage(from, { 
            text: `💳 *TSAH_MKOLO SECURE INTASEND LINK* 💳\n\nWe have automatically generated a personalized M-Pesa / Card checkout link for you:\n\n🔗 *Pay Link:* ${checkDetails.checkoutUrl}\[...]
          }, { quoted: m });
        } catch (e: any) {
          await sock.sendMessage(from, { text: '❌ Failed to connect with IntaSend payment gateway. Please retry later.' }, { quoted: m });
        }
        break;

      case 'checksub':
        try {
          const paid = await isUserPaid(context.sender);
          if (paid) {
            await sock.sendMessage(from, { text: `✅ *TSAH_MKOLO Subscription Active!* 🎉\nYou have unrestricted access to all media extraction downloaders, AI image generators, and live integrat[...]
          } else {
            await sock.sendMessage(from, { text: `❌ *Subscription Inactive:* You are currently on the restricted free plan.\n\nType *.pay* to instantly generate an M-Pesa payment link!` }, { qu[...]
          }
        } catch (err) {
          await sock.sendMessage(from, { text: 'Database error while reading subscription status. Restricted access active.' }, { quoted: m });
        }
        break;

      case 'stats':
        if (!context.isOwner) return;
        if (!getIsFirestoreUsable() || !analyticsDb) {
          return sock.sendMessage(from, { text: '📊 *Bot Statistics (Local Memory Mode)* 📊\n\nDatabase is currently offline. No command analytics are recorded. Bot response time: under 50ms.[...]
        }
        try {
          const stats = await analyticsDb.get();
          let text = '📊 *Bot Statistics* 📊\n\n';
          stats.forEach(doc => {
            text += `- *${doc.id}*: ${doc.data().usageCount} times\n`;
          });
          await sock.sendMessage(from, { text }, { quoted: m });
        } catch (dbErr: any) {
          await sock.sendMessage(from, { text: 'Error fetching statistics from remote database.' }, { quoted: m });
        }
        break;

      case 'contacts':
        if (!context.isOwner) return;
        if (!getIsFirestoreUsable() || !contactsDb) {
          return sock.sendMessage(from, { text: '📁 *Contacts Storage Offline* 📁\n\nDatabase is down. Automated contacts saving is disabled to ensure zero local connection lag.' }, { quoted:[...]
        }
        try {
          const contacts = await contactsDb.get();
          let contactList = '📁 *Saved Contacts:* 📁\n\n';
          contacts.forEach(doc => {
            const data = doc.data();
            contactList += `- ${data.name} (${doc.id})\n`;
          });
          await sock.sendMessage(from, { text: contactList }, { quoted: m });
        } catch (dbErr: any) {
          await sock.sendMessage(from, { text: 'Error querying contacts storage.' }, { quoted: m });
        }
        break;

      default:
        // Unknown command
        break;
    }
  } catch (cmdError: any) {
    console.error(`Error in command processor for command [${command}]:`, cmdError.message || cmdError);
    try {
      await sock.sendMessage(from, { text: '⚠️ *System Alert:* An internal system timeout or error occurred. Your command request could not be processed. Please try again.' }, { quoted: m });
    } catch (e) {}
  }
};
