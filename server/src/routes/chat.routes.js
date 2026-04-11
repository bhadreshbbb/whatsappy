import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';

const router = Router();

// Conversations
router.get('/conversations',              chatController.getConversations);

// Messages per user
router.get('/messages/:phone',            chatController.getMessages);

// Send message (admin → user)
router.post('/messages/:phone',           chatController.sendMessage);

// Mark all messages seen for a conversation
router.post('/messages/:phone/seen',      chatController.markSeen);

// Meta webhook verification + receive
router.get('/webhook',                    chatController.webhookVerify);
router.post('/webhook',                   chatController.webhookReceive);

// Dev: simulate an incoming reply
router.post('/simulate',                  chatController.simulateIncoming);

export { router as chatRoutes };
