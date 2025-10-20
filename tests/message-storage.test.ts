import test from "node:test";
import assert from "node:assert/strict";
import { resolveMessageStorage } from "../supabase/functions/message-storage";

test("resolveMessageStorage mantém mensagens de texto", () => {
  const result = resolveMessageStorage({
    content: "olá",
    messageType: "text",
  });

  assert.deepEqual(result, {
    content: "olá",
    messageType: "text",
    mediaType: null,
    caption: null,
    documentName: null,
    mediaUrl: null,
    mediaBase64: null,
  });
});

test("resolveMessageStorage estrutura dados de mídia com legenda", () => {
  const result = resolveMessageStorage({
    content: "[image]",
    messageType: "media",
    mediaType: "image",
    caption: "foto",
    mediaUrl: "https://exemplo.com/imagem.png",
  });

  assert.deepEqual(result, {
    content: "foto",
    messageType: "media",
    mediaType: "image",
    caption: "foto",
    documentName: null,
    mediaUrl: "https://exemplo.com/imagem.png",
    mediaBase64: null,
  });
});

test("resolveMessageStorage normaliza tipo específico de mídia", () => {
  const result = resolveMessageStorage({
    messageType: "image",
    mediaBase64: "QkFTRTY0",
  });

  assert.equal(result.messageType, "media");
  assert.equal(result.mediaType, "image");
  assert.equal(result.content, "[image]");
  assert.equal(result.mediaBase64, "QkFTRTY0");
});

test("payload de mídia persiste metadados em inserção e atualização", () => {
  const chatId = "chat-1";
  const credentialId = "cred-1";
  const baseMessage = {
    text: "Conteúdo original",
    messageType: "media",
    mediaType: "image",
    caption: "Legenda inicial",
    documentName: "foto.png",
    mediaUrl: "https://cdn.exemplo/foto.png",
    mediaBase64: null,
    messageid: "wa-1",
    fromMe: false,
    sender: "cliente",
    senderName: "Cliente",
    status: "delivered",
    messageTimestamp: 123456,
    isPrivate: false,
  };

  const storage = resolveMessageStorage({
    content: baseMessage.text,
    messageType: baseMessage.messageType,
    mediaType: baseMessage.mediaType,
    caption: baseMessage.caption,
    documentName: baseMessage.documentName,
    mediaUrl: baseMessage.mediaUrl,
    mediaBase64: baseMessage.mediaBase64,
  });

  const upsertPayload = {
    chat_id: chatId,
    credential_id: credentialId,
    wa_message_id: baseMessage.messageid,
    content: storage.content,
    message_type: storage.messageType,
    media_type: storage.mediaType,
    caption: storage.caption,
    document_name: storage.documentName,
    media_url: storage.mediaUrl,
    media_base64: storage.mediaBase64,
    from_me: baseMessage.fromMe,
    sender: baseMessage.sender,
    sender_name: baseMessage.senderName,
    status: baseMessage.status,
    message_timestamp: baseMessage.messageTimestamp,
    is_private: baseMessage.isPrivate,
  };

  assert.deepEqual(upsertPayload, {
    chat_id: "chat-1",
    credential_id: "cred-1",
    wa_message_id: "wa-1",
    content: "Legenda inicial",
    message_type: "media",
    media_type: "image",
    caption: "Legenda inicial",
    document_name: "foto.png",
    media_url: "https://cdn.exemplo/foto.png",
    media_base64: null,
    from_me: false,
    sender: "cliente",
    sender_name: "Cliente",
    status: "delivered",
    message_timestamp: 123456,
    is_private: false,
  });

  const updatedMessage = {
    ...baseMessage,
    caption: "Legenda atualizada",
    documentName: "foto-atualizada.png",
    mediaUrl: null,
    mediaBase64: "data:image/png;base64,QUFBQQ==",
  };

  const updatedStorage = resolveMessageStorage({
    content: updatedMessage.text,
    messageType: updatedMessage.messageType,
    mediaType: updatedMessage.mediaType,
    caption: updatedMessage.caption,
    documentName: updatedMessage.documentName,
    mediaUrl: updatedMessage.mediaUrl,
    mediaBase64: updatedMessage.mediaBase64,
  });

  const updatePayload = {
    chat_id: chatId,
    credential_id: credentialId,
    wa_message_id: updatedMessage.messageid,
    content: updatedStorage.content,
    message_type: updatedStorage.messageType,
    media_type: updatedStorage.mediaType,
    caption: updatedStorage.caption,
    document_name: updatedStorage.documentName,
    media_url: updatedStorage.mediaUrl,
    media_base64: updatedStorage.mediaBase64,
    from_me: updatedMessage.fromMe,
    sender: updatedMessage.sender,
    sender_name: updatedMessage.senderName,
    status: updatedMessage.status,
    message_timestamp: updatedMessage.messageTimestamp,
    is_private: updatedMessage.isPrivate,
  };

  assert.deepEqual(updatePayload, {
    chat_id: "chat-1",
    credential_id: "cred-1",
    wa_message_id: "wa-1",
    content: "Legenda atualizada",
    message_type: "media",
    media_type: "image",
    caption: "Legenda atualizada",
    document_name: "foto-atualizada.png",
    media_url: null,
    media_base64: "data:image/png;base64,QUFBQQ==",
    from_me: false,
    sender: "cliente",
    sender_name: "Cliente",
    status: "delivered",
    message_timestamp: 123456,
    is_private: false,
  });
});
