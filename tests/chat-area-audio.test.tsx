import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatArea, createAudioRecorder } from "../src/components/ChatArea";
import type { Chat, Message, SendMessagePayload } from "../src/types/whatsapp";

test("envia áudio gravado após finalizar a captura", async () => {
  const previousNavigator = globalThis.navigator;
  const previousMediaRecorder = globalThis.MediaRecorder;
  const previousFileReader = globalThis.FileReader;

  const tracksStopped: number[] = [];
  const mockStream = {
    getTracks: () => [
      {
        stop: () => {
          tracksStopped.push(1);
        },
      },
    ],
  } as unknown as MediaStream;

  const audioData = Uint8Array.from([1, 2, 3, 4]);
  const audioBlob = new Blob([audioData], { type: "audio/webm" });
  const expectedBase64 = Buffer.from(audioData).toString("base64");

  class MockFileReader {
    result: string | ArrayBuffer | null = null;
    onloadend: null | (() => void) = null;
    onerror: null | (() => void) = null;

    readAsDataURL(blob: Blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          const base64 = Buffer.from(buffer).toString("base64");
          this.result = `data:${blob.type};base64,${base64}`;
          this.onloadend?.();
        })
        .catch(() => {
          this.onerror?.();
        });
    }
  }

  class MockMediaRecorder {
    mimeType = "audio/webm";
    state: "inactive" | "recording" | "paused" = "inactive";
    ondataavailable: null | ((event: { data: Blob }) => void) = null;
    onstop: null | (() => void) = null;

    constructor(public stream: MediaStream) {}

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: audioBlob });
      this.onstop?.();
    }
  }

  const getUserMediaMock = async () => mockStream;

  try {
    (globalThis as any).navigator = { mediaDevices: { getUserMedia: getUserMediaMock } };
    (globalThis as any).MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
    (globalThis as any).FileReader = MockFileReader as unknown as typeof FileReader;

    const recordingStates: boolean[] = [];
    const chunkUpdates: number[] = [];
    const sentPayloads: SendMessagePayload[] = [];

    const recorder = createAudioRecorder({
      getOnSendMessage: () => (payload) => {
        sentPayloads.push(payload);
      },
      getIsPrivate: () => false,
      setIsRecording: (value) => {
        recordingStates.push(value);
      },
      setChunks: (chunks) => {
        chunkUpdates.push(chunks.length);
      },
    });

    await recorder.startRecording();
    assert.ok(recordingStates.includes(true));

    recorder.finishRecording();

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(sentPayloads.length, 1);
    const payload = sentPayloads[0];
    assert.equal(payload.mediaType, "ptt");
    assert.equal(payload.mediaBase64, expectedBase64);
    assert.equal(payload.messageType, "media");
    assert.equal(payload.content, "[ptt]");
    assert.ok(recordingStates[recordingStates.length - 1] === false);
    assert.ok(chunkUpdates.some((value) => value > 0));
    assert.ok(tracksStopped.length > 0);

    recorder.dispose();
  } finally {
    if (previousNavigator === undefined) {
      Reflect.deleteProperty(globalThis, "navigator");
    } else {
      (globalThis as any).navigator = previousNavigator;
    }
    if (previousMediaRecorder === undefined) {
      Reflect.deleteProperty(globalThis, "MediaRecorder");
    } else {
      (globalThis as any).MediaRecorder = previousMediaRecorder;
    }
    if (previousFileReader === undefined) {
      Reflect.deleteProperty(globalThis, "FileReader");
    } else {
      (globalThis as any).FileReader = previousFileReader;
    }
  }
});

test("renderiza áudio e download para mensagens ptt", () => {
  const chat: Chat = {
    id: "chat-audio-ptt",
    name: "Cliente",
    lastMessage: "",
    timestamp: "10:00",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
  };

  const audioData = Buffer.from([1, 2, 3, 4]).toString("base64");

  const messages: Message[] = [
    {
      id: "mensagem-ptt",
      chatId: "chat-audio-ptt",
      content: "",
      timestamp: "10:01",
      from: "them",
      messageType: "media",
      mediaType: "ptt",
      mediaBase64: audioData,
      documentName: "voz.ogg",
    },
  ];

  const html = renderToStaticMarkup(
    <ChatArea
      chat={chat}
      messages={messages}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      onLoadMoreMessages={() => {}}
      hasMoreMessages={false}
      isLoadingMoreMessages={false}
      isPrependingMessages={false}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  assert.ok(html.includes("<audio controls"));
  assert.ok(html.includes("aria-label=\"Baixar áudio\""));
  assert.ok(html.includes("download=\"voz.ogg\""));
  assert.ok(html.includes("[ptt]"));
});

test("renderiza áudio quando mediaUrl está presente", () => {
  const chat: Chat = {
    id: "chat-audio-url",
    name: "Cliente",
    lastMessage: "",
    timestamp: "10:00",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
  };

  const messages: Message[] = [
    {
      id: "mensagem-audio-url",
      chatId: "chat-audio-url",
      content: "",
      timestamp: "10:01",
      from: "them",
      messageType: "media",
      mediaType: "audio",
      mediaUrl: "https://example.com/audio.ogg",
    },
  ];

  const html = renderToStaticMarkup(
    <ChatArea
      chat={chat}
      messages={messages}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      onLoadMoreMessages={() => {}}
      hasMoreMessages={false}
      isLoadingMoreMessages={false}
      isPrependingMessages={false}
      showSidebar
      onShowSidebar={() => {}}
    />
  );

  assert.ok(html.includes("<audio controls"));
  assert.ok(html.includes("src=\"https://example.com/audio.ogg\""));
  assert.ok(html.includes("Baixar media"));
});

test("renderiza mensagem de voz com áudio reproduzível", () => {
  const chat: Chat = {
    id: "chat-voice",
    name: "Cliente",
    lastMessage: "",
    timestamp: "10:05",
    unread: 0,
    isGroup: false,
    attendanceStatus: "waiting",
  };

  const voiceBase64 = Buffer.from([5, 6, 7, 8]).toString("base64");

  const messages: Message[] = [
    {
      id: "mensagem-voice",
      chatId: "chat-voice",
      content: "",
      timestamp: "10:06",
      from: "them",
      messageType: "media",
      mediaType: "voice",
      mediaBase64: voiceBase64,
      documentName: "voz.opus",
    },
  ];

  const html = renderToStaticMarkup(
    <ChatArea
      chat={chat}
      messages={messages}
      onSendMessage={() => {}}
      onAssignChat={() => {}}
      onLoadMoreMessages={() => {}}
      hasMoreMessages={false}
      isLoadingMoreMessages={false}
      isPrependingMessages={false}
      showSidebar
      onShowSidebar={() => {}}
    />,
  );

  assert.ok(html.includes("<audio controls"));
  assert.ok(html.includes("download=\"voz.opus\""));
  assert.ok(html.includes("Baixar voz.opus"));
});
