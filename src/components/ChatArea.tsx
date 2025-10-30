import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  MoreVertical,
  Paperclip,
  Smile,
  Mic,
  Send,
  Phone,
  Video,
  Check,
  CheckCheck,
  ArrowLeft,
  X,
  Lock,
  Unlock,
  MapPin,
  Download,
  Tag
} from "lucide-react";
import { Chat, Message, SendMessagePayload, Label } from "@/types/whatsapp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";

type MediaOrigin = 'url' | 'base64';

const determineMediaType = (file: File) => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('application/')) return 'document';
  if (file.type.startsWith('text/')) return 'document';
  return 'document';
};

const shouldUseBase64 = (mediaType: string) => {
  return mediaType === 'image' || mediaType === 'document' || mediaType === 'audio' || mediaType === 'video';
};

const getMessageSortValue = (message: Message): number | string => {
  if (typeof message.messageTimestamp === 'number') {
    return message.messageTimestamp;
  }

  if (message.timestamp) {
    const parsed = Date.parse(message.timestamp);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    return message.timestamp;
  }

  return message.id;
};

const compareMessagesByTimestamp = (first: Message, second: Message): number => {
  const firstValue = getMessageSortValue(first);
  const secondValue = getMessageSortValue(second);

  if (typeof firstValue === 'number' && typeof secondValue === 'number') {
    return firstValue - secondValue;
  }

  return String(firstValue).localeCompare(String(secondValue));
};

