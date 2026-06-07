import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, Heart, MessageCircle, X, Check, Upload, Loader2, Sparkles, Play, Users, LayoutGrid, Calendar, Share2, ChevronDown, Flag } from 'lucide-react';
import Fuse from 'fuse.js';
import { cn } from '../lib/utils';
import { db, storage, auth, handleFirestoreError, OperationType } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, increment, updateDoc, doc, limit, startAfter, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { memoryService, authService } from '../lib/api-client';
import { useAuthStore } from '../stores/authStore';
import { LogIn, LogOut, User as UserIcon, ImageIcon, Film } from 'lucide-react';
import { optimizeImage, generateVideoThumbnail } from '../lib/media-utils';

// Types
interface Memory {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'image' | 'video';
  caption: string;
  authorName: string;
  faculty: string;
  likesCount: number;
  commentsCount: number;
  tags: string[];
  taggedPeople?: string[];
  approved: boolean;
  createdAt: any;
}

interface Comment {
  id: string;
  text: string;
  authorName: string;
  createdAt: any;
  userId: string;
}

const FACULTIES = ['All', 'Science', 'Arts', 'Engineering', 'Law', 'Medicine', 'Education', 'Management', 'Social Sciences'];

const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','gif','webp','avif','bmp','tiff','svg','jfif','heic','heif']);
const VIDEO_EXTENSIONS = new Set(['mp4','mov','webm','ogg','m4v','avi','mkv','flv','3gp','wmv','ts']);

function getFileExtension(filename: string) {
  return filename.split('.').pop()?.toLowerCase() || '';
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(getFileExtension(file.name));
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/') || VIDEO_EXTENSIONS.has(getFileExtension(file.name));
}

// Components
function FileThumbnail({ file, onRemove }: { file: any, onRemove: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isImageFile(file)) {
      const url = URL.createObjectURL(file);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  return (
    <div className="relative group/file aspect-square bg-white/5 border border-white/10 overflow-hidden">
      <button 
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover/file:opacity-100 transition-all z-20 hover:scale-110 shadow-lg"
      >
        <X size={10} />
      </button>
      
      {isImageFile(file) && preview ? (
        <img src={preview} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center space-y-2 bg-[#0A0A0A]">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover/file:bg-[#D4AF37]/20 group-hover/file:border-[#D4AF37]/50 transition-colors">
            {isVideoFile(file) ? (
              <Play className="text-[#D4AF37]" size={20} fill="#D4AF37" />
            ) : (
              <Upload className="text-white/20" size={20} />
            )}
          </div>
          <span className="text-[8px] text-white/30 uppercase tracking-[0.2em] px-2 truncate w-full text-center">
            {isVideoFile(file) ? 'Video' : 'File'}
          </span>
        </div>
      )}
      
      <div className="absolute inset-x-0 bottom-0 p-1.5 bg-black/60 backdrop-blur-sm transform translate-y-full group-hover/file:translate-y-0 transition-transform">
        <p className="text-[7px] text-white/70 truncate text-center uppercase tracking-widest">{file.name}</p>
      </div>
      
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/file:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}

function ProgressiveImage({ src, thumbnail, alt, className, imgClassName }: { src: string; thumbnail?: string; alt: string; className?: string; imgClassName?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className={cn("relative overflow-hidden bg-[#0A0A0A] w-full h-full", className)}>
      {/* Thumbnail or Blur Placeholder */}
      {thumbnail && !isLoaded && !hasError && (
        <img 
          src={thumbnail} 
          alt="" 
          className={cn("absolute inset-0 w-full h-full object-cover blur-lg scale-105 opacity-50", imgClassName)} 
        />
      )}
      
      {!isLoaded && !thumbnail && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="text-[#D4AF37]/20 animate-spin" size={24} />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/5 space-y-2">
           <ImageIcon size={24} className="text-white/10" />
           <span className="text-[8px] text-white/20 uppercase tracking-widest font-black">Lost in the Matrix</span>
        </div>
      )}
      
      <img
        src={src}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          console.error(`Failed to load image: ${src}`);
          setHasError(true);
        }}
        className={cn(
          "w-full h-full object-cover transition-all duration-700 ease-out",
          isLoaded ? "opacity-100 blur-0 scale-100" : "opacity-0 scale-105",
          imgClassName
        )}
      />
    </div>
  );
}

import { useWebSockets } from '../hooks/useWebSockets';

