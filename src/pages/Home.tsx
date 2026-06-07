import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { Camera, ChevronRight, Play, Sparkles, GraduationCap, Loader2, Check, Search, Plus } from 'lucide-react';
import { memoryService, eventService } from '../lib/api-client';
import { useAuthStore } from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import graduationImage from '../assets/graduation.svg';
import facultyImage from '../assets/faculty.svg';
import noMoreCgpaImage from '../assets/noMoreCgpa.jpg';
import echelontixImage from '../assets/echelontix.jpg';
{/*import { db } from '../services/firebase';
import { collection, query, where, limit, onSnapshot, orderBy, getDocs } from 'firebase/firestore';*/}

const CATEGORIES = [
  { id: 'graduation', title: 'Graduation Week', count: 124, image: graduationImage },
  { id: 'faculty', title: 'Faculty Archives', count: 450, image: facultyImage },
  { id: 'nightlife', title: 'NO MORE CGPA', count: 2, image: noMoreCgpaImage },
  { id: 'lifestyle', title: 'Echelontix Culture', count: 890, image: echelontixImage },
];

const FALLBACK_HERO = "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=200&q=80";
const FALLBACK_CATEGORY_IMAGE = "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=1200&q=80";

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleEventRegister = async () => {
    if (!isAuthenticated) {
      navigate('/archive?auth=login');
      return;
    }

    setIsRegistering(true);
    try {
      // Mock event ID for demo, usually we'd fetch events first
      await eventService.rsvp(1, { ticket_type: 'regular' });
      setIsSuccess(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRegistering(false);
    }
  };
  const [slides, setSlides] = useState<string[]>([FALLBACK_HERO]);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const memoryData = await memoryService.getMemories({ limit: 10 });
        if (Array.isArray(memoryData) && memoryData.length > 0) {
          setSlides(memoryData.map((m: any) => m.media_url));
        }

        const statsData = await memoryService.getStats();
        setStats(statsData);
      } catch (err) {
        console.warn("Home data fetch failed", err);
      }
    };

    fetchHomeData();
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [slides]);

  const [stats, setStats] = useState({
    total: 0,
    contributors: 300,
    faculties: 7
  });

  return (
    <div className="relative">
      {/* Cinematic Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-24 md:py-32">
        {/* Background Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-[#050505]/80 z-10" />
          <AnimatePresence mode="wait">
            <motion.img 
              key={slides[currentSlide]}
              src={slides[currentSlide]} 
              alt="Memory Slideshow"
              onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                const target = e.currentTarget;
                target.onerror = null;
                target.src = FALLBACK_HERO;
              }}
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 0.3, scale: 1.05 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1 }}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </AnimatePresence>
        </div>

        <div className="relative z-20 w-full max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <span className="inline-flex items-center space-x-2 bg-white/5 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 mb-8">
              <GraduationCap className="text-[#D4AF37]" size={14} />
              <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60">Class of 2026</span>
            </span>
            
            <h1 className="text-6xl md:text-[10rem] font-bold tracking-tighter mb-4 leading-[0.8] text-center relative">
              <span className="block text-white opacity-90">CLASS OF</span>
              <span className="block text-[#D4AF37] relative inline-block">
                2026.
                <motion.div 
                  initial={{ opacity: 0, rotate: -20, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: -15, scale: 1 }}
                  transition={{ delay: 1, duration: 0.8, type: "spring" }}
                  className="absolute -top-6 -right-12 md:-top-12 md:-right-24 text-[#D4AF37]/40"
                >
                  <GraduationCap size={80} className="w-16 h-16 md:w-32 md:h-32" strokeWidth={1} />
                </motion.div>
              </span>
            </h1>

            <div className="w-24 h-px bg-[#D4AF37]/50 my-12" />

            {/* The Writeup: Integrated directly into visible area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 text-center mb-16 max-w-5xl">
              <div className="space-y-6 flex flex-col items-center">
                <p className="text-[#D4AF37] text-xs font-black uppercase tracking-[0.4em] mb-4">The Generation</p>
                <div className="font-serif italic text-lg md:text-xl text-white/80 leading-relaxed space-y-4 text-center">
                  <p>We entered these halls with uncertain futures, carrying ambitions larger than the world expected from us.</p>
                  <p>Somewhere between sleepless nights, shared laughter, heartbreaks, and silent prayers before results, we became more than students.</p>
                  <p>We became proof that growth is never easy while it is happening.</p>
                </div>
              </div>
              <div className="space-y-6 flex flex-col items-center">
                <p className="text-[#D4AF37] text-xs font-black uppercase tracking-[0.4em] mb-4">The Legacy</p>
                <div className="font-serif italic text-lg md:text-xl text-white/50 leading-relaxed space-y-4 text-center">
                  <p>This gallery is more than photographs. It is a collection of moments that defined an era of our lives a reminder that we lived and evolved together.</p>
                  <p>Every face reflects a future still unfolding. The lectures will end, the classrooms will empty, but these memories created here remain timeless.</p>
                  <div className="pt-4 text-center">
                    <p className="text-white text-xl md:text-2xl font-black uppercase tracking-tighter">Welcome to the legacy.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 w-full max-w-md">
              <Link
                to="/archive?upload=true"
                className="group relative w-full px-10 py-5 bg-[#D4AF37] text-black font-black uppercase tracking-widest text-xs transition-all hover:scale-105 shadow-[0_0_30px_rgba(212,175,55,0.2)]"
              >
                <div className="relative z-10 flex items-center justify-center space-x-3">
                  <Camera size={20} />
                  <span>Upload Memories</span>
                </div>
              </Link>
              
              <Link
                to="/archive"
                className="w-full px-10 py-5 bg-transparent border border-white/20 text-white font-black uppercase tracking-widest text-xs hover:bg-white hover:text-black transition-all flex items-center justify-center space-x-3"
              >
                <span>Explore Archive</span>
                <Play size={16} fill="currentColor" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Featured Statistics */}
      <section className="py-20 bg-[#0A0A0A] border-y border-white/5 text-center">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {[
            { label: 'Moments Captured', value: `${(stats.total + 50).toLocaleString()}+` },
            { label: 'Active Students', value: `${(stats.contributors).toLocaleString()}+` },
            { label: 'Faculties Preserved', value: stats.faculties.toString() },
            { label: 'Archival Status', value: 'Live' },
          ].map((stat) => (
            <div key={`stat-${stat.label}`} className="text-center">
              <div className="text-[#D4AF37] text-2xl md:text-3xl font-bold mb-2 tracking-tight uppercase">{stat.value}</div>
              <div className="text-white/40 text-[10px] uppercase tracking-widest font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* NO MORE CGPA Event Module */}
      <section className="py-32 bg-[#050505] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="w-full md:w-1/2 relative">
              <motion.div 
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative z-10 aspect-[4/5] overflow-hidden"
              >
                <img 
                  src={noMoreCgpaImage} 
                  alt="NO MORE CGPA" 
                  className="w-full h-full object-cover transition-transform duration-1000 hover:scale-110"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.onerror = null;
                    target.src = FALLBACK_CATEGORY_IMAGE;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent" />
                <div className="absolute top-6 left-6 bg-[#D4AF37] text-black px-4 py-1 font-black text-[10px] uppercase tracking-widest shadow-2xl">
                  Official Party
                </div>
              </motion.div>
              <div className="absolute -bottom-8 -right-8 w-64 h-64 border border-[#D4AF37]/20 z-0 hidden md:block" />
            </div>

            <div className="w-full md:w-1/2 space-y-8">
              <div className="space-y-4">
                <span className="text-[#D4AF37] text-xs font-black uppercase tracking-[0.4em] block">The Finale</span>
                <h2 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-none">NO MORE<br/>CGPA.</h2>
              </div>
              
              <div className="space-y-6">
                <p className="text-white/60 text-lg leading-relaxed">
                  The ultimate graduation celebration by Echelontix. A night where we drop the books, 
                  forget the grades, and embrace the future together. Luxury, music, and eternal memories.
                </p>
                
                <div className="grid grid-cols-2 gap-8 border-y border-white/10 py-8">
                  <div>
                    <span className="block text-[#D4AF37] text-2xl font-bold uppercase tracking-tighter">OCT 24</span>
                    <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Event Date</span>
                  </div>
                  <div>
                    <span className="block text-white text-2xl font-bold uppercase tracking-tighter">LAGOS</span>
                    <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Venue Confirmed</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button 
                    onClick={handleEventRegister}
                    disabled={isRegistering || isSuccess}
                    className="flex-1 bg-white text-black py-4 font-black uppercase tracking-widest text-[10px] hover:bg-[#D4AF37] transition-all flex items-center justify-center space-x-2 disabled:opacity-70"
                  >
                    {isRegistering ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isSuccess ? (
                      <Check size={14} />
                    ) : null}
                    <span>{isSuccess ? 'Confirmed' : 'Register Interest'}</span>
                  </button>
                  <button className="flex-1 border border-white/20 text-white py-4 font-black uppercase tracking-widest text-[10px] hover:bg-white/5 transition-all">
                    Event Details
                  </button>
                </div>
                
                <div className="flex items-center space-x-4 pt-4">
                  <div className="flex -space-x-3">
                    {[1,2,3,4].map(i => (
                      <div key={`attendee-${i}`} className="w-8 h-8 rounded-full border-2 border-black bg-white/10 overflow-hidden">
                        <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="attendee" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">
                    <span className="text-[#D4AF37]">1,240+</span> Students Registered
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Archive Categories */}
      <section className="py-32 bg-[#050505] px-4 text-center">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col items-center justify-center mb-20 gap-8 text-center">
            <div className="max-w-2xl mx-auto">
              <span className="text-[#D4AF37] text-xs uppercase tracking-[0.3em] font-bold block mb-4">The Legacy</span>
              <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-none mb-6">EXPLORE THE PASSAGE OF TIME</h2>
              <p className="text-white/50 text-lg leading-relaxed">
                From the excitement of matriculation to the emotions of final year exams. 
                Our archive is organized into the pillars of our journey.
              </p>
            </div>
            <Link to="/archive" className="group flex items-center space-x-2 text-white font-medium uppercase tracking-widest text-sm">
              <span>View Full Archive</span>
              <ChevronRight className="group-hover:translate-x-2 transition-transform" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => (
              <motion.div
                key={`home-category-${cat.id}`}
                whileHover={{ y: -10 }}
                className="group relative aspect-[3/4] overflow-hidden bg-white/5 cursor-pointer"
              >
                <img 
                  src={cat.image} 
                  alt={cat.title} 
                  className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-700"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.onerror = null;
                    target.src = FALLBACK_CATEGORY_IMAGE;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-0 left-0 p-8 w-full translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                  <div className="text-white/40 text-[10px] uppercase tracking-widest mb-2 font-bold">{cat.count} Memories</div>
                  <h3 className="text-2xl font-bold text-white tracking-tight mb-4">{cat.title}</h3>
                  <div className="h-px w-0 group-hover:w-full bg-[#D4AF37] transition-all duration-500" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 bg-[#D4AF37] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        </div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-7xl font-bold tracking-tighter text-black mb-8 leading-[0.9]">
            BECOME A PART OF THE 2026 LEGACY.
          </h2>
          <p className="text-black/80 text-lg md:text-xl mb-12 font-medium">
            Your memories are the threads that weave our collective history. 
            Don't let them fade away in your camera roll.
          </p>
          <Link
            to="/archive?upload=true"
            className="inline-flex items-center space-x-4 px-12 py-5 bg-black text-[#D4AF37] font-black uppercase tracking-widest text-sm hover:scale-105 transition-all shadow-2xl"
          >
            <Camera size={20} />
            <span>Contribute Now</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