const fileToBase64 = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const value = result.includes(',') ? result.split(',')[1] ?? '' : result;
      if (!value) {
        reject(new Error('invalid file content'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
};

interface MediaPromptValues {
  mediaType: string;
  originType: MediaOrigin;
  originValue: string;
  caption?: string;
  documentName?: string;
}

const getGlobalUrl = () => {
  if (typeof URL !== "undefined") {
    return URL;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).URL) {
    return (globalThis as any).URL as typeof URL;
  }
  return undefined;
};

const createObjectUrl = (blob: Blob) => {
  const target = getGlobalUrl();
  if (target && typeof target.createObjectURL === "function") {
    return target.createObjectURL(blob);
  }
  return "";
};

const revokeObjectUrl = (value: string) => {
  if (!value) return;
  const target = getGlobalUrl();
  if (target && typeof target.revokeObjectURL === "function") {
    target.revokeObjectURL(value);
  }
};

const decodeBase64ToUint8Array = (value: string) => {
  const globalAtob =
    typeof atob === "function"
      ? atob
      : typeof globalThis !== "undefined" && typeof (globalThis as any).atob === "function"
      ? (globalThis as any).atob as (input: string) => string
      : undefined;

  if (globalAtob) {
    const binary = globalAtob(value);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  if (typeof globalThis !== "undefined" && typeof (globalThis as any).Buffer === "function") {
    const buffer = (globalThis as any).Buffer.from(value, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  return new Uint8Array();
};

const getMimeTypeForMessage = (message: Message) => {
  const mediaType = message.mediaType?.toLowerCase() ?? "";
  if (mediaType === "image" || mediaType === "photo") {
    return "image/jpeg";
  }
  if (mediaType === "video") {
    return "video/mp4";
  }
  if (mediaType === "audio" || mediaType === "ptt" || mediaType === "voice") {
    return "audio/ogg";
  }
  if (mediaType === "document" && message.documentName) {
    const lowerName = message.documentName.toLowerCase();
    if (lowerName.endsWith(".pdf")) return "application/pdf";
    if (lowerName.endsWith(".doc")) return "application/msword";
    if (lowerName.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (lowerName.endsWith(".xls")) return "application/vnd.ms-excel";
    if (lowerName.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (lowerName.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
    if (lowerName.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (lowerName.endsWith(".txt")) return "text/plain";
    if (lowerName.endsWith(".json")) return "application/json";
  }
  if (mediaType === "document") {
    return "application/octet-stream";
  }
  return "application/octet-stream";
};

const shouldUseAuthenticatedDownload = (url: string) => /uazapi\.com/i.test(url);

export const requestAuthenticatedMedia = async ({
  credentialId,
  url,
}: {
  credentialId: string;
  url: string;
}) => {
  const { data, error } = await supabase.functions.invoke<ArrayBuffer>(
    "uaz-download-media",
    {
      body: { credentialId, url },
    }
  );

  if (error || !data) {
    return null;
  }

  const blob = new Blob([data as any]);
  return { blob, contentType: null, fileName: null };
};

type ResolvedMediaSource = {
  url: string;
  downloadUrl: string;
  contentType?: string | null;
  fileName?: string | null;
  revokable?: boolean;
};

export const buildMediaMessagePayload = (values: MediaPromptValues): SendMessagePayload => {
  const mediaType = values.mediaType.trim();
  const originValue = values.originValue.trim();
  const caption = values.caption?.trim();
  const documentName = values.documentName?.trim();
  const resolvedMediaType = mediaType || (values.originType === 'base64' ? 'document' : '');
  const content = caption || `[${resolvedMediaType || 'mídia'}]`;

  const payload: SendMessagePayload = {
    content,
    messageType: 'media',
  };

  if (resolvedMediaType) {
    payload.mediaType = resolvedMediaType;
  }

  if (values.originType === 'url') {
    payload.mediaUrl = originValue;
  } else {
    payload.mediaBase64 = originValue;
  }

  if (caption) {
    payload.caption = caption;
  }

  if (documentName) {
    payload.documentName = documentName;
  }

  return payload;
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        const [, base64] = reader.result.split(",");
        resolve(base64 ?? "");
        return;
      }
      reject(new Error("Invalid reader result"));
    };
    reader.onerror = () => reject(new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });

const base64ToUint8Array = (value: string) => {
  if (typeof atob === "function") {
    const binary = atob(value);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  const bufferCtor = (globalThis as { Buffer?: { from: (data: string, encoding: string) => Uint8Array } }).Buffer;
  if (bufferCtor) {
    return bufferCtor.from(value, "base64");
  }
  return new Uint8Array();
};

const inferAudioMimeType = (message: Message) => {
  const name = message.documentName?.toLowerCase() ?? "";
  if (name.endsWith(".webm")) return "audio/webm";
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".m4a")) return "audio/mp4";
  if (name.endsWith(".ogg")) return "audio/ogg";
  if (message.mediaType === "ptt") return "audio/ogg";
  return "audio/ogg";
};

type AudioSource = { url: string; shouldRevoke: boolean };
type CachedAudioSource = {
  source: AudioSource;
  signature: string | null;
};

const getAudioSignature = (message: Message): string | null => {
  if (message.mediaUrl) {
    return `url:${message.mediaUrl}`;
  }

  if (message.mediaBase64) {
    return `base64:${message.mediaBase64}`;
  }

  return null;
};

const resolveAudioSource = (message: Message): AudioSource | null => {
  if (message.mediaUrl) {
    return { url: message.mediaUrl, shouldRevoke: false };
  }
  if (!message.mediaBase64) {
    return null;
  }
  const base64 = message.mediaBase64.includes(",")
    ? message.mediaBase64.split(",").pop() ?? ""
    : message.mediaBase64;
  if (!base64) {
    return null;
  }
  const bytes = base64ToUint8Array(base64);
  if (!bytes.length) {
    return null;
  }
  const blob = new Blob([bytes as any], { type: inferAudioMimeType(message) });
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return { url: `data:${blob.type};base64,${base64}`, shouldRevoke: false };
  }
  const url = URL.createObjectURL(blob);
  return { url, shouldRevoke: true };
};

interface AudioRecorderOptions {
  getOnSendMessage: () => (payload: SendMessagePayload) => void;
  getIsPrivate: () => boolean;
  setIsRecording: (value: boolean) => void;
  setChunks: (chunks: Blob[]) => void;
}

interface AudioRecorderControls {
  startRecording: () => Promise<void>;
  finishRecording: () => void;
  cancelRecording: () => void;
  dispose: () => void;
}

export const createAudioRecorder = ({
  getOnSendMessage,
  getIsPrivate,
  setIsRecording,
  setChunks,
}: AudioRecorderOptions): AudioRecorderControls => {
  const mediaRecorderRef: { current: MediaRecorder | null } = { current: null };
  const mediaStreamRef: { current: MediaStream | null } = { current: null };
  const recordingChunksRef: { current: Blob[] } = { current: [] };
  const shouldSendRecordingRef: { current: boolean } = { current: false };

  const cleanupStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const startRecording = async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      shouldSendRecordingRef.current = false;
      recordingChunksRef.current = [];
      setChunks([]);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          const updated = [...recordingChunksRef.current, event.data];
          recordingChunksRef.current = updated;
          setChunks(updated);
        }
      };

      recorder.onstop = async () => {
        const chunks = recordingChunksRef.current;
        cleanupStream();
        setIsRecording(false);
        recordingChunksRef.current = [];
        setChunks([]);
        if (!shouldSendRecordingRef.current) {
          shouldSendRecordingRef.current = false;
          return;
        }
        shouldSendRecordingRef.current = false;
        if (!chunks.length) {
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try {
          const base64 = await blobToBase64(blob);
          const payload = buildMediaMessagePayload({
            mediaType: "ptt",
            originType: "base64",
            originValue: base64,
          });
          if (getIsPrivate()) {
            payload.isPrivate = true;
          }
          getOnSendMessage()(payload);
        } catch {}
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      cleanupStream();
      recordingChunksRef.current = [];
      setChunks([]);
      setIsRecording(false);
    }
  };

  const finishRecording = () => {
    shouldSendRecordingRef.current = true;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  };

  const cancelRecording = () => {
    shouldSendRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      cleanupStream();
      recordingChunksRef.current = [];
      setChunks([]);
      setIsRecording(false);
    }
  };

  const dispose = () => {
    shouldSendRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    cleanupStream();
    recordingChunksRef.current = [];
    setChunks([]);
    setIsRecording(false);
  };

  return {
    startRecording,
    finishRecording,
    cancelRecording,
    dispose,
  };
};

interface ChatAreaProps {
  chat: Chat | null;
  messages: Message[];
  onSendMessage: (payload: SendMessagePayload) => void;
  onAssignChat: (chatId: string) => void;
  onFinishAttendance: (chatId: string) => void;
  onLoadMoreMessages?: () => void;
  hasMoreMessages?: boolean;
  isLoadingMoreMessages?: boolean;
  isPrependingMessages?: boolean;
  showSidebar: boolean;
  onShowSidebar: () => void;
  credentialId?: string | null;
  onAssignLabel?: (chatId: string, label: Label) => Promise<void> | void;
  onRemoveLabel?: (chatId: string, label: Label) => Promise<void> | void;
}

export const ChatArea = ({
  chat,
  messages,
  onSendMessage,
  onAssignChat,
  onFinishAttendance,
  onLoadMoreMessages,
  hasMoreMessages = false,
  isLoadingMoreMessages = false,
  isPrependingMessages = false,
  showSidebar,
  onShowSidebar,
  credentialId,
  onAssignLabel,
  onRemoveLabel,
}: ChatAreaProps) => {
  const [messageText, setMessageText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingChunks, setRecordingChunks] = useState<Blob[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [isLoadingLabels, setIsLoadingLabels] = useState(false);
  const [labelLoadingMap, setLabelLoadingMap] = useState<Record<string, boolean>>({});
  const onSendMessageRef = useRef(onSendMessage);
  const isPrivateRef = useRef(isPrivate);
  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);
  const messagesStartRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const orderedMessages = useMemo(
    () => [...messages].sort(compareMessagesByTimestamp),
    [messages]
  );
  const selectedLabelIds = useMemo(() => new Set((chat?.labels ?? []).map(label => label.id)), [chat?.labels]);
  const audioSourceCacheRef = useRef<Map<string, CachedAudioSource>>(new Map());
  const fetchAvailableLabels = useCallback(async () => {
    if (!credentialId) {
      return [] as Label[];
    }

    const { data, error } = await supabase
      .from('labels')
      .select('id, name, color, credential_id')
      .eq('credential_id', credentialId)
      .order('name', { ascending: true });

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      color: row.color,
      credentialId: row.credential_id ?? undefined,
    }));
  }, [credentialId]);

  useEffect(() => {
    let active = true;

    const loadLabels = async () => {
      if (!credentialId) {
        if (active) {
          setAvailableLabels([]);
          setIsLoadingLabels(false);
        }
        return;
      }

      if (active) {
        setIsLoadingLabels(true);
      }

      try {
        const labels = await fetchAvailableLabels();
        if (active) {
          setAvailableLabels(labels);
        }
      } catch (unknownError) {
        console.error('Error fetching labels:', unknownError);
        if (active) {
          setAvailableLabels([]);
        }
      } finally {
        if (active) {
          setIsLoadingLabels(false);
        }
      }
    };

    loadLabels();

    return () => {
      active = false;
    };
  }, [credentialId, fetchAvailableLabels]);

  const refreshLabels = useCallback(async () => {
    if (!credentialId) {
      setAvailableLabels([]);
      return;
    }

    setIsLoadingLabels(true);

    try {
      const labels = await fetchAvailableLabels();
      setAvailableLabels(labels);
    } catch (unknownError) {
      console.error('Error refreshing labels:', unknownError);
      setAvailableLabels([]);
    } finally {
      setIsLoadingLabels(false);
    }
  }, [credentialId, fetchAvailableLabels]);

  const handleToggleLabelSelection = useCallback(
    async (label: Label, nextChecked: boolean) => {
      if (!chat) {
        return;
      }

      setLabelLoadingMap(prev => ({ ...prev, [label.id]: true }));

      try {
        if (nextChecked) {
          if (onAssignLabel) {
            await onAssignLabel(chat.id, label);
          }
        } else if (onRemoveLabel) {
          await onRemoveLabel(chat.id, label);
        }
      } catch (unknownError) {
        console.error('Error updating label selection:', unknownError);
      } finally {
        setLabelLoadingMap(prev => {
          const next = { ...prev };
          delete next[label.id];
          return next;
        });
      }
    },
    [chat, onAssignLabel, onRemoveLabel]
  );
  const { audioSources, urlsToRevoke } = useMemo(() => {
    const previousCache = audioSourceCacheRef.current;
    const nextCache = new Map<string, CachedAudioSource>();
    const exposedSources = new Map<string, AudioSource>();
    const urlsToRevoke: string[] = [];
    const remainingPreviousIds = new Set(previousCache.keys());

    for (const message of orderedMessages) {
      remainingPreviousIds.delete(message.id);
      const isAudioMessage =
        message.messageType === "media" &&
        (message.mediaType === "audio" || message.mediaType === "ptt" || message.mediaType === "voice");

      if (!isAudioMessage) {
        continue;
      }

      const signature = getAudioSignature(message);
      const cached = previousCache.get(message.id);

      if (cached && cached.signature === signature) {
        nextCache.set(message.id, cached);
        exposedSources.set(message.id, cached.source);
        continue;
      }

      if (cached?.source.shouldRevoke) {
        urlsToRevoke.push(cached.source.url);
      }

      const resolvedSource = resolveAudioSource(message);
      if (resolvedSource) {
        const cachedSource: CachedAudioSource = {
          source: resolvedSource,
          signature,
        };
        nextCache.set(message.id, cachedSource);
        exposedSources.set(message.id, resolvedSource);
      }
    }

    for (const id of remainingPreviousIds) {
      const cached = previousCache.get(id);
      if (cached?.source.shouldRevoke) {
        urlsToRevoke.push(cached.source.url);
      }
    }

    audioSourceCacheRef.current = nextCache;

    return { audioSources: exposedSources, urlsToRevoke };
  }, [orderedMessages]);
  const [securedMediaSources, setSecuredMediaSources] = useState<Record<string, ResolvedMediaSource>>({});

  useEffect(() => {
    onSendMessageRef.current = onSendMessage;
  }, [onSendMessage]);

  useEffect(() => {
    isPrivateRef.current = isPrivate;
  }, [isPrivate]);

  useEffect(() => {
    if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
      return;
    }
    urlsToRevoke.forEach((url) => {
      URL.revokeObjectURL(url);
    });
  }, [urlsToRevoke]);

  useEffect(() => {
    return () => {
      if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") {
        return;
      }
      audioSourceCacheRef.current.forEach(({ source }) => {
        if (source.shouldRevoke) {
          URL.revokeObjectURL(source.url);
        }
      });
    };
  }, []);

  if (!recorderRef.current) {
    recorderRef.current = createAudioRecorder({
      getOnSendMessage: () => onSendMessageRef.current,
      getIsPrivate: () => isPrivateRef.current,
      setIsRecording,
      setChunks: setRecordingChunks,
    });
  }

  useEffect(() => {
    return () => {
      recorderRef.current?.dispose();
    };
  }, []);

  const urlMediaSources = useMemo(() => {
    const map: Record<string, ResolvedMediaSource> = {};
    orderedMessages.forEach((message) => {
      if (message.messageType !== "media") {
        return;
      }
      if (message.mediaUrl && !shouldUseAuthenticatedDownload(message.mediaUrl)) {
        map[message.id] = {
          url: message.mediaUrl,
          downloadUrl: message.mediaUrl,
          contentType: null,
          fileName: message.documentName ?? null,
        };
      }
    });
    return map;
  }, [orderedMessages]);

  const base64MediaSources = useMemo(() => {
    const map: Record<string, ResolvedMediaSource> = {};
    orderedMessages.forEach((message) => {
      if (message.messageType !== "media") {
        return;
      }
      if (!message.mediaUrl && message.mediaBase64) {
        const bytes = decodeBase64ToUint8Array(message.mediaBase64);
        if (!bytes.length) {
          return;
        }
        const mimeType = getMimeTypeForMessage(message);
        const blob = new Blob([bytes], { type: mimeType });
        const objectUrl = createObjectUrl(blob);
        if (!objectUrl) {
          return;
        }
        map[message.id] = {
          url: objectUrl,
          downloadUrl: objectUrl,
          contentType: mimeType,
          fileName: message.documentName ?? null,
          revokable: true,
        };
      }
    });
    return map;
  }, [orderedMessages]);

  useEffect(() => {
    const urls = Object.values(base64MediaSources).map((entry) => entry.url);
    return () => {
      urls.forEach((url) => revokeObjectUrl(url));
    };
  }, [base64MediaSources]);

  useEffect(() => {
    const requiresAuthenticated = orderedMessages.filter(
      (message) => message.messageType === "media" && message.mediaUrl && shouldUseAuthenticatedDownload(message.mediaUrl)
    );

    if (!requiresAuthenticated.length || !credentialId) {
      setSecuredMediaSources({});
      return;
    }

    let active = true;
    const urlsToRevoke: string[] = [];

    const resolve = async () => {
      const resolved: Record<string, ResolvedMediaSource> = {};

      for (const message of requiresAuthenticated) {
        if (!message.mediaUrl) {
          continue;
        }
        try {
          const response = await requestAuthenticatedMedia({ credentialId, url: message.mediaUrl });
          if (!active || !response) {
            continue;
          }
          const objectUrl = createObjectUrl(response.blob);
          if (!objectUrl) {
            continue;
          }
          resolved[message.id] = {
            url: objectUrl,
            downloadUrl: objectUrl,
            contentType: response.contentType,
            fileName: response.fileName ?? message.documentName ?? null,
            revokable: true,
          };
          urlsToRevoke.push(objectUrl);
        } catch {
        }
      }

      if (active) {
        setSecuredMediaSources(resolved);
      }
    };

    resolve();

    return () => {
      active = false;
      urlsToRevoke.forEach((url) => revokeObjectUrl(url));
    };
  }, [orderedMessages, credentialId]);

  const resolvedMediaSources = useMemo(() => {
    return { ...urlMediaSources, ...base64MediaSources, ...securedMediaSources };
  }, [urlMediaSources, base64MediaSources, securedMediaSources]);

  useEffect(() => {
    if (!isPrependingMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [orderedMessages, isPrependingMessages]);

  const handleSend = () => {
    if (messageText.trim()) {
      onSendMessage({
        content: messageText,
        messageType: 'text',
        ...(isPrivate ? { isPrivate: true } : {}),
      });
      setMessageText("");
    }
  };

  const handleStartRecording = () => {
    recorderRef.current?.startRecording();
  };

  const handleFinishRecording = () => {
    recorderRef.current?.finishRecording();
  };

  const handleCancelRecording = () => {
    recorderRef.current?.cancelRecording();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttach = () => {
    fileInputRef.current?.click();
  };

  const handleSendLocation = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const latitudeInput = window.prompt('Informe a latitude');
    if (!latitudeInput) {
      return;
    }

    const longitudeInput = window.prompt('Informe a longitude');
    if (!longitudeInput) {
      return;
    }

    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const locationNameInput = window.prompt('Informe o nome do local') ?? '';
    const trimmedLocationName = locationNameInput.trim();
    const content = trimmedLocationName || `${latitude}, ${longitude}`;

    onSendMessage({
      content,
      messageType: 'location',
      latitude,
      longitude,
      locationName: trimmedLocationName || undefined,
      ...(isPrivate ? { isPrivate: true } : {}),
    });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const target = event.target;
    const file = target.files?.[0];
    if (!file) {
      target.value = "";
      return;
    }

    try {
      const mediaType = determineMediaType(file);
      const originType: MediaOrigin = shouldUseBase64(mediaType) ? 'base64' : 'url';
      const originValue =
        originType === 'base64'
          ? await fileToBase64(file)
          : URL.createObjectURL(file);
      const payload = buildMediaMessagePayload({
        mediaType,
        originType,
        originValue,
        documentName: mediaType === 'document' ? file.name : undefined,
      });
      onSendMessage(payload);
    } catch {
    } finally {
      target.value = "";
    }
  };

  const renderMediaDownload = (
    message: Message,
    source: ResolvedMediaSource | undefined,
  ) => {
    if (!source?.downloadUrl) {
      return null;
    }
    const downloadName = message.documentName ?? source.fileName ?? "media";
    return (
      <a
        href={source.downloadUrl}
        download={downloadName}
        className="text-xs text-primary underline"
        data-testid={`chat-media-download-${message.id}`}
      >
        {`Baixar ${downloadName}`}
      </a>
    );
  };

  const renderMessageContent = (message: Message) => {
    if (message.messageType !== "media") {
      return <p className="text-sm break-words">{message.content}</p>;
    }

    const source = resolvedMediaSources[message.id];
    const caption = message.caption || (message.content.startsWith("[") ? "" : message.content);
    const fileName = message.documentName ?? source?.fileName ?? null;
    const downloadLabel = renderMediaDownload(message, source);
    const type = message.mediaType?.toLowerCase() ?? "";

    if (type === "image" || type === "photo") {
      return (
        <div className="space-y-2">
          {source?.url ? (
            <img src={source.url} alt={caption || fileName || "imagem"} className="rounded-md max-w-full" />
          ) : null}
          {fileName ? <p className="text-xs text-muted-foreground break-words">{fileName}</p> : null}
          {caption ? <p className="text-sm break-words">{caption}</p> : null}
          {downloadLabel}
        </div>
      );
    }

    if (type === "video") {
      return (
        <div className="space-y-2">
          <video controls preload="metadata" className="rounded-md max-w-full" src={source?.url}></video>
          {caption ? <p className="text-sm break-words">{caption}</p> : null}
          {fileName ? <p className="text-xs text-muted-foreground break-words">{fileName}</p> : null}
          {downloadLabel}
        </div>
      );
    }

    if (type === "audio" || type === "ptt" || type === "voice") {
      return (
        <div className="space-y-2">
          <audio controls preload="metadata" src={source?.url}></audio>
          {caption ? <p className="text-sm break-words">{caption}</p> : null}
          {fileName ? <p className="text-xs text-muted-foreground break-words">{fileName}</p> : null}
          {downloadLabel}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {fileName ? <p className="text-sm font-medium break-words">{fileName}</p> : null}
        {caption ? <p className="text-sm break-words">{caption}</p> : null}
        {downloadLabel}
      </div>
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const MessageStatus = ({ status }: { status?: Message['status'] }) => {
    if (!status) return null;
    
    if (status === 'read') {
      return <CheckCheck className="w-4 h-4 text-blue-500" />;
    } else if (status === 'delivered') {
      return <CheckCheck className="w-4 h-4 text-muted-foreground" />;
    }
    return <Check className="w-4 h-4 text-muted-foreground" />;
  };

  if (!chat) {
    return (
      <div
        data-testid="chat-area-placeholder"
        className={`relative flex-1 items-center justify-center bg-[hsl(var(--whatsapp-chat-bg))] ${showSidebar ? 'hidden md:flex' : 'flex'}`}
      >
        {!showSidebar && (
          <div className="absolute top-4 left-4 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/10"
              onClick={onShowSidebar}
              aria-label="Voltar para conversas"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </div>
        )}
        <div className="text-center space-y-4">
          <div className="w-64 h-64 mx-auto opacity-20">
            <svg viewBox="0 0 303 172" className="w-full h-full">
              <path fill="currentColor" d="M219.7 120.5c-1.4-1.2-2.8-2.4-4.2-3.6-7.5-6.3-15.1-12.5-23.1-18.1-4.5-3.2-9.3-6-14.4-8.1-5.1-2.1-10.5-3.5-16-3.9-5.5-.4-11.1.2-16.4 1.8-5.3 1.6-10.4 4.1-14.9 7.4-4.5 3.3-8.4 7.4-11.5 12.1-3.1 4.7-5.4 9.9-6.8 15.4-.7 2.7-1.2 5.5-1.4 8.3-.2 2.8-.1 5.6.3 8.4.8 5.6 2.6 11 5.3 15.9 2.7 4.9 6.2 9.3 10.4 13 8.4 7.4 19.1 11.9 30.4 13 11.3 1.1 23-1.3 33.1-7 10.1-5.7 18.5-14.4 23.8-24.7 2.7-5.2 4.6-10.8 5.7-16.6.5-2.9.8-5.8.8-8.8 0-2.9-.3-5.9-.9-8.7z"/>
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-light text-muted-foreground">WhatsApp Web</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Selecione uma conversa para começar a enviar mensagens
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="chat-area"
      className={`flex-1 flex flex-col bg-[hsl(var(--whatsapp-chat-bg))] ${showSidebar ? 'hidden md:flex' : 'flex'}`}
    >
      {/* Chat Header */}
      <div className="bg-[hsl(var(--whatsapp-header))] p-3 flex items-center justify-between border-b border-[hsl(var(--whatsapp-border))]">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-white/10 md:hidden"
            onClick={onShowSidebar}
            aria-label="Voltar para conversas"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Avatar className="w-10 h-10">
            <AvatarImage src={chat.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(chat.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold text-primary-foreground">{chat.name}</h2>
            <p className="text-xs text-primary-foreground/70">online</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Video className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Phone className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-white/10"
                disabled={!chat}
              >
                <Tag className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isLoadingLabels ? (
                <DropdownMenuItem disabled>Carregando...</DropdownMenuItem>
              ) : availableLabels.length === 0 ? (
                <DropdownMenuItem disabled>Nenhuma etiqueta</DropdownMenuItem>
              ) : (
                availableLabels.map(label => {
                  const checked = selectedLabelIds.has(label.id);
                  const isUpdating = Boolean(labelLoadingMap[label.id]);
                  return (
                    <DropdownMenuCheckboxItem
                      key={label.id}
                      checked={checked}
                      disabled={isUpdating}
                      onCheckedChange={value => {
                        if (!chat) {
                          return;
                        }
                        const nextChecked = value === true;
                        if (nextChecked === checked) {
                          return;
                        }
                        handleToggleLabelSelection(label, nextChecked);
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: label.color }}
                        />
                        {label.name}
                      </span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  refreshLabels();
                }}
                disabled={isLoadingLabels || !credentialId}
              >
                Atualizar lista
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
            <Search className="w-5 h-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
                <MoreVertical className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              {chat.attendanceStatus !== "finished" && (
                <DropdownMenuItem onClick={() => onFinishAttendance(chat.id)}>
                  Finalizar atendimento
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onAssignChat(chat.id)}>
                Atribuir conversa
              </DropdownMenuItem>
              <DropdownMenuItem>Info do contato</DropdownMenuItem>
              <DropdownMenuItem>Selecionar mensagens</DropdownMenuItem>
              <DropdownMenuItem>Silenciar notificações</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">
                Apagar conversa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10h1v1h-1z' fill='%23000000' fill-opacity='0.02'/%3E%3C/svg%3E")`,
      }}>
        <div className="space-y-3 max-w-4xl mx-auto">
          <div ref={messagesStartRef} />
          {hasMoreMessages && onLoadMoreMessages && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onLoadMoreMessages}
                disabled={isLoadingMoreMessages}
              >
                {isLoadingMoreMessages ? "Carregando..." : "Carregar mensagens anteriores"}
              </Button>
            </div>
          )}
          {orderedMessages.map((message) => {
            const isAudioMessage =
              message.messageType === "media" &&
              (message.mediaType === "audio" || message.mediaType === "ptt" || message.mediaType === "voice");
            const audioSource = isAudioMessage ? audioSources.get(message.id) : undefined;
            const fallbackLabel = `[${message.mediaType === "ptt" ? "ptt" : "audio"}]`;
            const caption = message.caption?.trim() || message.content?.trim() || fallbackLabel;

            return (
              <div
                key={message.id}
                className={`flex w-full ${message.from === 'me' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`
                    max-w-[65%] rounded-lg p-2 px-3 shadow-sm
                    ${message.from === 'me'
                      ? 'bg-[hsl(var(--whatsapp-message-out))]'
                      : 'bg-[hsl(var(--whatsapp-message-in))]'
                    }
                    ${message.isPrivate ? 'ring-2 ring-primary' : ''}
                  `}
                >
                  {renderMessageContent(message)}
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {message.timestamp}
                    </span>
                    {message.from === 'me' && <MessageStatus status={message.status} />}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="bg-[hsl(var(--whatsapp-header))] p-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10">
          <Smile className="w-5 h-5" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept="image/*,video/*,audio/*,application/*"
          onChange={handleFileChange}
          data-testid="chat-area-file-input"
        />
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-white/10"
          onClick={handleAttach}
          aria-label="Anexar arquivo"
        >
          <Paperclip className="w-5 h-5" />
        </Button>

        {isRecording ? (
          <div className="flex-1 bg-white/90 rounded-md px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              Gravando áudio...
            </div>
            <span className="text-xs text-muted-foreground">{recordingChunks.length} bloco(s)</span>
          </div>
        ) : (
          <Textarea
            data-testid="chat-area-input"
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Digite uma mensagem"
            className="flex-1 bg-white/90 min-h-[56px]"
            rows={2}
          />
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`text-primary-foreground hover:bg-white/10 ${
            isPrivate ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''
          }`}
          onClick={() => setIsPrivate((value) => !value)}
          aria-label={isPrivate ? 'Desativar modo privado' : 'Ativar modo privado'}
          aria-pressed={isPrivate}
          data-testid="chat-area-private-toggle"
        >
          {isPrivate ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
        </Button>

        {isRecording ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-white/10"
              onClick={handleCancelRecording}
              aria-label="Cancelar gravação"
            >
              <X className="w-5 h-5" />
            </Button>
            <Button
              onClick={handleFinishRecording}
              size="icon"
              className="bg-primary hover:bg-primary/90"
              aria-label="Enviar áudio gravado"
            >
              <Send className="w-5 h-5" />
            </Button>
          </>
        ) : messageText.trim() ? (
          <Button
            onClick={handleSend}
            size="icon"
            className="bg-primary hover:bg-primary/90"
            aria-label="Enviar mensagem"
          >
            <Send className="w-5 h-5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-white/10"
            onClick={handleStartRecording}
            aria-label="Iniciar gravação de áudio"
          >
            <Mic className="w-5 h-5" />
          </Button>
        )}
      </div>
    </div>
  );
};
