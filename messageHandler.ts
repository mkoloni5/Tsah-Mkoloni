import { WASocket, proto } from '@whiskeysockets/baileys';
import { isEnabled } from '../utils/settings.js';
import { config } from '../config/index.js';
import { processCommand } from '../commands/index.js';
import { geminiAssistant } from '../services/gemini.js';
import { storeMessage, getMessage } from '../utils/messageStore.js';
import { saveContact } from '../services/contactService.js';

export const handleMessages = async (sock: WASocket, upsert: { messages: any[] }) => {
  const sessionId = (sock as any).sessionId || 'default_bot';
  
  for (const msg of upsert.messages) {
    try {
      if (!msg.message) continue;
      
      // Auto status view
      if (msg.key?.remoteJid === 'status@broadcast') {
        if (await isEnabled('auto_status_view', sessionId)) {
          await sock.readMessages([msg.key]);
          console.log(`Viewed status from ${msg.pushName || msg.key.participant}`);
          
          if (await isEnabled('auto_status_like', sessionId)) {
            const emojis = ['❤️', '🔥', '🙌', '💯', '✨'];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await sock.sendMessage(msg.key.remoteJid, {
              react: { text: randomEmoji, key: msg.key }
            });
          }
        }
        continue;
      }

      const m = msg as any;
      const from = m.key.remoteJid!;
      const isGroup = from.endsWith('@g.us');
      const sender = isGroup ? m.key.participant! : from;

      // Auto Save Contacts
      if (await isEnabled('auto_save_contacts', sessionId) && !isGroup) {
          await saveContact(sender, m.pushName);
      }

      // Store message for deleted message detection
      if (m.message && !m.message.protocolMessage) {
          storeMessage(m.key.id!, sender, m.message);
      }

      // Detecting deleted messages (REVOKE)
      const protocolMsg = m.message.protocolMessage;
      if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE' || protocolMsg.type === 3)) {
          if (await isEnabled('see_deleted_messages', sessionId)) {
              const deletedId = protocolMsg.key?.id;
              if (deletedId) {
                  const originalMsg = getMessage(deletedId);
                  if (originalMsg) {
                      const ownerJid = (sock.user?.id?.split(':')[0] || config.bot.ownerNumber) + '@s.whatsapp.net';
                      
                      // Extract core text of standard types
                      let originalText = '';
                      const type = Object.keys(originalMsg.message)[0];
                      let realMsg = originalMsg.message;
                      if (type === 'ephemeralMessage' || type === 'viewOnceMessage' || type === 'viewOnceMessageV2') {
                          realMsg = realMsg[type]?.message || realMsg;
                      }
                      originalText = realMsg.conversation || 
                                     realMsg.extendedTextMessage?.text || 
                                     realMsg.imageMessage?.caption || 
                                     realMsg.videoMessage?.caption || 
                                     '';

                      await sock.sendMessage(ownerJid, {
                          text: `🗑️ *Deleted Message Detected!*\n• *Sender:* @${originalMsg.sender.split('@')[0]}\n• *Chat:* @${from.split('@')[0]}\n• *Content:* ${originalText || '_[Me[...]
                          mentions: [originalMsg.sender, from]
                      });
                      
                      try {
                          await sock.sendMessage(ownerJid, { 
                              forward: { 
                                  key: { id: deletedId, remoteJid: from, participant: originalMsg.sender }, 
                                  message: originalMsg.message 
                              } 
                          });
                      } catch (fwdErr) {
                          console.warn('[Message Revoke] Direct message forwarding failed, raw metadata printed.');
                      }
                  }
              }
          }
      }

      // View Once Media Saving
      const viewOnceOuter = m.message.viewOnceMessageV2 || m.message.viewOnceMessage;
      if (viewOnceOuter && await isEnabled('save_view_once', sessionId)) {
          const ownerJid = (sock.user?.id?.split(':')[0] || config.bot.ownerNumber) + '@s.whatsapp.net';
          const viewOnceMsg = viewOnceOuter.message;
          
          try {
              const mediaType = Object.keys(viewOnceMsg)[0];
              if (mediaType === 'imageMessage' || mediaType === 'videoMessage' || mediaType === 'audioMessage') {
                  const mediaMessage = viewOnceMsg[mediaType];
                  const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');
                  
                  const typeMap: { [key: string]: 'image' | 'video' | 'audio' } = {
                      'imageMessage': 'image',
                      'videoMessage': 'video',
                      'audioMessage': 'audio'
                  };
                  
                  const stream = await downloadContentFromMessage(mediaMessage, typeMap[mediaType]);
                  let buffer = Buffer.from([]);
                  for await (const chunk of stream) {
                      buffer = Buffer.concat([buffer, chunk]);
                  }
                  
                  await sock.sendMessage(ownerJid, { text: `📸 *View Once Media Detected from @${sender.split('@')[0]} in @${from.split('@')[0]}!* (Automatically Saved Below)`, mentions: [sende[...]
                  const sendType = typeMap[mediaType];
                  if (sendType === 'image') {
                      await sock.sendMessage(ownerJid, { image: buffer, caption: `Saved View Once Image from ${sender}` });
                  } else if (sendType === 'video') {
                      await sock.sendMessage(ownerJid, { video: buffer, caption: `Saved View Once Video from ${sender}` });
                  } else if (sendType === 'audio') {
                      await sock.sendMessage(ownerJid, { audio: buffer, mimetype: mediaMessage.mimetype || 'audio/ogg' });
                  }
              }
          } catch (dlErr: any) {
              console.error('[Auto Save View Once Error]: Failed to download/forward raw media:', dlErr.message);
          }
      }

      let body = '';
      if (m.message) {
          const msgType = Object.keys(m.message)[0];
          let realMsg = m.message;
          if (msgType === 'ephemeralMessage' || msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
              const content = m.message[msgType];
              realMsg = content?.message || realMsg;
          }

          body = realMsg.conversation || 
                 realMsg.extendedTextMessage?.text || 
                 realMsg.imageMessage?.caption || 
                 realMsg.videoMessage?.caption || 
                 realMsg.templateButtonReplyMessage?.selectedId ||
                 realMsg.buttonsResponseMessage?.selectedButtonId ||
                 realMsg.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 '';
      }

      const safeSender = sender || '';
      const numericSender = safeSender.split('@')[0]?.split(':')[0]?.replace(/[^0-9]/g, '') || '';
      const numericOwner = config.bot.ownerNumber ? config.bot.ownerNumber.replace(/[^0-9]/g, '') : '';
      const isOwner = !!(
        m.key.fromMe || 
        numericSender === '254111888637' ||
        (numericOwner && numericSender === numericOwner) || 
        (config.bot.ownerNumber && safeSender.includes(config.bot.ownerNumber))
      );

      body = body.trim();
      
      // Auto AntiLink Protection Filter
      const linkRegex = /chat\.whatsapp\.com\/[a-zA-Z0-9]+|https?:\/\/[^\s]+/gi;
      if (isGroup && linkRegex.test(body) && await isEnabled('antilink', sessionId)) {
          try {
              const groupMetadata = await sock.groupMetadata(from);
              const participants = groupMetadata?.participants || [];
              const senderParticipant = participants.find(p => p.id === sender);
              const isAdmin = senderParticipant?.admin === 'admin' || senderParticipant?.admin === 'superadmin';
              const isBotOrOwner = isOwner || sender === sock.user?.id?.split(':')[0] + '@s.whatsapp.net';
              
              if (!isAdmin && !isBotOrOwner) {
                  console.log(`[AntiLink] Deleting link matching message from sender ${sender} in group ${from}`);
                  await sock.sendMessage(from, { delete: m.key });
                  await sock.sendMessage(from, { 
                      text: `⚠️ *AntiLink Activated!*\n@${sender.split('@')[0]}, external links are strictly forbidden in this group setup. Your message has been automatically deleted!`,
                      mentions: [sender]
                  });
              }
          } catch (linkErr: any) {
              console.warn('[AntiLink Error]: Failed group admin evaluation or unlink deletion:', linkErr.message);
          }
      }

      const prefixes = ['.', '/', '!', '#'];
      let isCmd = false;
      let command = '';
      let args: string[] = [];

      for (const pref of prefixes) {
        if (body.startsWith(pref)) {
          isCmd = true;
          const line = body.slice(pref.length).trim();
          command = line.split(' ')[0].toLowerCase();
          args = line.slice(command.length).trim().split(/\s+/).filter(Boolean);
          break;
        }
      }

      // List of known commands that can run without prefix
      const knownCommands = [
        'ping', 'menu', 'help', 'allmenu', 'enable', 'disable', 'settings', 
        'video', 'ytmp4', 'fb', 'ig', 'tiktok', 'image', 'ai', 
        'gpt', 'premium', 'pay', 'checksub', 'stats', 'contacts',
        'vv', 'kick', 'promote', 'demote', 'tagall'
      ];

      if (!isCmd) {
        const lowerBody = body.toLowerCase().trim();
        const firstWord = lowerBody.split(/\s+/)[0];
        const isNumericSubmenu = /^\d+$/.test(firstWord) && parseInt(firstWord, 10) >= 1 && parseInt(firstWord, 10) <= 22;
        
        if (knownCommands.includes(firstWord) || isNumericSubmenu) {
          isCmd = true;
          command = firstWord;
          args = body.slice(firstWord.length).trim().split(/\s+/).filter(Boolean);
        }
      }

      // Presence updates
      if (await isEnabled('fake_typing', sessionId)) {
          await sock.sendPresenceUpdate('composing', from);
      }
      if (await isEnabled('fake_recording', sessionId)) {
          await sock.sendPresenceUpdate('recording', from);
      }

      // Auto Read
      if (await isEnabled('auto_read', sessionId)) {
        await sock.readMessages([m.key]);
      }

      // Command Handler
      if (isCmd) {
        await processCommand(sock, m, command, args, { isOwner, isGroup, sender });
      } else {
        // AI Smart Reply if enabled
        if (await isEnabled('ai_smart_reply', sessionId) && !m.key.fromMe) {
          // Only reply if mentioned or in private chat
          if (!isGroup || body.toLowerCase().includes('bot')) {
              const reply = await geminiAssistant(body);
              if (reply) {
                  await sock.sendMessage(from, { text: reply }, { quoted: m });
              }
          }
        }
      }
    } catch (msgError: any) {
      console.error('>> Error processing single WhatsApp message:', msgError.message || msgError);
    }
  }
};
