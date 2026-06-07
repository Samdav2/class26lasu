import { useState, useEffect, useMemo } from 'react';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Check, X, Trash2, BarChart3, Users, Image as ImageIcon, MessageSquare, ExternalLink, Loader2, Flag, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../services/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc, getDocs, limit, collectionGroup } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface PendingMemory {
  id: string;
  url: string;
  authorName: string;
  faculty: string;
  caption: string;
  createdAt: any;
}

interface DeletionRequest {
  id: string;
  memoryId: string;
  memoryUrl: string;
  memoryCaption: string;
  authorName: string;
  reason: string;
  requestedAt: any;
  status: string;
}

interface AdminComment {
  id: string;
  memoryId: string;
  text: string;
  authorName: string;
  createdAt: any;
}

import { adminService, memoryService, authService } from '../lib/api-client';
import { useAuthStore } from '../stores/authStore';

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'moderation' | 'requests' | 'content' | 'analytics' | 'comments' | 'users' | 'logs'>('moderation');
  const { user, isAuthenticated, login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingMemories, setPendingMemories] = useState<PendingMemory[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [allMemories, setAllMemories] = useState<any[]>([]);
  const [allComments, setAllComments] = useState<AdminComment[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorNotification, setErrorNotification] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    contributors: 0,
    approved: 0
  });

  const isAdmin = isAuthenticated && user?.role === 'admin';

  useEffect(() => {
    const handlePopupAuthMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'OAUTH_AUTH_SUCCESS') {
        const { token, user: activeProfile } = event.data;
        useAuthStore.getState().loginWithGoogle(token, activeProfile);
      }
    };
    window.addEventListener('message', handlePopupAuthMessage);
    return () => window.removeEventListener('message', handlePopupAuthMessage);
  }, []);

  useEffect(() => {
    if (errorNotification) {
      const timer = setTimeout(() => setErrorNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorNotification]);

  useEffect(() => {
    if (!isAdmin) return;
    loadAdminData();
  }, [isAdmin, activeTab]);

  const loadAdminData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'moderation') {
        const data = await adminService.getPendingMemories();
        setPendingMemories(data.map((m: any) => {
          console.log(`[Admin] Loading pending memory ID: ${m.id}`);
          return {
            id: m.id.toString(),
            url: m.media_url,
            authorName: m.uploader_name || 'Anonymous',
            faculty: m.faculty || 'General',
            caption: m.description || '',
            createdAt: { toDate: () => new Date(m.created_at) }
          };
        }));
      } else if (activeTab === 'requests') {
        try {
          if (db) {
            const snap = await getDocs(query(collection(db, 'deletion_requests'), orderBy('requestedAt', 'desc')));
            const requestsList = snap.docs.map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                memoryId: data.memoryId || '',
                memoryUrl: data.memoryUrl || '',
                memoryCaption: data.memoryCaption || '',
                authorName: data.authorName || '',
                reason: data.reason || '',
                requestedAt: data.requestedAt ? (typeof data.requestedAt.toDate === 'function' ? data.requestedAt : { toDate: () => new Date(data.requestedAt) }) : { toDate: () => new Date() },
                status: data.status || 'pending'
              };
            });
            setDeletionRequests(requestsList.filter(r => r.status === 'pending'));
          } else {
            const data = await adminService.getDeletionRequests();
            setDeletionRequests(data || []);
          }
        } catch (reqErr) {
          console.warn("Deletion requests fallback load error, using REST API", reqErr);
          try {
            const data = await adminService.getDeletionRequests();
            setDeletionRequests(data || []);
          } catch (rErr) {
            console.error("Deletion requests ultimate fallback failed", rErr);
            setDeletionRequests([]);
          }
        }
      } else if (activeTab === 'content') {
        const approvedResponse = await memoryService.getMemories({ limit: 1000 });
        const pendingResponse = await adminService.getPendingMemories();
        const approvedData = Array.isArray(approvedResponse) ? approvedResponse : [];
        const pendingData = Array.isArray(pendingResponse) ? pendingResponse : [];
        const combined = [
          ...approvedData.map((m: any) => ({ ...m, approved: true })),
          ...pendingData.map((m: any) => ({ ...m, approved: false }))
        ];
        setAllMemories(combined.map((m: any) => ({
          id: m.id.toString(),
          url: m.media_url,
          authorName: m.uploader_name || 'Anonymous',
          faculty: m.faculty || 'General',
          caption: m.description || '',
          approved: m.approved,
          createdAt: { toDate: () => new Date(m.created_at) }
        })));
      } else if (activeTab === 'comments') {
        try {
          const commentsSnap = await getDocs(query(collectionGroup(db, 'comments'), orderBy('createdAt', 'desc'), limit(100)));
          const loadedComments = commentsSnap.docs.map(doc => {
            const data = doc.data();
            const memoryId = doc.ref.parent.parent?.id || "";
            return {
              id: doc.id,
              memoryId,
              text: data.text || "",
              authorName: data.authorName || "Anonymous",
              createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt : { toDate: () => new Date(data.createdAt) }) : { toDate: () => new Date() }
            };
          });
          setAllComments(loadedComments);
        } catch (comError) {
          console.error("Failed to query comments from collectionGroup doc snap:", comError);
          setAllComments([]);
        }
      } else if (activeTab === 'users') {
        try {
          const userList = await adminService.getAdminUsers();
          setAdminUsers(userList || []);
        } catch (uErr) {
          console.error("Failed to retrieve user accounts log:", uErr);
        }
      } else if (activeTab === 'logs' || activeTab === 'analytics') {
        try {
          const dashboardData = await adminService.getDashboardData();
          setActivityLogs(dashboardData.activityLogs || []);
          
          if (activeTab === 'analytics' && dashboardData.stats) {
            setStats({
              total: dashboardData.stats.totalMemories,
              contributors: dashboardData.stats.contributors,
              approved: dashboardData.stats.approved
            });
            
            if (dashboardData.chartData) {
              setAllMemories(dashboardData.chartData);
            }
          }
        } catch (dashErr) {
          console.error("Dashboard metrics aggregation failure:", dashErr);
        }
      }
    } catch (err) {
      console.error(err);
      setErrorNotification("Failed to load command center data.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteComment = async (memoryId: string, commentId: string) => {
    try {
      // In a real app we'd have a backend call here
      // await adminService.deleteComment(commentId);
      setAllComments(prev => prev.filter(c => c.id !== commentId));
    } catch (error) {
      setErrorNotification("Protocol failure: Message could not be redacted.");
    }
  };

  const handleProcessRequest = async (requestId: string, memoryId: string, action: 'delete' | 'dismiss') => {
    try {
      if (db) {
        try {
          if (action === 'delete') {
            await deleteDoc(doc(db, 'memories', memoryId));
          }
          await deleteDoc(doc(db, 'deletion_requests', requestId));
          console.log("[Admin] Deletion request processed successfully on Firestore.");
        } catch (fsErr: any) {
          console.warn("[Admin] Firestore processing failed, falling back to API", fsErr);
          try {
            handleFirestoreError(fsErr, OperationType.WRITE, 'deletion_requests');
          } catch (loggingErr) {
            console.error("[Admin] Standard Firestore logging error:", loggingErr);
          }
        }
      }
      
      try {
        await adminService.processDeletionRequest(requestId, action);
      } catch (apiErr) {
        console.warn("[Admin] Express backend api fall through failed:", apiErr);
      }
      
      setDeletionRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error("Decision recording error:", error);
      setErrorNotification("Protocol failure: Decision could not be recorded.");
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const data = await authService.getGoogleAuthUrl();
      if (!data?.url) {
        throw new Error("Failed to resolve Google Access Gateway endpoint.");
      }
      
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        data.url,
        'google_oauth_popup',
        `scrollbar=yes,status=yes,width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        // If the popup is blocked, fallback to a full-page redirect.
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error(err);
      setErrorNotification(err.message || "Failed to launch OAuth authorization sequence.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await adminService.approveMemory(parseInt(id));
      setPendingMemories(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      setErrorNotification("Approval failed");
    }
  };

  const handleReject = async (id: string) => {
    try {
      await adminService.deleteMemory(parseInt(id));
      setPendingMemories(prev => prev.filter(m => m.id !== id));
      setAllMemories(prev => prev.filter(m => m.id !== id));
    } catch (error) {
      setErrorNotification("Rejection failed");
    }
  };

  const handleLegacyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);
      await login(formData);
    } catch (err) {
      setErrorNotification("Unauthorized clearance level");
    }
  };

  const chartData = useMemo(() => {
    const facultyMap: Record<string, { faculty: string; total: number; approved: number }> = {};
    
    allMemories.forEach(m => {
      const faculty = m.faculty || 'Other';
      if (!facultyMap[faculty]) {
        facultyMap[faculty] = { faculty, total: 0, approved: 0 };
      }
      facultyMap[faculty].total++;
      if (m.approved) {
        facultyMap[faculty].approved++;
      }
    });

    return Object.values(facultyMap).sort((a, b) => b.total - a.total);
  }, [allMemories]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-40 px-4 flex items-center justify-center bg-[#050505]">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-[#0A0A0A] border border-white/10 p-10 shadow-2xl"
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/20">
              <Shield className="text-[#D4AF37]" size={32} />
            </div>
          </div>
          <h1 className="text-2xl font-black text-center text-white uppercase tracking-tighter mb-4">Guardian Access</h1>
          <p className="text-white/40 text-[10px] text-center uppercase tracking-widest mb-8">Authorised archivists only</p>
          
          <div className="space-y-4">
            <button 
              onClick={handleGoogleLogin}
              className="w-full bg-white text-black py-4 font-black text-[10px] uppercase tracking-widest hover:bg-[#D4AF37] transition-all flex items-center justify-center space-x-3 rounded-none"
            >
              <Users size={16} />
              <span>Sign in with Google</span>
            </button>

            <div className="flex items-center gap-4 py-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[8px] text-white/20 uppercase tracking-widest">or legacy entry</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <form className="space-y-6" onSubmit={handleLegacyLogin}>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Admin Identity</label>
              <input 
                type="email" 
                value={email}
                required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                placeholder="admin@lasu2026.com" 
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-[0.3em]">Security Token</label>
              <input 
                type="password" 
                value={password}
                required
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 p-4 text-sm focus:outline-none focus:border-[#D4AF37]/50 text-white" 
                placeholder="••••••••" 
              />
            </div>
            <button type="submit" className="w-full bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 text-xs transition-all hover:bg-white">
              Initialize Console
            </button>
            <p className="text-[9px] text-white/20 text-center uppercase tracking-widest">Authorized personnel only. Access is monitored and logged.</p>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-4 bg-[#050505] text-center">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        {errorNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] bg-red-500 text-white px-6 py-3 font-black text-[10px] uppercase tracking-widest shadow-2xl flex items-center space-x-3"
          >
            <Shield size={16} />
            <span>{errorNotification}</span>
            <button onClick={() => setErrorNotification(null)} className="ml-4 hover:opacity-50">
              <X size={14} />
            </button>
          </motion.div>
        )}
        <div className="flex flex-col md:flex-row items-center justify-between mb-12 gap-8 border-b border-white/5 pb-8">
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 rounded-full bg-[#D4AF37] text-black flex items-center justify-center overflow-hidden font-black">
              {user?.profile_picture ? (
                <img src={user.profile_picture} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                "AD"
              )}
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Command Center</h1>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Status: Operational / Clear Identity: {user?.email || 'Administrator'}</p>
            </div>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-none border border-white/10 flex-wrap gap-1">
            <button 
              onClick={() => setActiveTab('moderation')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'moderation' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <Shield size={14} />
              <span>Moderation</span>
            </button>
            <button 
              onClick={() => setActiveTab('requests')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'requests' ? "bg-red-500 text-white" : "text-white/40 hover:text-white"
              )}
            >
              <Flag size={14} />
              <span>Requests ({deletionRequests.length})</span>
            </button>
            <button 
              onClick={() => setActiveTab('content')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'content' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <ImageIcon size={14} />
              <span>Full Archive</span>
            </button>
            <button 
              onClick={() => setActiveTab('comments')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'comments' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <MessageSquare size={14} />
              <span>Comments</span>
            </button>
            <button 
              onClick={() => setActiveTab('analytics')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'analytics' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <BarChart3 size={14} />
              <span>Analytics</span>
            </button>
            <button 
              onClick={() => setActiveTab('users')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'users' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <Users size={14} />
              <span>Users</span>
            </button>
            <button 
              onClick={() => setActiveTab('logs')}
              className={cn(
                "flex items-center space-x-2 px-6 py-2 text-[10px] uppercase tracking-widest font-bold transition-all",
                activeTab === 'logs' ? "bg-[#D4AF37] text-black" : "text-white/40 hover:text-white"
              )}
            >
              <Shield size={14} />
              <span>Audit logs</span>
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'moderation' ? (
            <motion.div 
              key="moderation"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Pending Approval ({pendingMemories.length})</h2>
                <div className="flex items-center space-x-4">
                  <span className="text-[10px] text-white/30 uppercase tracking-widest flex items-center">
                    <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" /> Live moderation
                  </span>
                </div>
              </div>

              {isLoading ? (
                 <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-[#D4AF37]" size={32} /></div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <AnimatePresence mode="popLayout">
                    {!pendingMemories.length ? (
                      <div key="no-pending" className="py-20 text-center border border-dashed border-white/5">
                        <p className="text-white/20 uppercase tracking-widest text-sm">No items awaiting judgment</p>
                      </div>
                    ) : pendingMemories.map((item) => (
                      <motion.div 
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={`pending-${item.id}`} 
                        className="bg-[#0A0A0A] border border-white/10 p-6 flex flex-col md:flex-row items-center gap-8 group"
                      >
                    <div className="w-full md:w-48 aspect-square flex-shrink-0 overflow-hidden bg-white/5 border border-white/10">
                      <img src={item.url} alt="Pending" className="w-full h-full object-cover group-hover:scale-110 transition-all duration-700" referrerPolicy="no-referrer" />
                    </div>
                    
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-[#D4AF37] text-xs font-black uppercase tracking-widest">By {item.authorName}</span>
                          <span className="text-white/20 text-xs">•</span>
                          <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">{item.faculty}</span>
                        </div>
                        <span className="text-[10px] text-white/20 uppercase tracking-widest font-bold">Pending Preserve</span>
                      </div>
                      <p className="text-white font-medium italic">"{item.caption}"</p>
                    </div>

                    <div className="flex md:flex-col gap-2 w-full md:w-auto">
                      <button 
                        onClick={() => handleApprove(item.id)}
                        className="flex-1 md:w-32 bg-green-500/10 border border-green-500/20 text-green-500 py-3 px-4 flex items-center justify-center space-x-2 hover:bg-green-500 hover:text-black transition-all"
                      >
                        <Check size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Approve</span>
                      </button>
                      <button 
                        onClick={() => handleReject(item.id)}
                        className="flex-1 md:w-32 bg-red-500/10 border border-red-500/20 text-red-500 py-3 px-4 flex items-center justify-center space-x-2 hover:bg-red-500 hover:text-black transition-all"
                      >
                        <Trash2 size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Reject</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {pendingMemories.length === 0 && (
                <div className="py-20 text-center border border-dashed border-white/5">
                  <p className="text-white/20 uppercase tracking-widest text-sm">No items awaiting judgment</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      ) : activeTab === 'requests' ? (
        <motion.div 
          key="requests"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Deletion Requests ({deletionRequests.length})</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {!deletionRequests.length ? (
                <div key="no-deletion-requests" className="py-20 text-center border border-dashed border-white/5">
                  <p className="text-white/20 uppercase tracking-widest text-sm">Safe environment. No reports pending.</p>
                </div>
              ) : deletionRequests.map((request) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={`deletion-request-${request.id}`} 
                  className="bg-[#0A0A0A] border border-white/10 p-6 flex flex-col md:flex-row items-center gap-8 group"
                >
                  <div className="w-full md:w-32 aspect-square flex-shrink-0 overflow-hidden bg-white/5 border border-white/10">
                    <img src={request.memoryUrl} alt="Reported" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center space-x-3">
                      <span className="text-red-500 text-[10px] font-black uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded">High Priority</span>
                      <span className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Memory By: {request.authorName}</span>
                    </div>
                    <div className="bg-white/5 p-4 border-l-2 border-red-500">
                      <p className="text-white/60 text-[10px] uppercase tracking-widest mb-1 font-bold">Reason for Report:</p>
                      <p className="text-white italic text-sm">"{request.reason}"</p>
                    </div>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest italic">Target Caption: "{request.memoryCaption}"</p>
                  </div>

                  <div className="flex md:flex-col gap-2 w-full md:w-auto">
                    <button 
                      onClick={() => handleProcessRequest(request.id, request.memoryId, 'delete')}
                      className="flex-1 md:w-32 bg-red-500 text-white py-3 px-4 flex items-center justify-center space-x-2 hover:bg-red-600 transition-all"
                    >
                      <Trash2 size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Delete</span>
                    </button>
                    <button 
                      onClick={() => handleProcessRequest(request.id, request.memoryId, 'dismiss')}
                      className="flex-1 md:w-32 bg-white/5 border border-white/10 text-white/40 py-3 px-4 flex items-center justify-center space-x-2 hover:bg-white/10 hover:text-white transition-all"
                    >
                      <X size={16} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Dismiss</span>
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
              {deletionRequests.length === 0 && (
                <div className="py-20 text-center border border-dashed border-white/5">
                  <p className="text-white/20 uppercase tracking-widest text-sm">Safe environment. No reports pending.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : activeTab === 'content' ? (
          <motion.div 
            key="content"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
             <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Content Management</h2>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                <input 
                  type="text" 
                  placeholder="Search by caption or author..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 p-3 pl-10 text-[10px] uppercase tracking-widest text-white focus:outline-none focus:border-[#D4AF37]/50"
                />
              </div>
            </div>

            <motion.div 
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.02 }
                }
              }}
              className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4"
            >
              {allMemories && allMemories.length > 0 ? (
                allMemories
                .filter(m => 
                  m.caption?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  m.authorName?.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map((item) => (
                <motion.div 
                  variants={{
                    hidden: { opacity: 0, scale: 0.9 },
                    show: { opacity: 1, scale: 1 }
                  }}
                  key={`archive-content-${item.id}`} 
                  className="relative aspect-square group bg-[#0A0A0A] border border-white/5 overflow-hidden"
                >
                  <img src={item.url} alt="" className="w-full h-full object-cover opacity-50 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[8px] text-white/60 truncate">{item.caption}</p>
                    <p className="text-[8px] text-[#D4AF37] font-bold truncate">By {item.authorName}</p>
                  </div>
                  <button 
                    onClick={() => handleReject(item.id)}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-none opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                  {!item.approved && (
                    <div className="absolute top-2 left-2 bg-[#D4AF37] text-black text-[8px] font-black px-1.5 py-0.5 uppercase tracking-tighter">Pending</div>
                  )}
                </motion.div>
              ))
            ) : (
              <div key="all-archive-empty" className="col-span-full py-20 text-center border border-dashed border-white/5">
                <p className="text-white/20 uppercase tracking-widest text-sm">No content found in the archive</p>
              </div>
            )}
            </motion.div>
          </motion.div>
        ) : activeTab === 'comments' ? (
          <motion.div 
            key="comments"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Discussion Moderation</h2>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                <input 
                  type="text" 
                  placeholder="Filter comments..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 p-3 pl-10 text-[10px] uppercase tracking-widest text-white focus:outline-none focus:border-[#D4AF37]/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <AnimatePresence mode="popLayout">
                {allComments && allComments.length > 0 ? (
                  allComments
                    .filter(c => 
                      c.text?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      c.authorName?.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((comment) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      key={`admin-comment-${comment.id}`} 
                      className="bg-[#0A0A0A] border border-white/10 p-6 flex items-start gap-6 group"
                    >
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                      <MessageSquare className="text-[#D4AF37]" size={16} />
                    </div>
                    
                    <div className="flex-1 space-y-2 text-center">
                      <div className="flex flex-col items-center justify-center space-y-1">
                        <div className="flex items-center space-x-3">
                          <span className="text-[#D4AF37] text-xs font-black uppercase tracking-widest">{comment.authorName}</span>
                          <span className="text-white/20 text-xs">•</span>
                          <span className="text-white/40 text-[8px] uppercase tracking-widest font-bold">
                            In Memory #{comment.memoryId.slice(-6)}
                          </span>
                        </div>
                        <span className="text-[8px] text-white/20 uppercase tracking-widest font-bold">
                          {comment.createdAt?.toDate().toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-white font-medium text-sm border-l-2 border-white/5 pl-4 py-1 italic">
                        "{comment.text}"
                      </p>
                    </div>
  
                    <button 
                      onClick={() => handleDeleteComment(comment.memoryId, comment.id)}
                      className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-black transition-all"
                      title="Redact Comment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </motion.div>
                ))
              ) : (
                <div key="admin-comments-empty" className="py-20 text-center border border-dashed border-white/5">
                  <p className="text-white/20 uppercase tracking-widest text-sm">No discussions found in the archive</p>
                </div>
              )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : activeTab === 'analytics' ? (
          <motion.div 
            key="analytics"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {[
              { label: 'Total Uploads', value: stats.total, icon: ImageIcon, trend: 'All time' },
              { label: 'Active Contributors', value: stats.contributors, icon: Users, trend: 'Estimated' },
              { label: 'Approved Memories', value: stats.approved, icon: Check, trend: 'Public content' },
              { label: 'Storage Status', value: 'Nominal', icon: Shield, trend: 'Within limits' },
            ].map((metric, idx) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={`admin-metric-${metric.label}`} 
                className="bg-[#0A0A0A] border border-white/10 p-8 text-left"
              >
                <div className="flex items-center justify-between mb-8">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <metric.icon className="text-[#D4AF37]" size={20} />
                  </div>
                  <span className="text-[8px] text-[#D4AF37] font-bold uppercase tracking-widest">{metric.trend}</span>
                </div>
                <div className="text-3xl font-black text-white tracking-tighter mb-2">{metric.value}</div>
                <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest">{metric.label}</div>
              </motion.div>
            ))}
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="col-span-1 md:col-span-2 lg:col-span-4 bg-[#0A0A0A] border border-white/10 p-8 min-h-[400px] flex flex-col text-left"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Uploads Distribution by Faculty</h3>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-white/20" />
                    <span className="text-[8px] text-white/40 uppercase tracking-widest">Total</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-[#D4AF37]" />
                    <span className="text-[8px] text-white/40 uppercase tracking-widest">Approved</span>
                  </div>
                </div>
              </div>

              <div className="flex-1 w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis 
                      dataKey="faculty" 
                      stroke="rgba(255,255,255,0.3)" 
                      fontSize={8} 
                      tickLine={false} 
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis 
                      stroke="rgba(255,255,255,0.3)" 
                      fontSize={8} 
                      tickLine={false} 
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#0A0A0A', 
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '0px',
                        fontSize: '10px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em'
                      }}
                      itemStyle={{ color: '#D4AF37' }}
                      cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                    />
                    <Bar dataKey="total" fill="rgba(255,255,255,0.1)" radius={[2, 2, 0, 0]} barSize={30} />
                    <Bar dataKey="approved" fill="#D4AF37" radius={[2, 2, 0, 0]} barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </motion.div>
        ) : activeTab === 'users' ? (
          <motion.div 
            key="users"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6 text-left"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Platform Administrators & Members ({adminUsers.length})</h2>
            </div>
            <div className="bg-[#0A0A0A] border border-white/10 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-white/50 text-[10px] uppercase tracking-widest bg-white/5">
                    <th className="p-4 font-bold">Identity</th>
                    <th className="p-4 font-bold">Email Address</th>
                    <th className="p-4 font-bold">Role Clear Level</th>
                    <th className="p-4 font-bold">Authorized At</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {adminUsers.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-10 text-center text-white/20 uppercase tracking-widest font-bold">
                        No Users Synced Yet
                      </td>
                    </tr>
                  ) : (
                    adminUsers.map((item, idx) => (
                      <tr key={`user-row-${idx}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {item.profileImage ? (
                              <img src={item.profileImage} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <Users size={14} className="text-[#D4AF37]" />
                            )}
                          </div>
                          <span className="font-bold text-white uppercase tracking-wider">{item.name}</span>
                        </td>
                        <td className="p-4 font-mono text-xs text-white/60">{item.email}</td>
                        <td className="p-4">
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-1 border",
                            item.role === 'admin' 
                              ? "bg-red-500/10 text-red-500 border-red-500/20" 
                              : "bg-green-500/10 text-green-500 border-green-500/20"
                          )}>
                            {item.role}
                          </span>
                        </td>
                        <td className="p-4 text-white/40 text-xs font-mono">
                          {new Date(item.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="audit-logs"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6 text-left"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white/60 text-xs uppercase tracking-[0.3em] font-bold">Security Operation Audit Logs</h2>
              <div className="flex items-center space-x-2 text-[10px] text-green-500 uppercase tracking-widest font-bold bg-green-500/10 border border-green-500/20 px-3 py-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1" />
                Systems Protected
              </div>
            </div>
            <div className="bg-[#0A0A0A] border border-white/10 p-6 space-y-4">
              {activityLogs.length === 0 ? (
                <div className="py-20 text-center">
                  <p className="text-white/20 uppercase tracking-widest text-sm font-bold">No operations logged recently</p>
                </div>
              ) : (
                activityLogs.map((log, idx) => (
                  <div key={`log-idx-${idx}`} className="flex items-start justify-between border-b border-white/5 pb-4 last:border-none last:pb-0 font-sans">
                    <div className="space-y-1">
                      <p className="text-white text-sm font-medium tracking-wide">{log.action}</p>
                      <p className="text-white/30 text-[9px] uppercase tracking-widest">
                        Operator: <span className="text-[#D4AF37] font-bold">{log.user}</span>
                      </p>
                    </div>
                    <span className="text-white/40 font-mono text-xs">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
    </div>
  );
}