export default function Archive() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showUploadFromUrl = searchParams.get('upload') === 'true';
  const authMode = searchParams.get('auth'); // 'login' or 'register'
  
  const { user, isAuthenticated, login, register, isLoading: isAuthLoading, error: authError } = useAuthStore();
  
  const [activeNotification, setActiveNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [requestDeletionMemory, setRequestDeletionMemory] = useState<Memory | null>(null);
  const [deletionReason, setDeletionReason] = useState('');

  useEffect(() => {
    if (activeNotification) {
      const timer = setTimeout(() => setActiveNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeNotification]);
  
  const [memories, setMemories] = useState<Memory[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(showUploadFromUrl);

  // Auth Form State
  const [authFormData, setAuthFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    username: '',
  });

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'login') {
        await login({
          username: authFormData.email,
          password: authFormData.password
        });
      } else {
        await register(authFormData);
      }
      setSearchParams(new URLSearchParams());
      setActiveNotification({ type: 'success', message: `Identity verified. Welcome back.` });
    } catch (err) {
      // Error handled by store
    }
  };
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileProgresses, setFileProgresses] = useState<{[key: string]: { progress: number, status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'failed' }}>({});

  const updateFileProgress = (
    fileName: string, 
    status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'failed', 
    progress: number
  ) => {
    setFileProgresses(prev => {
      const updated = {
        ...prev,
        [fileName]: { status, progress }
      };
      
      const keys = Object.keys(updated);
      if (keys.length > 0) {
        const total = keys.reduce((sum, key) => {
          const item = updated[key];
          let val = 0;
          if (item.status === 'compressing') val = 10;
          else if (item.status === 'uploading') val = item.progress;
          else if (item.status === 'completed') val = 100;
          return sum + val;
        }, 0);
        setUploadProgress(Math.round(total / keys.length));
      }
      return updated;
    });
  };

  const [isLoading, setIsLoading] = useState(true);
  const [selectedMemoryForComments, setSelectedMemoryForComments] = useState<Memory | null>(null);
  const [selectedImageForView, setSelectedImageForView] = useState<Memory | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [processingLikes, setProcessingLikes] = useState<Set<string>>(new Set());
  const [processingDeletions, setProcessingDeletions] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    authorName: '',
    faculty: 'Science',
    caption: '',
    tags: '',
    people: '',
  });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const MEMORIES_PER_PAGE = 12;
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFileError(null);

    if (selectedFiles.length === 0) return;

    const validFiles: File[] = [];
    let error: string | null = null;

    selectedFiles.forEach((file: File) => {
      // Validation: Type (Allow all images and videos)
      if (!isImageFile(file) && !isVideoFile(file)) {
        error = "Some files are of unsupported type. Please upload images or videos.";
        return;
      }

      // Validation: Size (50MB)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        error = "Some files are too large. Maximum size is 50MB.";
        return;
      }
      validFiles.push(file);
    });

    if (error) setFileError(error);
    setFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (showUploadFromUrl) setIsUploadOpen(true);
  }, [showUploadFromUrl]);

  const formatRawMemories = useCallback((rawData: any[]): Memory[] => {
    return rawData.map((m: any) => {
      let parsedTags: string[] = [];
      if (Array.isArray(m.tags)) {
        parsedTags = m.tags.map((t: any) => String(t).trim()).filter(Boolean);
      } else if (typeof m.tags === 'string' && m.tags) {
        parsedTags = m.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
      }

      let parsedPeople: string[] = [];
      const rawPeople = m.people || m.taggedPeople || m.tagged_people;
      if (Array.isArray(rawPeople)) {
        parsedPeople = rawPeople.map((p: any) => String(p).trim()).filter(Boolean);
      } else if (typeof rawPeople === 'string' && rawPeople) {
        parsedPeople = rawPeople.split(',').map((p: string) => p.trim()).filter(Boolean);
      }

      return {
        id: m.id.toString(),
        url: m.media_url,
        thumbnailUrl: m.thumbnail_url,
        type: m.media_type?.toLowerCase() === 'video' ? 'video' : 'image',
        caption: m.description || '',
        authorName: m.uploader_name || 'Anonymous',
        faculty: m.faculty || 'General',
        likesCount: m.likes_count || 0,
        commentsCount: m.comments_count || 0,
        tags: parsedTags,
        taggedPeople: parsedPeople,
        approved: m.approved,
        createdAt: { toDate: () => new Date(m.created_at) }
      };
    });
  }, []);

  const handleFetchedMemories = useCallback((rawData: any[]) => {
    const newMemories = formatRawMemories(rawData);
    const uniqueList: Memory[] = [];
    const seen = new Set<string>();
    newMemories.forEach((m) => {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        uniqueList.push(m);
      }
    });
    setMemories(uniqueList);
    if (rawData.length < MEMORIES_PER_PAGE) {
      setHasMore(false);
    } else {
      setHasMore(true);
    }
  }, [formatRawMemories, MEMORIES_PER_PAGE]);

  // Real-time updates & WebSocket integration
  const { sendMessage, isConnected } = useWebSockets((data) => {
    if (data.type === 'NEW_MEMORY_APPROVED' || data.type === 'MEMORY_DELETED') {
      fetchMemoriesWithFallback();
    } else if (data.type === 'FETCH_MEMORIES_RESPONSE') {
      const rawData = Array.isArray(data.memories) ? data.memories : [];
      handleFetchedMemories(rawData);
      setIsLoading(false);
    }
  });

  const fetchMemoriesWithFallback = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    if (isConnected) {
      sendMessage({
        type: 'FETCH_MEMORIES_REQUEST',
        faculty: filter !== 'All' ? filter : undefined
      });
    } else {
      try {
        const data = await memoryService.getMemories({
          faculty: filter !== 'All' ? filter : undefined,
          limit: MEMORIES_PER_PAGE,
          skip: 0
        });
        const rawData = Array.isArray(data) ? data : [];
        handleFetchedMemories(rawData);
      } catch (err) {
        console.error("Memory load error:", err);
        setHasError(true);
        setActiveNotification({ type: 'error', message: "Failed to load archive feed. Please try refreshing the page." });
      } finally {
        setIsLoading(false);
      }
    }
  }, [isConnected, filter, sendMessage, handleFetchedMemories, MEMORIES_PER_PAGE]);

  // Fetch on mount, and whenever connection status or filter changes
  useEffect(() => {
    fetchMemoriesWithFallback();
  }, [fetchMemoriesWithFallback]);

  const loadMemories = async (isInitial = false) => {
    if ((!isInitial && !hasMore) || isLoadingMore) return;
    
    setHasError(false);
    if (isInitial) {
      setIsLoading(true);
      setMemories([]);
      setHasMore(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const data = await memoryService.getMemories({
        faculty: filter !== 'All' ? filter : undefined,
        limit: MEMORIES_PER_PAGE,
        skip: isInitial ? 0 : memories.length
      });
      
      const rawData = Array.isArray(data) ? data : [];
      if (isInitial) {
        handleFetchedMemories(rawData);
      } else {
        const newMemories = formatRawMemories(rawData);
        if (rawData.length < MEMORIES_PER_PAGE) {
          setHasMore(false);
        }
        setMemories(prev => {
          const existingIds = new Set<string>(prev.map(m => m.id));
          const uniqueNew = newMemories.filter((m: Memory) => !existingIds.has(m.id));
          const resultList: Memory[] = [];
          
          uniqueNew.forEach((m) => {
            if (!existingIds.has(m.id)) {
              existingIds.add(m.id);
              resultList.push(m);
            }
          });
          return [...prev, ...resultList];
        });
      }
    } catch (error) {
      console.error("Load memories error:", error);
      setHasError(true);
      setActiveNotification({ type: 'error', message: "Failed to load archive feed." });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // Keep loadMemories closure fresh for the IntersectionObserver to always execute with latest state
  const loadMemoriesRef = useRef(loadMemories);
  useEffect(() => {
    loadMemoriesRef.current = loadMemories;
  });

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoading && !isLoadingMore && !search && !hasError) {
          console.log("[Archive] Sentinel intersected - triggering lazy load of memories");
          loadMemoriesRef.current();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    const currentSentinel = sentinelRef.current;
    observer.observe(currentSentinel);

    return () => {
      if (currentSentinel) {
        observer.unobserve(currentSentinel);
      }
    };
  }, [hasMore, isLoading, isLoadingMore, search, hasError]);

  // Real-time listener for metadata (likes/comments) only
  // This is better than fetching full objects real-time for optimization
  useEffect(() => {
    if (!db || memories.length === 0) return;

    // We only listen for updates on CURRENTLY visible memories
    // For simplicity in this build, we'll stick to pagination without real-time 
    // unless we need it for specific items.
  }, [memories.length]);

  const fuse = useMemo(() => {
    return new Fuse(memories, {
      keys: ['caption', 'authorName', 'tags', 'taggedPeople', 'faculty'],
      threshold: 0.4,
      distance: 100,
    });
  }, [memories]);

  const allAvailableTags = useMemo(() => {
    const tagsSet = new Set<string>();
    memories.forEach(m => {
      if (Array.isArray(m.tags)) {
        m.tags.forEach(t => {
          if (t && t.trim()) tagsSet.add(t.trim());
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [memories]);

  const allAvailablePeople = useMemo(() => {
    const peopleSet = new Set<string>();
    memories.forEach(m => {
      const peopleList = m.taggedPeople || [];
      if (Array.isArray(peopleList)) {
        peopleList.forEach(p => {
          if (p && p.trim()) peopleSet.add(p.trim());
        });
      }
    });
    return Array.from(peopleSet).sort();
  }, [memories]);

  const filteredMemories = useMemo(() => {
    let result = memories;
    
    // Faculty filtering is now done at the query level for optimization
    
    if (search.trim()) {
      const searchResults = fuse.search(search);
      result = searchResults.map(r => r.item);
    }

    if (selectedTags.length > 0) {
      result = result.filter(m => {
        const memoryTags = m.tags ? m.tags.map(t => t.toLowerCase()) : [];
        return selectedTags.every(t => memoryTags.includes(t.toLowerCase()));
      });
    }

    if (selectedPeople.length > 0) {
      result = result.filter(m => {
        const memoryPeople = (m.taggedPeople || []).map(p => p.toLowerCase());
        return selectedPeople.every(p => memoryPeople.includes(p.toLowerCase()));
      });
    }
    
    return result;
  }, [memories, search, fuse, selectedTags, selectedPeople]);

  const formattedTimeline = useMemo(() => {
    if (viewMode !== 'timeline') return [];
    
    const groups: { [key: string]: Memory[] } = {};
    filteredMemories.forEach(m => {
      const date = m.createdAt?.toDate() || new Date();
      const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!groups[monthYear]) groups[monthYear] = [];
      groups[monthYear].push(m);
    });

    return Object.entries(groups).sort((a, b) => {
      const dateA = a[1][0].createdAt?.toDate() || new Date();
      const dateB = b[1][0].createdAt?.toDate() || new Date();
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredMemories, viewMode]);

  const handleAISuggest = async () => {
    if (files.length === 0) {
      setActiveNotification({ type: 'error', message: 'Select at least one photo or video first!' });
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const { default: imageCompression } = await import('browser-image-compression');
      let fileToAnalyze = files[0];
      if (fileToAnalyze.type.startsWith('image/') && fileToAnalyze.size > 1024 * 1024) {
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true };
        try { fileToAnalyze = await imageCompression(fileToAnalyze, options); } catch (e) { console.warn("AI analysis compression failed", e); }
      }
      const reader = new FileReader();
      const fileDataPromise = new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve({ base64, mimeType: fileToAnalyze.type });
        };
        reader.onerror = reject;
        reader.readAsDataURL(fileToAnalyze);
      });
      const { base64, mimeType } = await fileDataPromise;
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `You are analyzing a media file (image or video) from the Lagos State University (LASU) Class of 2026 memory archive. Suggest 5 tags, a Faculty, and identity people. Return ONLY JSON.`,
          imageBase64: base64,
          mimeType: mimeType
        })
      });
      if (!res.ok) throw new Error("AI analysis failed");
      const data = await res.json();
      const cleanJson = data.text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      setFormData({ ...formData, tags: parsed.tags, faculty: parsed.faculty || formData.faculty, people: parsed.people || formData.people });
    } catch (error: any) {
      console.error("AI Error:", error);
      setActiveNotification({ type: 'error', message: error.message || "Could not analyze media." });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0 || !db || !storage) return;
    setIsUploading(true);
    setUploadProgress(0);
    
    // Initialize file progresses
    const initialProgresses: {[key: string]: { progress: number, status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'failed' }} = {};
    files.forEach(f => {
      initialProgresses[f.name] = { progress: 0, status: 'pending' };
    });
    setFileProgresses(initialProgresses);

    try {
      const processedPayloads = [];
      setIsCompressing(true);
      
      for (const file of files) {
        updateFileProgress(file.name, 'compressing', 10);
        let currentFile = file;
        let thumbnail: File | null = null;

        if (isImageFile(currentFile)) {
          const { optimized, thumbnail: thumb } = await optimizeImage(currentFile);
          currentFile = optimized;
          thumbnail = thumb;
        } else if (isVideoFile(currentFile)) {
          thumbnail = await generateVideoThumbnail(currentFile);
        }
        
        updateFileProgress(file.name, 'pending', 100);
        processedPayloads.push({ originalName: file.name, file: currentFile, thumbnail });
      }

      setIsCompressing(false);
      const uploadPromises = processedPayloads.map(async (payload, index) => {
        try {
          updateFileProgress(payload.originalName, 'uploading', 0);
          const apiFormData = new FormData();
          apiFormData.append('file', payload.file);
          if (payload.thumbnail) {
            apiFormData.append('thumbnail', payload.thumbnail);
          }
          apiFormData.append('title', formData.caption.slice(0, 50) || 'Memory');
          apiFormData.append('description', formData.caption);
          apiFormData.append('faculty', formData.faculty);
          apiFormData.append('uploader_name', user?.full_name || 'Anonymous');
          apiFormData.append('tags', formData.tags);
          apiFormData.append('people', formData.people);
          
          await memoryService.uploadMemory(apiFormData, (progressEvent) => {
            const percentCompleted = progressEvent.total 
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total) 
              : 0;
            updateFileProgress(payload.originalName, 'uploading', percentCompleted);
          });
          
          updateFileProgress(payload.originalName, 'completed', 100);
        } catch (err) {
          console.error("Backend upload failed:", err);
          updateFileProgress(payload.originalName, 'failed', 0);
          throw new Error("Preservation signal lost. Verify connection.");
        }
      });

      await Promise.all(uploadPromises);
      
      setActiveNotification({ type: 'success', message: `Archive updated. ${files.length} items preserved forever.` });
      setIsUploadOpen(false);
      setFiles([]);
      setFormData({ authorName: user?.full_name || '', faculty: 'General', caption: '', tags: '', people: '' });
      loadMemories(true); // Direct reload from FastAPI
      setUploadProgress(0);
      setFileProgresses({});
    } catch (error) {
      console.error("Batch upload error:", error);
      setActiveNotification({ type: 'error', message: 'Something went wrong during preservation.' });
    } finally {
      setIsUploading(false);
      setIsCompressing(false);
    }
  };

  const handleShare = async (memory: Memory) => {
    const shareData = { title: 'LASU 2026 Archive', text: memory.caption, url: window.location.origin + '/archive?memory=' + memory.id };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (err) { console.log('Share error', err); }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        setActiveNotification({ type: 'success', message: 'Link copied to clipboard!' });
      } catch (err) {
        setActiveNotification({ type: 'error', message: 'Could not copy link.' });
      }
    }
  };

  const handleLike = async (memoryId: string) => {
    if (processingLikes.has(memoryId)) return;
    setProcessingLikes(prev => new Set(prev).add(memoryId));
    try { 
      const response = await memoryService.likeMemory(memoryId);
      setMemories(prev => prev.map(m => m.id === memoryId ? { ...m, likesCount: response.likes_count } : m));
    } catch (error) { 
      console.error("Like error", error); 
    }
    finally { setProcessingLikes(prev => { const next = new Set(prev); next.delete(memoryId); return next; }); }
  };

  const handleDownload = async (memory: Memory) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const link = document.createElement('a');
      link.href = memory.url;
      const fileExtension = memory.type === 'video' 
        ? (memory.url.includes('.mp4') ? '.mp4' : memory.url.includes('.webm') ? '.webm' : memory.url.includes('.mov') ? '.mov' : '.mp4')
        : (memory.url.includes('.png') ? '.png' : memory.url.includes('.gif') ? '.gif' : memory.url.includes('.webp') ? '.webp' : memory.url.includes('.jpeg') ? '.jpeg' : '.jpg');
      link.download = `${memory.caption || 'memory'}-${memory.id}${fileExtension}`;
      link.referrerPolicy = 'no-referrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      const mediaType = memory.type === 'video' ? 'video' : 'image';
      setActiveNotification({ type: 'success', message: `${mediaType} downloaded successfully!` });
    } catch (error) {
      console.error("Download error", error);
      const mediaType = memory.type === 'video' ? 'video' : 'image';
      setActiveNotification({ type: 'error', message: `Failed to download ${mediaType}.` });
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreviousImage = () => {
    if (!selectedImageForView) return;
    const currentIndex = filteredMemories.findIndex(m => m.id === selectedImageForView.id);
    if (currentIndex > 0) {
      setSelectedImageForView(filteredMemories[currentIndex - 1]);
    }
  };

  const handleNextImage = () => {
    if (!selectedImageForView) return;
    const currentIndex = filteredMemories.findIndex(m => m.id === selectedImageForView.id);
    if (currentIndex < filteredMemories.length - 1) {
      setSelectedImageForView(filteredMemories[currentIndex + 1]);
    }
  };

  const handleRequestDeletion = (memory: Memory) => {
    if (!isAuthenticated) {
      setActiveNotification({ type: 'error', message: "Please verify your student identity to report content or request deletion." });
      setSearchParams({ auth: 'login' });
      return;
    }
    setRequestDeletionMemory(memory);
  };

  const handleRequestDeletionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestDeletionMemory || !deletionReason.trim()) return;

    setProcessingDeletions(prev => new Set(prev).add(requestDeletionMemory.id));
    try {
      if (db) {
        try {
          await addDoc(collection(db, 'deletion_requests'), {
            memoryId: requestDeletionMemory.id,
            memoryUrl: requestDeletionMemory.url,
            memoryCaption: requestDeletionMemory.caption,
            authorName: requestDeletionMemory.authorName,
            reason: deletionReason,
            requestedAt: serverTimestamp(),
            userId: auth?.currentUser?.uid || 'anonymous',
            status: 'pending'
          });
          console.log("[Archive] Submitted deletion request directly to Firestore.");
        } catch (fsError: any) {
          console.warn("[Archive] Firestore submission failed, trying local API fallback:", fsError);
          try {
            handleFirestoreError(fsError, OperationType.WRITE, 'deletion_requests');
          } catch (loggingErr) {
            console.error("[Archive] Standard Firestore logging error:", loggingErr);
          }
          await memoryService.requestDeletion({
            memoryId: requestDeletionMemory.id,
            reason: deletionReason,
            memoryUrl: requestDeletionMemory.url,
            memoryCaption: requestDeletionMemory.caption,
            authorName: requestDeletionMemory.authorName,
            userId: auth?.currentUser?.uid || 'anonymous'
          });
        }
      } else {
        await memoryService.requestDeletion({
          memoryId: requestDeletionMemory.id,
          reason: deletionReason,
          memoryUrl: requestDeletionMemory.url,
          memoryCaption: requestDeletionMemory.caption,
          authorName: requestDeletionMemory.authorName,
          userId: auth?.currentUser?.uid || 'anonymous'
        });
      }
      setActiveNotification({ type: 'success', message: "Your deletion request has been submitted to the moderators." });
      setRequestDeletionMemory(null);
      setDeletionReason('');
    } catch (error) {
      console.error("Deletion request error:", error);
      setActiveNotification({ type: 'error', message: "Failed to submit request. Please try again." });
    } finally {
      setProcessingDeletions(prev => {
        const next = new Set(prev);
        if (requestDeletionMemory) {
          next.delete(requestDeletionMemory.id);
        }
        return next;
      });
    }
  };

  const closeUpload = () => {
    setIsUploadOpen(false);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('upload');
    setSearchParams(newParams);
    setFileProgresses({});
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemoryForComments || !newComment.trim()) return;
    setIsSubmittingComment(true);
    try {
      await memoryService.addComment(selectedMemoryForComments.id, newComment.trim());
      setMemories(prev => prev.map(m => m.id === selectedMemoryForComments.id ? { ...m, commentsCount: m.commentsCount + 1 } : m));
      setNewComment('');
      setActiveNotification({ type: 'success', message: "Message added to the legacy." });
    } catch (error) {
      console.error("Comment error", error);
      setActiveNotification({ type: 'error', message: "Failed to share your message." });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  useEffect(() => {
    if (!selectedMemoryForComments || !db) {
      setComments([]);
      return;
    }

    const q = query(
      collection(db, 'memories', selectedMemoryForComments.id, 'comments'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      setComments(docs);
    });

    return () => unsubscribe();
  }, [selectedMemoryForComments]);

  return (
    <div className="pt-28 pb-20 min-h-screen px-4 bg-[#050505] text-center">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase mb-4">THE ARCHIVE</h1>
            <div className="flex items-center space-x-6">
              <p className="text-white/40 font-medium uppercase tracking-[0.2em] text-xs">Exploring the collective timeline of 2026</p>
              <div className="flex bg-white/5 p-1 rounded-sm border border-white/10">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-2 transition-all",
                    viewMode === 'grid' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
                  )}
                >
                  <LayoutGrid size={16} />
                </button>
                <button 
                  onClick={() => setViewMode('timeline')}
                  className={cn(
                    "p-2 transition-all",
                    viewMode === 'timeline' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
                  )}
                >
                  <Calendar size={16} />
                </button>
              </div>
            </div>
          </div>
          <div className="relative group">
            <button 
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center space-x-2 bg-[#D4AF37] text-black px-6 py-3 font-bold uppercase tracking-widest text-xs hover:scale-105 transition-transform"
            >
              <Plus size={18} />
              <span>Contribute</span>
            </button>
            <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-64 p-4 bg-black border border-[#D4AF37] text-white text-[10px] uppercase tracking-[0.2em] leading-relaxed opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-300 pointer-events-none z-50 text-center shadow-[0_0_30px_rgba(212,175,55,0.2)]">
              <div className="flex justify-center mb-2">
                <Sparkles className="text-[#D4AF37]" size={16} />
              </div>
              <p className="font-black mb-2 text-[#D4AF37]">Preserve Your Legacy</p>
              <p className="text-white/60 normal-case tracking-normal text-[11px]">Upload your photos and videos to immortalize your journey. Your contributions are vital to building the collective memory of the Class of 2026.</p>
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-[8px] border-transparent border-t-[#D4AF37]" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row items-center gap-4 mb-12">
          <div className="relative flex-1 group w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-[#D4AF37] transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Search by caption, name, or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-none py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-[#D4AF37]/50 focus:bg-white/10 transition-all uppercase text-[10px] tracking-widest"
            />
          </div>
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar w-full md:w-auto">
            {FACULTIES.map(f => (
              <button
                key={`faculty-filter-${f}`}
                onClick={() => setFilter(f)}
                className={cn(
                  "whitespace-nowrap px-4 py-2 text-[10px] uppercase tracking-widest border transition-all font-bold",
                  filter === f 
                    ? "bg-[#D4AF37] border-[#D4AF37] text-black" 
                    : "bg-transparent border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Select Tags and People Refining Filter Panel */}
        <div className="bg-[#0D0D0D] border border-white/5 p-5 md:p-6 mb-12 text-left shadow-[inset_0_0_20px_rgba(215,175,55,0.03)] rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 border-b border-white/5 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles size={14} className="text-[#D4AF37] animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.25em] font-black text-white">
                Filter Refinement Console
              </span>
            </div>
            {(selectedTags.length > 0 || selectedPeople.length > 0) && (
              <button 
                onClick={() => {
                  setSelectedTags([]);
                  setSelectedPeople([]);
                }}
                className="self-start sm:self-auto text-[9px] uppercase tracking-wider font-bold text-red-500 hover:text-red-400 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-3 py-1.5 transition-colors cursor-pointer"
              >
                <X size={10} />
                <span>Clear Refinements ({selectedTags.length + selectedPeople.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Tag Selection section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-2">
                  <span>Filter by Tags</span>
                </h3>
                {selectedTags.length > 0 && (
                  <span className="text-[9px] font-black text-[#D4AF37] uppercase tracking-wider bg-[#D4AF37]/10 px-1.5 py-0.5 rounded-sm">
                    {selectedTags.length} SELECTED
                  </span>
                )}
              </div>
              {allAvailableTags.length === 0 ? (
                <p className="text-[9px] text-white/20 uppercase tracking-widest italic font-medium py-2">No tags detected in legacy archive</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar py-1">
                  {allAvailableTags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={`tag-chip-${tag}`}
                        onClick={() => {
                          setSelectedTags(prev => 
                            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                          );
                        }}
                        className={cn(
                          "px-2.5 py-1 text-[9px] uppercase tracking-wider border transition-all font-bold flex items-center gap-1 cursor-pointer",
                          isSelected 
                            ? "bg-[#D4AF37] border-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.15)]" 
                            : "bg-white/5 border-white/5 text-white/40 hover:text-white hover:border-white/20"
                        )}
                      >
                        {isSelected && <Check size={8} className="stroke-[3]" />}
                        <span>#{tag}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* People Selection section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-wider text-white/40 font-bold flex items-center gap-2">
                  <span>Filter by People</span>
                </h3>
                {selectedPeople.length > 0 && (
                  <span className="text-[9px] font-black text-[#D4AF37] uppercase tracking-wider bg-[#D4AF37]/10 px-1.5 py-0.5 rounded-sm">
                    {selectedPeople.length} SELECTED
                  </span>
                )}
              </div>
              {allAvailablePeople.length === 0 ? (
                <p className="text-[9px] text-white/20 uppercase tracking-widest italic font-medium py-2">No tagged people detected in legacy archive</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar py-1">
                  {allAvailablePeople.map(person => {
                    const isSelected = selectedPeople.includes(person);
                    return (
                      <button
                        key={`person-chip-${person}`}
                        onClick={() => {
                          setSelectedPeople(prev => 
                            prev.includes(person) ? prev.filter(p => p !== person) : [...prev, person]
                          );
                        }}
                        className={cn(
                          "px-2.5 py-1 text-[9px] uppercase tracking-wider border transition-all font-bold flex items-center gap-1 cursor-pointer",
                          isSelected 
                            ? "bg-[#D4AF37] border-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.15)]" 
                            : "bg-white/5 border-white/5 text-white/40 hover:text-white hover:border-white/20"
                        )}
                      >
                        {isSelected && <Check size={8} className="stroke-[3]" />}
                        <span>{person}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Grid / Timeline View */}
        {isLoading ? (
          <div className="py-40 flex items-center justify-center">
            <Loader2 className="animate-spin text-[#D4AF37]" size={48} />
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05
                }
              }
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          >
            <AnimatePresence mode="popLayout">
              {!filteredMemories.length ? (
                <div key="no-results" className="col-span-full py-20 text-center">
                  <p className="text-white/20 uppercase tracking-[0.3em] font-black text-xl">No memories found in this realm</p>
                </div>
              ) : filteredMemories.map((memory, index) => (
                <motion.div
                  layout
                  variants={{
                    hidden: { opacity: 0, y: 20, scale: 0.95 },
                    show: { opacity: 1, y: 0, scale: 1 }
                  }}
                  initial="hidden"
                  animate="show"
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
                  key={`memory-grid-${memory.id || index}-${index}`}
                  className="group relative aspect-square bg-[#0A0A0A] overflow-hidden border border-white/5 cursor-pointer"
                  onClick={() => setSelectedImageForView(memory)}
                >
                {memory.type === 'image' ? (
                  <ProgressiveImage 
                    src={memory.url} 
                    thumbnail={memory.thumbnailUrl}
                    alt={memory.caption}
                    className="w-full h-full"
                    imgClassName="opacity-80 group-hover:opacity-100 group-hover:scale-110"
                  />
                ) : (
                  <div className="relative w-full h-full bg-[#0A0A0A] overflow-hidden">
                    {memory.thumbnailUrl ? (
                      <img
                        src={memory.thumbnailUrl}
                        alt={memory.caption}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={memory.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        autoPlay
                        loop
                        preload="metadata"
                      />
                    )}
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <Play size={32} className="text-[#D4AF37]" />
                    </div>
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black via-black/50 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                  <p className="text-white text-sm font-medium mb-2 line-clamp-2">{memory.caption}</p>
                  
                  {memory.taggedPeople && memory.taggedPeople.length > 0 && (
                    <div className="flex items-center space-x-2 mb-2 opacity-70">
                      <Users size={12} className="text-[#D4AF37]" />
                      <p className="text-[9px] text-white/80 uppercase tracking-widest font-bold truncate">
                        {memory.taggedPeople.join(', ')}
                      </p>
                    </div>
                  )}

                  {memory.tags && memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4 opacity-80">
                      {memory.tags.map((tg: string) => (
                        <span 
                          key={`memory-card-tg-${tg}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTags(prev => 
                              prev.includes(tg) ? prev.filter(t => t !== tg) : [...prev, tg]
                            );
                          }}
                          className={cn(
                            "px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border rounded-sm transition-all cursor-pointer",
                            selectedTags.includes(tg) 
                              ? "bg-[#D4AF37] border-[#D4AF37] text-black" 
                              : "bg-white/5 border-white/5 text-white/60 hover:border-[#D4AF37]/40 hover:text-white"
                          )}
                        >
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        disabled={processingLikes.has(memory.id)}
                        onClick={() => handleLike(memory.id)}
                        className="flex items-center space-x-1.5 text-white/60 hover:text-[#D4AF37] transition-colors disabled:opacity-50"
                      >
                        {processingLikes.has(memory.id) ? (
                          <Loader2 size={16} className="animate-spin text-[#D4AF37]" />
                        ) : (
                          <Heart size={16} />
                        )}
                        <span className="text-xs font-bold">{memory.likesCount}</span>
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMemoryForComments(memory);
                        }}
                        className="flex items-center space-x-1.5 text-white/60 hover:text-[#D4AF37] transition-colors"
                      >
                        <MessageCircle size={16} />
                        <span className="text-xs font-bold">{memory.commentsCount}</span>
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(memory);
                        }}
                        className="flex items-center space-x-1.5 text-white/60 hover:text-[#D4AF37] transition-colors"
                      >
                        <Share2 size={16} />
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        disabled={processingDeletions.has(memory.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRequestDeletion(memory);
                        }}
                        className="flex items-center space-x-1.5 text-white/60 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Request Deletion / Report"
                      >
                        {processingDeletions.has(memory.id) ? (
                          <Loader2 size={14} className="animate-spin text-red-500" />
                        ) : (
                          <Flag size={14} />
                        )}
                      </motion.button>
                    </div>
                    <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{memory.faculty}</span>
                  </div>
                </div>

                {/* Author Badge */}
                <div className="absolute top-4 left-4 flex items-center space-x-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded-sm border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px] text-white/80 font-bold uppercase tracking-tighter">By {memory.authorName}</span>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="space-y-12">
            <AnimatePresence mode="popLayout">
              {!formattedTimeline.length ? (
                <div key="no-timeline" className="py-20 text-center">
                   <p className="text-white/20 uppercase tracking-[0.3em] font-black text-xl">The timeline is empty</p>
                </div>
              ) : formattedTimeline.map(([monthYear, items]) => (
                <motion.div 
                  key={`timeline-group-${monthYear}`} 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="space-y-6"
                >
                  <div className="flex items-center space-x-4">
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter">{monthYear}</h3>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {items.map((memory, index) => (
                      <motion.div
                        key={`timeline-item-${memory.id || index}-${index}`}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        className="group flex space-x-4 items-start"
                      >
                      <div className="flex-shrink-0 w-24 h-24 bg-white/5 border border-white/10 overflow-hidden relative">
                        {memory.type === 'image' ? (
                          <ProgressiveImage 
                            src={memory.url} 
                            thumbnail={memory.thumbnailUrl}
                            alt={memory.caption}
                            className="w-full h-full"
                            imgClassName="group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Play size={12} className="text-white/20" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[8px] font-black text-[#D4AF37] uppercase tracking-widest">{memory.authorName}</span>
                          <span className="text-[8px] text-white/30 uppercase tracking-widest">{memory.faculty}</span>
                        </div>
                        <p className="text-white/80 text-xs font-medium line-clamp-2 mb-2">{memory.caption}</p>
                        
                        {memory.taggedPeople && memory.taggedPeople.length > 0 && (
                          <p className="text-[8px] text-white/50 uppercase tracking-widest font-bold mb-1 truncate text-left">
                            Members: {memory.taggedPeople.join(', ')}
                          </p>
                        )}
                        
                        {memory.tags && memory.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {memory.tags.map((tg: string) => (
                              <span 
                                key={`timeline-card-tg-${tg}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTags(prev => 
                                    prev.includes(tg) ? prev.filter(t => t !== tg) : [...prev, tg]
                                  );
                                }}
                                className={cn(
                                  "px-1 py-0.5 text-[7px] font-black uppercase tracking-wider border rounded-sm transition-all cursor-pointer",
                                  selectedTags.includes(tg) 
                                    ? "bg-[#D4AF37] border-[#D4AF37] text-black" 
                                    : "bg-white/5 border-white/5 text-white/40 hover:border-[#D4AF37]/40 hover:text-white"
                                )}
                              >
                                #{tg}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center space-x-3">
                          <button 
                            disabled={processingLikes.has(memory.id)}
                            onClick={() => handleLike(memory.id)} 
                            className="flex items-center space-x-1 text-white/40 hover:text-[#D4AF37] transition-colors disabled:opacity-50"
                          >
                            {processingLikes.has(memory.id) ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : (
                              <Heart size={10} />
                            )}
                            <span className="text-[9px]">{memory.likesCount}</span>
                          </button>
                          <button 
                            onClick={() => setSelectedMemoryForComments(memory)}
                            className="flex items-center space-x-1 text-white/40 hover:text-[#D4AF37] transition-colors"
                          >
                            <MessageCircle size={10} />
                            <span className="text-[9px]">{memory.commentsCount}</span>
                          </button>
                          <button 
                            onClick={() => handleShare(memory)}
                            className="flex items-center space-x-1 text-white/40 hover:text-[#D4AF37] transition-colors"
                          >
                            <Share2 size={10} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Infinite Scroll sentinel & loading indicator */}
        {hasMore && !isLoading && !search && (
          <div ref={sentinelRef} className="mt-16 flex justify-center py-8">
            <div className="flex flex-col items-center space-y-4 text-white/40">
              <span className="text-[10px] font-black uppercase tracking-[0.4em]">
                {isLoadingMore ? 'Opening the Vault...' : 'Scroll for more memories'}
              </span>
              <motion.div
                animate={isLoadingMore ? { y: [0, 10, 0] } : { y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className={cn(
                  "p-3 border rounded-full transition-colors",
                  isLoadingMore ? "border-[#D4AF37] text-[#D4AF37]" : "border-white/10"
                )}
              >
                {isLoadingMore ? <Loader2 size={20} className="animate-spin" /> : <ChevronDown size={20} />}
              </motion.div>
            </div>
          </div>
        )}

        {!isLoading && filteredMemories.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-white/20 uppercase tracking-[0.3em] font-black text-xl">No memories found in this realm</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeUpload}
              className="absolute inset-0 bg-[#050505]/95 backdrop-blur-xl" 
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0A0A0A] border border-white/10 p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <button 
                onClick={closeUpload}
                className="absolute top-4 right-4 text-white/40 hover:text-white"
              >
                <X size={24} />
              </button>

              <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-8">Contribute to the Legacy</h2>
              
              <form onSubmit={handleUpload} className="space-y-6">
                {/* Image Placeholder / Upload Zone */}
                <div className="relative">
                  <input 
                    type="file" 
                    multiple
                    accept="image/*,video/*,.png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.tiff,.svg,.heic,.heif,.mp4,.mov,.webm,.ogg,.m4v,.avi,.mkv,.flv,.3gp,.wmv,.ts"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                    <div className={cn(
                    "min-h-[200px] bg-white/5 border-2 border-dashed flex flex-col items-center justify-center hover:border-[#D4AF37]/50 hover:bg-white/[0.07] transition-all group p-6",
                    files.length > 0 ? "border-[#D4AF37]/50" : fileError ? "border-red-500/50" : "border-white/10"
                  )}>
                    {files.length > 0 ? (
                      <div className="w-full">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                          {files.map((f, i) => (
                            <div key={`upload-thumb-${f.name}-${f.size}-${i}`}>
                              <FileThumbnail file={f} onRemove={() => removeFile(i)} />
                            </div>
                          ))}
                          <div className="relative aspect-square border border-dashed border-white/10 flex flex-col items-center justify-center hover:border-[#D4AF37] transition-colors group/add cursor-pointer">
                            <Plus size={24} className="text-white/10 group-hover/add:text-[#D4AF37] transition-colors" />
                            <span className="text-[8px] text-white/10 uppercase tracking-widest mt-2 group-hover/add:text-[#D4AF37]">Add More</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-center space-y-1">
                          <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.4em]">{files.length} Memories Selected</p>
                          <p className="text-[8px] text-white/30 uppercase tracking-widest">Selected files are ready for preservation</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={cn(
                          "w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#D4AF37] group-hover:text-black transition-colors",
                          fileError && "bg-red-500/10 text-red-500"
                        )}>
                          <Upload size={20} />
                        </div>
                        <div className="text-center px-4">
                          <p className="text-sm font-bold text-white uppercase tracking-widest mb-1">
                            {fileError ? "Upload Error" : "Drop Memories or Click"}
                          </p>
                          <p className={cn(
                            "text-[10px] uppercase tracking-[0.2em]",
                            fileError ? "text-red-500" : "text-white/30"
                          )}>
                            {fileError || "Multiple images or videos up to 50MB each"}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={formData.authorName}
                      onChange={(e) => setFormData({...formData, authorName: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                      placeholder="e.g. Ibrahim Kosai" 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Faculty</label>
                    <select 
                      value={formData.faculty}
                      onChange={(e) => setFormData({...formData, faculty: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white"
                    >
                      {FACULTIES.filter(f => f !== 'All').map(f => <option key={`faculty-option-${f}`} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Caption / Story</label>
                  <textarea 
                    rows={3} 
                    required
                    value={formData.caption}
                    onChange={(e) => setFormData({...formData, caption: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                    placeholder="Tell the story behind this moment..."
                  ></textarea>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Tags (Separated by commas)</label>
                    <button 
                      type="button"
                      disabled={isAnalyzing || isUploading || files.length === 0}
                      onClick={handleAISuggest}
                      className="text-[9px] text-[#D4AF37] hover:text-white uppercase tracking-widest font-black flex items-center space-x-1 disabled:opacity-50"
                    >
                      {isAnalyzing ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      <span>{isAnalyzing ? 'Analyzing Media...' : 'AI Suggest'}</span>
                    </button>
                  </div>
                  <input 
                    type="text" 
                    value={formData.tags}
                    onChange={(e) => setFormData({...formData, tags: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                    placeholder="matric, finals, vibes" 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">People Tagged (AI can help identify)</label>
                  <input 
                    type="text" 
                    value={formData.people}
                    onChange={(e) => setFormData({...formData, people: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                    placeholder="e.g. Ibrahim, Sarah, The Dean" 
                  />
                </div>

                <div className="space-y-1.5 pt-4">
                  <button 
                    disabled={isUploading || files.length === 0}
                    className="w-full bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 text-xs hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                    type="submit"
                  >
                    {isUploading ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}
                    <span>{isUploading ? 'Securing for Future...' : 'Submit Memories'}</span>
                  </button>
                  
                  {isUploading && (
                    <div className="space-y-4 pt-4 border-t border-white/10">
                      {/* Overall Progress */}
                      <div className="space-y-2 text-left">
                        <div className="flex justify-between items-center text-[10px] uppercase tracking-[0.2em] font-black text-[#D4AF37]">
                          <span>{isCompressing ? 'Optimizing Media...' : 'Overall Preservation'}</span>
                          <span>{Math.round(uploadProgress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-white/5 overflow-hidden rounded-full">
                          <motion.div 
                            className="h-full bg-[#D4AF37]"
                            initial={{ width: 0 }}
                            animate={{ width: isCompressing ? '5%' : `${uploadProgress}%` }}
                            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                          />
                        </div>
                      </div>

                      {/* Individual File Feed */}
                      <div className="space-y-3 bg-white/[0.02] border border-white/5 p-4 rounded-sm max-h-[160px] overflow-y-auto custom-scrollbar">
                        <p className="text-[8px] uppercase tracking-[0.2em] font-black text-white/40 text-left mb-1">Upload Queue</p>
                        {Object.entries(fileProgresses).map(([fileName, statusInfo]) => {
                          const info = statusInfo as { progress: number, status: 'pending' | 'compressing' | 'uploading' | 'completed' | 'failed' };
                          const isComp = info.status === 'compressing';
                          const isUpload = info.status === 'uploading';
                          const isDone = info.status === 'completed';
                          const isFail = info.status === 'failed';
                          
                          let statusText = 'Enqueued';
                          let statusColor = 'text-white/35';
                          let barColor = 'bg-white/10';
                          
                          if (isComp) {
                            statusText = 'Optimizing...';
                            statusColor = 'text-[#D4AF37]/80 animate-pulse';
                            barColor = 'bg-[#D4AF37]/50';
                          } else if (isUpload) {
                            statusText = `Uploading (${info.progress}%)`;
                            statusColor = 'text-[#D4AF37] font-bold';
                            barColor = 'bg-[#D4AF37]';
                          } else if (isDone) {
                            statusText = 'Preserved!';
                            statusColor = 'text-green-500 font-bold';
                            barColor = 'bg-green-500';
                          } else if (isFail) {
                            statusText = 'Failed';
                            statusColor = 'text-red-500 font-bold';
                            barColor = 'bg-red-500';
                          }

                          return (
                            <div key={`file-status-${fileName}`} className="space-y-1 text-left">
                              <div className="flex justify-between items-center text-[9px]">
                                <span className="text-white/60 font-medium truncate max-w-[70%] tracking-wide">
                                  {fileName}
                                </span>
                                <span className={cn("tracking-widest uppercase text-[8px]", statusColor)}>
                                  {statusText}
                                </span>
                              </div>
                              <div className="h-1 w-full bg-white/5 overflow-hidden rounded-full">
                                <motion.div 
                                  className={cn("h-full", barColor)}
                                  initial={{ width: 0 }}
                                  animate={{ 
                                    width: isComp ? '15%' : (isDone ? '100%' : (isFail ? '100%' : `${info.progress}%`)) 
                                  }}
                                  transition={{ duration: 0.2 }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Comments Modal */}
      <AnimatePresence>
        {selectedMemoryForComments && (
          <div className="fixed inset-0 z-[110] flex items-center justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMemoryForComments(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md" 
            />
            
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-[#0A0A0A] border-l border-white/10 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-white font-black uppercase tracking-tighter text-lg">Conversation</h3>
                  <p className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-widest">Shared by {selectedMemoryForComments.authorName}</p>
                </div>
                <button 
                  onClick={() => setSelectedMemoryForComments(null)}
                  className="text-white/40 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Memory Preview */}
                <div className="aspect-video bg-white/5 border border-white/10 overflow-hidden mb-8">
                  {selectedMemoryForComments.type === 'image' ? (
                    <img 
                      src={selectedMemoryForComments.url} 
                      className="w-full h-full object-cover opacity-60" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Play size={24} className="text-white/20" />
                    </div>
                  )}
                </div>

                <div className="space-y-6 pb-20">
                  {comments.length === 0 ? (
                    <div className="text-center py-10">
                      <MessageCircle size={32} className="mx-auto text-white/10 mb-4" />
                      <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">No messages yet. Be the first to share your thoughts.</p>
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <motion.div 
                        key={comment.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">{comment.authorName}</span>
                          <span className="text-[8px] text-white/20 uppercase">
                            {comment.createdAt?.toDate().toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-white/80 text-sm leading-relaxed">{comment.text}</p>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-6 border-t border-white/10 bg-[#0A0A0A]">
                <form onSubmit={handleCommentSubmit} className="space-y-4">
                  <textarea 
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Contribute to the conversation..."
                    className="w-full bg-white/5 border border-white/10 p-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50 focus:bg-white/10 min-h-[100px] resize-none"
                  />
                  <button 
                    disabled={isSubmittingComment || !newComment.trim()}
                    type="submit"
                    className="w-full bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 text-[10px] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:grayscale flex items-center justify-center space-x-2"
                  >
                    {isSubmittingComment && <Loader2 size={12} className="animate-spin" />}
                    <span>{isSubmittingComment ? 'Sending Message...' : 'Post Contribution'}</span>
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Lightbox Modal */}
      <AnimatePresence>
        {selectedImageForView && (
          <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedImageForView(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-sm" 
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="group relative w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              {/* Close Button */}
              <button 
                onClick={() => setSelectedImageForView(null)}
                className="absolute top-4 right-4 z-10 text-white/60 hover:text-white transition-colors"
              >
                <X size={32} />
              </button>

              {/* Navigation Buttons */}
              <button
                onClick={handlePreviousImage}
                disabled={filteredMemories.indexOf(selectedImageForView) === 0}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white disabled:opacity-30 transition-all"
              >
                <ChevronDown size={32} className="rotate-90" />
              </button>
              <button
                onClick={handleNextImage}
                disabled={filteredMemories.indexOf(selectedImageForView) === filteredMemories.length - 1}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/60 hover:text-white disabled:opacity-30 transition-all"
              >
                <ChevronDown size={32} className="-rotate-90" />
              </button>

              <div className="absolute top-20 right-4 z-20 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200">
                <div className="rounded-3xl bg-black/70 border border-white/10 p-2 flex items-center gap-2 shadow-2xl backdrop-blur-xl">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={processingLikes.has(selectedImageForView.id)}
                    onClick={() => handleLike(selectedImageForView.id)}
                    className="flex items-center gap-1 rounded-full px-3 py-2 text-white/70 hover:text-[#D4AF37] transition-colors disabled:opacity-50"
                  >
                    {processingLikes.has(selectedImageForView.id) ? (
                      <Loader2 size={16} className="animate-spin text-[#D4AF37]" />
                    ) : (
                      <Heart size={16} />
                    )}
                    <span className="text-[11px] font-semibold">{selectedImageForView.likesCount}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedMemoryForComments(selectedImageForView)}
                    className="flex items-center gap-1 rounded-full px-3 py-2 text-white/70 hover:text-[#D4AF37] transition-colors"
                  >
                    <MessageCircle size={16} />
                    <span className="text-[11px] font-semibold">{selectedImageForView.commentsCount}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleShare(selectedImageForView)}
                    className="rounded-full p-2 text-white/70 hover:text-[#D4AF37] transition-colors"
                    title="Share"
                  >
                    <Share2 size={18} />
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    disabled={isDownloading}
                    onClick={() => handleDownload(selectedImageForView)}
                    className="rounded-full p-2 text-white/70 hover:text-[#D4AF37] transition-colors disabled:opacity-50"
                    title="Download"
                  >
                    {isDownloading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Media Display */}
              <div className="flex-1 min-h-[60vh] bg-black/90 flex items-center justify-center overflow-hidden">
                {selectedImageForView.type === 'image' ? (
                  <img 
                    src={selectedImageForView.url} 
                    alt={selectedImageForView.caption}
                    className="max-w-full max-h-[80vh] object-contain"
                  />
                ) : (
                  <video 
                    src={selectedImageForView.url}
                    className="max-w-full max-h-[80vh] object-contain"
                    controls
                    autoPlay
                  />
                )}
              </div>

              <div className="px-6 py-4 border-t border-white/10 bg-black/10 text-white/80">
                <p className="text-sm font-medium mb-2">{selectedImageForView.caption}</p>
                <div className="flex flex-wrap gap-2 text-[10px] text-white/40 uppercase tracking-widest">
                  <span>By {selectedImageForView.authorName}</span>
                  <span>•</span>
                  <span>{selectedImageForView.faculty}</span>
                  <span>•</span>
                  <span>{filteredMemories.indexOf(selectedImageForView) + 1} / {filteredMemories.length}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Deletion Request Modal */}
      <AnimatePresence>
        {requestDeletionMemory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setRequestDeletionMemory(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 p-8 shadow-2xl"
            >
              <h2 className="text-xl font-black text-white uppercase tracking-tighter mb-4">Report Content</h2>
              <p className="text-[10px] text-white/40 uppercase tracking-widest mb-6">Requesting removal of memory from {requestDeletionMemory.authorName}</p>
              
              <form onSubmit={handleRequestDeletionSubmit} className="space-y-6">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Reason for Removal</label>
                  <textarea 
                    value={deletionReason}
                    onChange={(e) => setDeletionReason(e.target.value)}
                    required
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 p-4 text-sm text-white focus:outline-none focus:border-[#D4AF37]/50"
                    placeholder="e.g. Inappropriate content, Privacy violation, Incorrect details..."
                  />
                </div>
                <div className="flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setRequestDeletionMemory(null)}
                    className="flex-1 border border-white/10 py-3 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={processingDeletions.has(requestDeletionMemory.id)}
                    className="flex-1 bg-red-500 text-white py-3 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 disabled:opacity-50"
                  >
                    {processingDeletions.has(requestDeletionMemory.id) ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {authMode && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchParams(new URLSearchParams())}
              className="absolute inset-0 bg-[#050505]/95 backdrop-blur-xl" 
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <button 
                onClick={() => setSearchParams(new URLSearchParams())}
                className="absolute top-4 right-4 text-white/40 hover:text-white"
              >
                <X size={24} />
              </button>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">
                  {authMode === 'login' ? 'Welcome Back' : 'Join the Class'}
                </h2>
                <p className="text-[10px] text-white/30 uppercase tracking-widest">Identify yourself to access the archive</p>
              </div>
              
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                {authMode === 'register' && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em] block text-left">Full Name</label>
                      <input 
                        type="text" 
                        required
                        value={authFormData.full_name}
                        onChange={(e) => setAuthFormData({...authFormData, full_name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                        placeholder="e.g. Ibrahim Kosai" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em] block text-left">Username</label>
                      <input 
                        type="text" 
                        required
                        value={authFormData.username}
                        onChange={(e) => setAuthFormData({...authFormData, username: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                        placeholder="e.g. ibrahim26" 
                      />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em] block text-left">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={authFormData.email}
                    onChange={(e) => setAuthFormData({...authFormData, email: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                    placeholder="email@example.com" 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em] block text-left">Password</label>
                  <input 
                    type="password" 
                    required
                    value={authFormData.password}
                    onChange={(e) => setAuthFormData({...authFormData, password: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                    placeholder="••••••••" 
                  />
                </div>
                
                {authError && (
                  <p className="text-red-500 text-[10px] uppercase tracking-widest font-bold text-center">{authError}</p>
                )}

                <button 
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full bg-[#D4AF37] text-black py-4 font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 mt-6"
                >
                  {isAuthLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      <LogIn size={14} />
                      <span>{authMode === 'login' ? 'Authenticate' : 'Complete Registration'}</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={async () => {
                    try {
                      const { url } = await authService.getGoogleAuthUrl();
                      window.location.href = url;
                    } catch (err) {
                      console.error('Failed to get Google Auth URL', err);
                    }
                  }}
                  type="button"
                  className="w-full bg-white text-black py-4 font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span>{authMode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}</span>
                </button>
              </div>

              <div className="mt-8 pt-8 border-t border-white/10 text-center">
                 <p className="text-[10px] text-white/30 uppercase tracking-widest mb-4">
                   {authMode === 'login' ? "Don't have an identity yet?" : "Already part of the class?"}
                 </p>
                 <button 
                  onClick={() => setSearchParams({ auth: authMode === 'login' ? 'register' : 'login' })}
                  className="text-[#D4AF37] text-[10px] uppercase tracking-widest font-black hover:underline"
                 >
                   {authMode === 'login' ? 'Request Access' : 'Authenticate Identity'}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Notifications */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            key="global-notification-toast"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 right-8 z-[200] px-6 py-4 shadow-2xl flex items-center space-x-3",
              activeNotification.type === 'success' ? "bg-[#D4AF37] text-black" : "bg-red-500 text-white"
            )}
          >
            {activeNotification.type === 'success' ? <Check size={18} /> : <X size={18} />}
            <span className="text-[10px] font-black uppercase tracking-widest">{activeNotification.message}</span>
            <button onClick={() => setActiveNotification(null)} className="ml-4 opacity-50 hover:opacity-100">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
