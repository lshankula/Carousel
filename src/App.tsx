import React, { useState, useRef } from 'react';
import { 
  Layout, 
  Image as ImageIcon, 
  Type as TypeIcon, 
  Plus, 
  Trash2, 
  Sparkles, 
  Upload, 
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Download,
  Share2,
  Wand2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseSlides, generateSlideImage, editSlideImage, SlideContent, CarouselConfig } from './services/geminiService';
import confetti from 'canvas-confetti';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  public state = { hasError: false };

  constructor(props: { children: React.ReactNode }) {
    super(props);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-brand">Something went wrong.</h1>
            <p className="text-white/60">Please refresh the page or try again.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-brand text-black rounded-lg font-bold"
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <CarouselApp />
    </ErrorBoundary>
  );
}

function CarouselApp() {
  const [slides, setSlides] = useState<SlideContent[]>([
    { id: '1', content: 'Write a hook that stops the scroll...', type: 'cover' },
    { id: '2', content: 'Slide 2: Content for this slide...', type: 'content' },
    { id: '3', content: 'Slide 3: Content for this slide...', type: 'content' },
  ]);
  
  const [config, setConfig] = useState<CarouselConfig>({
    platform: 'Instagram',
    format: 'Post 1:1',
    style: 'Professional',
    fontStyle: 'System Default',
    headshotPosition: 'first',
    logoPosition: 'first',
    primaryColor: '#FF6321',
    secondaryColor: '#FFFFFF',
    backgroundColor: '#0A0A0A',
    consistentTheme: false,
  });

  const [headshot, setHeadshot] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>({});
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  
  const [isEditingImage, setIsEditingImage] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditingLoading, setIsEditingLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const handleAddSlide = () => {
    if (slides.length >= 20) return;
    const newSlide: SlideContent = {
      id: Math.random().toString(36).substr(2, 9),
      content: '',
      type: 'content',
    };
    setSlides([...slides, newSlide]);
  };

  const handleRemoveSlide = (id: string) => {
    const newSlides = slides.filter(s => s.id !== id);
    setSlides(newSlides);
    if (activeSlide >= newSlides.length) {
      setActiveSlide(Math.max(0, newSlides.length - 1));
    }
    // Remove generated image for this slide
    const newImages = { ...generatedImages };
    delete newImages[id];
    setGeneratedImages(newImages);
  };

  const handleUpdateSlide = (id: string, content: string) => {
    setSlides(slides.map(s => s.id === id ? { ...s, content } : s));
    // Clear generated image if content changes
    const newImages = { ...generatedImages };
    delete newImages[id];
    setGeneratedImages(newImages);
  };

  const handleEditImage = async () => {
    if (!isEditingImage || !editPrompt.trim() || isEditingLoading) return;
    
    setIsEditingLoading(true);
    setGenerationError(null);
    
    try {
      const originalImage = generatedImages[isEditingImage];
      if (!originalImage) throw new Error("Original image not found");
      
      const newImage = await editSlideImage(originalImage, editPrompt);
      
      setGeneratedImages(prev => ({
        ...prev,
        [isEditingImage]: newImage
      }));
      
      setIsEditingImage(null);
      setEditPrompt('');
    } catch (error: any) {
      console.error("Edit failed:", error);
      setGenerationError(`Edit failed: ${error.message || String(error)}`);
    } finally {
      setIsEditingLoading(false);
    }
  };

  const handleBulkPaste = async () => {
    if (!bulkPasteText.trim()) return;

    setIsParsing(true);
    try {
      const parsedSlides = await parseSlides(bulkPasteText);
      if (parsedSlides && parsedSlides.length > 0) {
        // Ensure all slides have an ID
        const newSlides = parsedSlides.map(slide => ({
          ...slide,
          id: slide.id || Math.random().toString(36).substr(2, 9),
        }));
        setSlides(newSlides);
        setGeneratedImages({});
        setBulkPasteText('');
        setIsPasteModalOpen(false);
        setActiveSlide(0);
      } else {
        // Fallback if parsing fails or returns empty
        const splitSlides = bulkPasteText.split(/\n\n+/).filter(s => s.trim());
        if (splitSlides.length > 0) {
          const newSlides = splitSlides.map(content => ({
            id: Math.random().toString(36).substr(2, 9),
            content: content.trim(),
            type: 'content' as const,
          }));
          setSlides(newSlides);
          setGeneratedImages({});
          setBulkPasteText('');
          setIsPasteModalOpen(false);
          setActiveSlide(0);
        }
      }
    } catch (e) {
      console.error("Failed to parse slides", e);
    } finally {
      setIsParsing(false);
    }
  };

  const generateCanvasForSlide = async (slideIndex: number): Promise<HTMLCanvasElement | null> => {
    const currentImageUrl = generatedImages[slides[slideIndex]?.id];
    if (!currentImageUrl) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Load background image
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = currentImageUrl;
    
    await new Promise((resolve) => {
      bgImg.onload = resolve;
    });

    canvas.width = bgImg.width;
    canvas.height = bgImg.height;
    ctx.drawImage(bgImg, 0, 0);

    const previewWidth = config.format.includes('1:1') ? 500 : config.format.includes('4:5') ? 400 : 300;
    const scale = canvas.width / previewWidth;
    
    // Draw assets if they should be visible on this slide
    // If headshot is generated by AI on first slide, don't overlay it manually on first slide
    const showHeadshot = (config.headshotPosition === 'all' && slideIndex > 0) && headshot;
    const showLogo = (config.logoPosition === 'all' || (config.logoPosition === 'first' && slideIndex === 0)) && logo;

    if (showHeadshot && headshot) {
      const hsImg = new Image();
      hsImg.crossOrigin = "anonymous";
      hsImg.src = headshot;
      await new Promise((resolve) => { 
        hsImg.onload = resolve; 
        hsImg.onerror = resolve; // Resolve on error so it doesn't hang
      });
      
      const hsSize = 48 * scale;
      const marginX = 48 * scale;
      const marginY = canvas.height - (48 * scale) - hsSize;
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(marginX + hsSize/2, marginY + hsSize/2, hsSize/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(hsImg, marginX, marginY, hsSize, hsSize);
      ctx.restore();

      // Draw border
      ctx.beginPath();
      ctx.arc(marginX + hsSize/2, marginY + hsSize/2, hsSize/2, 0, Math.PI * 2);
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = config.primaryColor;
      ctx.stroke();

      // Draw text
      ctx.fillStyle = config.secondaryColor;
      ctx.font = `bold ${12 * scale}px sans-serif`;
      ctx.fillText("Luke Shankula", marginX + hsSize + (12 * scale), marginY + (hsSize/2) - (2 * scale));
      
      ctx.fillStyle = config.secondaryColor;
      ctx.globalAlpha = 0.6;
      ctx.font = `${10 * scale}px sans-serif`;
      ctx.fillText("@lshankula", marginX + hsSize + (12 * scale), marginY + (hsSize/2) + (12 * scale));
      ctx.globalAlpha = 1.0;
    }

    if (showLogo && logo) {
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = logo;
      await new Promise((resolve) => { 
        logoImg.onload = resolve; 
        logoImg.onerror = resolve; // Resolve on error so it doesn't hang
      });
      
      const logoHeight = 32 * scale;
      const logoWidth = (logoImg.width / logoImg.height) * logoHeight;
      const marginX = canvas.width - (48 * scale) - logoWidth;
      const marginY = canvas.height - (48 * scale) - logoHeight - ((48 * scale - logoHeight) / 2); // vertically center with headshot
      
      ctx.drawImage(logoImg, marginX, marginY, logoWidth, logoHeight);
    }

    // Draw discreet slide number
    ctx.fillStyle = config.secondaryColor;
    ctx.globalAlpha = 0.5;
    ctx.font = `bold ${14 * scale}px sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(`${slideIndex + 1} / ${slides.length}`, canvas.width - (48 * scale), 48 * scale);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = "left"; // reset

    return canvas;
  };

  const handleDownload = async () => {
    const canvas = await generateCanvasForSlide(activeSlide);
    if (!canvas) return;

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `slide-${activeSlide + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = async () => {
    const zip = new JSZip();
    
    for (let i = 0; i < slides.length; i++) {
      if (!generatedImages[slides[i].id]) continue;
      
      const canvas = await generateCanvasForSlide(i);
      if (!canvas) continue;
      
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
      
      zip.file(`slide-${i + 1}.png`, base64Data, {base64: true});
    }
    
    const content = await zip.generateAsync({type: "blob"});
    saveAs(content, "carousel-slides.zip");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'headshot' | 'logo') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'headshot') setHeadshot(reader.result as string);
        else setLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setGenerationError(null);
    setIsGenerating(true);
    
    try {
      // Check if API key is selected using the platform method
      let keySelected = hasApiKey;
      let connectionAlive = true;

      if (!keySelected && window.aistudio?.hasSelectedApiKey) {
        try {
          // Add a 2-second timeout to the check to prevent hanging if connection is asleep
          keySelected = await Promise.race([
            window.aistudio.hasSelectedApiKey(),
            new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2000))
          ]);
          if (keySelected) setHasApiKey(true);
        } catch (e: any) {
          console.error("Error checking API key status:", e);
          if (e.message === "Timeout") {
            connectionAlive = false;
          }
        }
      }

      if (!connectionAlive) {
        setGenerationError("Connection to AI Studio lost. Please refresh the page and try again.");
        setIsGenerating(false);
        return;
      }

      if (!keySelected) {
        if (window.aistudio?.openSelectKey) {
          try {
            // Do NOT timeout openSelectKey, as it waits for user input
            await window.aistudio.openSelectKey();
            setHasApiKey(true);
          } catch (e: any) {
            console.error("Failed to open select key dialog", e);
            setGenerationError("Failed to open API key dialog. Please try again.");
            setIsGenerating(false);
            return;
          }
        } else {
          // Fallback if not in AI Studio
          setHasApiKey(true);
        }
      }
      
      // Sequential generation to avoid rate limits and timeouts
      const newImages: Record<string, string> = {};
      let hasErrors = false;
      let firstError = null;

      for (let index = 0; index < slides.length; index++) {
        const slide = slides[index];
        let timeoutId: NodeJS.Timeout;
        const timeoutPromise = new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Slide ${index + 1} generation timed out after 120 seconds`)), 120000);
        });
        
        const imagePromise = generateSlideImage(slide, config, index, slides.length, headshot);
        // Prevent unhandled promise rejection if it fails after timeout
        imagePromise.catch(e => console.warn(`Background slide ${index + 1} generation failed (likely after timeout):`, e));
        
        try {
          const imageUrl = await Promise.race([
            imagePromise,
            timeoutPromise
          ]);
          newImages[slide.id] = imageUrl;
          // Update state incrementally so user sees progress
          setGeneratedImages(prev => ({...prev, [slide.id]: imageUrl}));
        } catch (error) {
          hasErrors = true;
          firstError = firstError || error;
          console.error(`Slide ${index + 1} failed:`, error);
          break; // Stop generating subsequent slides if one fails
        } finally {
          clearTimeout(timeoutId!);
        }
      }

      if (hasErrors) {
        throw firstError || new Error("Some slides failed to generate.");
      }
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF6321', '#FFFFFF', '#000000']
      });
    } catch (error: any) {
      console.error("Generation failed", error);
      setGenerationError(error.message || "An error occurred during generation.");
      if (
        error.message?.includes("Requested entity was not found") || 
        error.message?.includes("API key not valid") ||
        error.message?.includes("API Key not found")
      ) {
        setHasApiKey(false);
        setGenerationError("API Key invalid or not found. Please click Generate to select a new key.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-brand/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight">Creator Studio</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors">
              Drafts
            </button>
            <button className="px-4 py-2 bg-white text-black rounded-full text-sm font-bold hover:bg-white/90 transition-all">
              Upgrade Pro
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Editor */}
        <div className="lg:col-span-7 space-y-8">
          {/* Platform & Format */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white/40 uppercase tracking-widest">
              <Layout className="w-4 h-4" />
              <span>Configuration</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Platform</label>
                <div className="flex flex-wrap gap-2">
                  {['Instagram', 'LinkedIn', 'Twitter/X', 'Pinterest'].map(p => (
                    <button
                      key={p}
                      onClick={() => setConfig({ ...config, platform: p })}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                        config.platform === p 
                          ? "bg-brand border-brand text-black" 
                          : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Format</label>
                <div className="flex flex-wrap gap-2">
                  {['Post 1:1', 'Portrait 4:5', 'Story/Reel 9:16'].map(f => (
                    <button
                      key={f}
                      onClick={() => setConfig({ ...config, format: f })}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                        config.format === f 
                          ? "bg-brand border-brand text-black" 
                          : "bg-white/5 border-white/10 text-white/60 hover:border-white/20"
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Slides Editor */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-white/40 uppercase tracking-widest">
                <TypeIcon className="w-4 h-4" />
                <span>Slides ({slides.length}/20)</span>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsPasteModalOpen(true)}
                  className="flex items-center gap-2 text-sm font-bold text-white/60 hover:text-white transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  Paste All Slides
                </button>
                <button 
                  onClick={handleAddSlide}
                  className="flex items-center gap-2 text-sm font-bold text-brand hover:text-brand/80 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Slide
                </button>
              </div>
            </div>
            
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {slides.map((slide, index) => (
                  <motion.div
                    key={slide.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group relative"
                  >
                    <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/40 group-hover:text-brand transition-colors">
                      {index + 1}
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4 items-start group-hover:border-white/20 transition-all">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                            slide.type === 'cover' ? "bg-brand/20 text-brand" : "bg-white/10 text-white/60"
                          )}>
                            {slide.type}
                          </span>
                          {index === 0 && <span className="text-[10px] text-white/40 italic">This is your cover slide - make it attention-grabbing!</span>}
                        </div>
                        <textarea
                          value={slide.content}
                          onChange={(e) => handleUpdateSlide(slide.id, e.target.value)}
                          placeholder="Enter slide content..."
                          className="w-full bg-transparent border-none p-0 text-sm focus:ring-0 resize-none custom-scrollbar min-h-[60px]"
                        />
                      </div>
                      <button 
                        onClick={() => handleRemoveSlide(slide.id)}
                        className="p-2 text-white/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        </div>

        {/* Right Column: Preview & Assets */}
        <div className="lg:col-span-5 space-y-8 lg:sticky lg:top-24 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8 scrollbar-hide">
          {/* Style Settings */}
          <section className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Style</label>
                <select 
                  value={config.style}
                  onChange={(e) => setConfig({ ...config, style: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-brand/50"
                >
                  <option>Professional</option>
                  <option>Aesthetic</option>
                  <option>Brutalist</option>
                  <option>Minimal</option>
                  <option>Editorial</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/60">Font Style</label>
                <select 
                  value={config.fontStyle}
                  onChange={(e) => setConfig({ ...config, fontStyle: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm focus:outline-none focus:border-brand/50"
                >
                  <option>System Default</option>
                  <option>Serif Elegant</option>
                  <option>Modern Sans</option>
                  <option>Tech Mono</option>
                </select>
              </div>
            </div>

            {/* Brand Colors */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-white/60">Brand Colors</label>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Primary</span>
                    <input 
                      type="color" 
                      value={config.primaryColor}
                      onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                      className="w-4 h-4 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                    />
                  </div>
                  <input 
                    type="text" 
                    value={config.primaryColor}
                    onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-1.5 text-[10px] uppercase focus:outline-none focus:border-brand/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Secondary</span>
                    <input 
                      type="color" 
                      value={config.secondaryColor}
                      onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                      className="w-4 h-4 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                    />
                  </div>
                  <input 
                    type="text" 
                    value={config.secondaryColor}
                    onChange={(e) => setConfig({ ...config, secondaryColor: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-1.5 text-[10px] uppercase focus:outline-none focus:border-brand/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Background</span>
                    <input 
                      type="color" 
                      value={config.backgroundColor}
                      onChange={(e) => setConfig({ ...config, backgroundColor: e.target.value })}
                      className="w-4 h-4 rounded-full overflow-hidden border-none p-0 cursor-pointer"
                    />
                  </div>
                  <input 
                    type="text" 
                    value={config.backgroundColor}
                    onChange={(e) => setConfig({ ...config, backgroundColor: e.target.value })}
                    className="w-full bg-black/40 border border-white/10 rounded-lg p-1.5 text-[10px] uppercase focus:outline-none focus:border-brand/50"
                  />
                </div>
              </div>
            </div>

            {/* Layout Options */}
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium text-white">Consistent Slides</label>
                  <p className="text-xs text-white/40">Use the same layout for all content slides</p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, consistentTheme: !config.consistentTheme })}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    config.consistentTheme ? "bg-brand" : "bg-white/20"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3 w-3 transform rounded-full bg-white transition-transform",
                      config.consistentTheme ? "translate-x-5" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Assets */}
            <div className="space-y-4 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-white/60">Assets (Optional)</label>
                <button className="text-[10px] font-bold text-brand uppercase tracking-wider">Apply All</button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Headshot */}
                <div className="space-y-2">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand/50 transition-all overflow-hidden relative group"
                  >
                    {headshot ? (
                      <>
                        <img src={headshot} alt="Headshot" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <Upload className="w-6 h-6" />
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setHeadshot(null); }}
                          className="absolute top-2 right-2 p-1 bg-black/60 rounded-full hover:bg-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-6 h-6 text-white/20" />
                        <span className="text-[10px] font-medium text-white/40">Headshot</span>
                      </>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={(e) => handleFileUpload(e, 'headshot')} className="hidden" accept="image/*" />
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setConfig({ ...config, headshotPosition: 'first' })}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-bold border transition-all",
                        config.headshotPosition === 'first' ? "bg-brand/20 border-brand/40 text-brand" : "border-white/10 text-white/40"
                      )}
                    >
                      First
                    </button>
                    <button 
                      onClick={() => setConfig({ ...config, headshotPosition: 'all' })}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-bold border transition-all",
                        config.headshotPosition === 'all' ? "bg-brand/20 border-brand/40 text-brand" : "border-white/10 text-white/40"
                      )}
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* Logo */}
                <div className="space-y-2">
                  <div 
                    onClick={() => logoInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand/50 transition-all overflow-hidden relative group"
                  >
                    {logo ? (
                      <>
                        <img src={logo} alt="Logo" className="w-full h-full object-contain p-4" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                          <Upload className="w-6 h-6" />
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setLogo(null); }}
                          className="absolute top-2 right-2 p-1 bg-black/60 rounded-full hover:bg-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-6 h-6 text-white/20" />
                        <span className="text-[10px] font-medium text-white/40">Logo</span>
                      </>
                    )}
                  </div>
                  <input type="file" ref={logoInputRef} onChange={(e) => handleFileUpload(e, 'logo')} className="hidden" accept="image/*" />
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setConfig({ ...config, logoPosition: 'first' })}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-bold border transition-all",
                        config.logoPosition === 'first' ? "bg-brand/20 border-brand/40 text-brand" : "border-white/10 text-white/40"
                      )}
                    >
                      First
                    </button>
                    <button 
                      onClick={() => setConfig({ ...config, logoPosition: 'all' })}
                      className={cn(
                        "flex-1 py-1 rounded text-[10px] font-bold border transition-all",
                        config.logoPosition === 'all' ? "bg-brand/20 border-brand/40 text-brand" : "border-white/10 text-white/40"
                      )}
                    >
                      All
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {generationError && (
              <div className="w-full p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm mb-4">
                {generationError}
              </div>
            )}
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || slides.length === 0}
              className="w-full py-4 bg-brand text-black rounded-xl font-bold text-lg hover:bg-brand/90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Generating Slides...
                </>
              ) : slides.length === 0 ? (
                <>
                  Add Slides to Generate
                </>
              ) : (
                <>
                  Generate Carousel ({slides.length} slides)
                </>
              )}
            </button>
          </section>

          {/* Preview Area */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-white/40 uppercase tracking-widest">Live Preview</div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsEditingImage(slides[activeSlide]?.id)}
                  disabled={!generatedImages[slides[activeSlide]?.id] || isGenerating}
                  className="px-3 py-2 bg-brand/20 text-brand rounded-lg hover:bg-brand/30 transition-all disabled:opacity-30 text-sm font-medium flex items-center gap-2"
                  title="Magic Edit Image"
                >
                  <Wand2 className="w-4 h-4" />
                  Edit
                </button>
                <button 
                  onClick={handleDownloadAll}
                  disabled={Object.keys(generatedImages).length === 0}
                  className="px-3 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-all disabled:opacity-30 text-sm font-medium flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  All
                </button>
                <button 
                  onClick={handleDownload}
                  disabled={!generatedImages[slides[activeSlide]?.id]}
                  className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-all disabled:opacity-30"
                  title="Download Current Slide"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-all">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className={cn(
              "relative bg-white/5 rounded-3xl border border-white/10 overflow-hidden group mx-auto transition-all duration-300",
              config.format.includes('1:1') ? "aspect-square w-full max-w-[500px]" : 
              config.format.includes('4:5') ? "aspect-[3/4] w-full max-w-[400px]" : 
              "aspect-[9/16] w-full max-w-[300px]"
            )}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSlide}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="absolute inset-0 flex flex-col justify-center items-center text-center"
                >
                  {generatedImages[slides[activeSlide]?.id] ? (
                    <img 
                      src={generatedImages[slides[activeSlide]?.id]} 
                      alt={`Slide ${activeSlide + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div 
                      className="p-12 space-y-6 w-full h-full flex flex-col justify-center items-center"
                      style={{ backgroundColor: config.backgroundColor }}
                    >
                      <span 
                        className="font-bold uppercase tracking-[0.2em] text-xs"
                        style={{ color: config.primaryColor }}
                      >
                        {slides[activeSlide]?.type || 'Content'}
                      </span>
                      <h2 
                        className={cn(
                          "text-4xl font-bold leading-tight",
                          config.fontStyle === 'Serif Elegant' ? "font-serif italic" : "font-sans"
                        )}
                        style={{ color: config.secondaryColor }}
                      >
                        {slides[activeSlide]?.content || 'Your content goes here...'}
                      </h2>
                    </div>
                  )}
                  
                  {/* Overlaid Assets (Always visible) */}
                  <div className="absolute top-12 right-12 z-10 text-sm font-bold opacity-50" style={{ color: config.secondaryColor }}>
                    {activeSlide + 1} / {slides.length}
                  </div>
                  <div className="absolute bottom-12 left-12 right-12 flex items-center justify-between z-10">
                    {((activeSlide > 0 && config.headshotPosition === 'all') || (activeSlide === 0 && !generatedImages[slides[activeSlide]?.id])) && headshot && (
                      <div className="flex items-center gap-3">
                        <img 
                          src={headshot} 
                          className="w-12 h-12 rounded-full border-2 object-cover" 
                          style={{ borderColor: config.primaryColor }}
                        />
                        <div className="text-left">
                          <div className="text-xs font-bold" style={{ color: config.secondaryColor }}>Luke Shankula</div>
                          <div className="text-[10px]" style={{ color: `${config.secondaryColor}66` }}>@lshankula</div>
                        </div>
                      </div>
                    )}
                    {(config.logoPosition === 'all' || (config.logoPosition === 'first' && activeSlide === 0)) && logo && (
                      <img src={logo} className="h-8 object-contain" />
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="absolute inset-y-0 left-4 flex items-center">
                <button 
                  onClick={() => setActiveSlide(prev => Math.max(0, prev - 1))}
                  className="p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-brand hover:text-black transition-all opacity-0 group-hover:opacity-100"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
              <div className="absolute inset-y-0 right-4 flex items-center">
                <button 
                  onClick={() => setActiveSlide(prev => Math.min(slides.length - 1, prev + 1))}
                  className="p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 hover:bg-brand hover:text-black transition-all opacity-0 group-hover:opacity-100"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Progress Dots */}
              {slides.length > 0 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {slides.map((_, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "h-1 rounded-full transition-all",
                        activeSlide === i ? "w-6 bg-brand" : "w-1.5 bg-white/20"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Paste Modal */}
      <AnimatePresence>
        {isPasteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsPasteModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-card-dark border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Paste All Slides</h3>
                <button 
                  onClick={() => setIsPasteModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-white/40">
                Paste your content below. Separate each slide with a double newline (press Enter twice).
              </p>
              <textarea
                autoFocus
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
                placeholder="Slide 1 Content...&#10;&#10;Slide 2 Content..."
                className="w-full h-64 bg-black/40 border border-white/10 rounded-2xl p-6 text-sm focus:outline-none focus:border-brand/50 transition-all resize-none custom-scrollbar"
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsPasteModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkPaste}
                  disabled={!bulkPasteText.trim() || isParsing}
                  className="flex-1 py-3 bg-brand text-black rounded-xl font-bold hover:bg-brand/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isParsing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    'Import Slides'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Image Modal */}
      <AnimatePresence>
        {isEditingImage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isEditingLoading) {
                  setIsEditingImage(null);
                  setEditPrompt('');
                }
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-card-dark border border-white/10 rounded-3xl p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-brand" />
                  Magic Edit
                </h3>
                <button 
                  onClick={() => {
                    setIsEditingImage(null);
                    setEditPrompt('');
                  }}
                  disabled={isEditingLoading}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-white/40">
                Describe what you want to change in the image. For example: "Fix the spelling of 'carousel'", "Make the background darker", or "Remove the logo".
              </p>
              <textarea
                autoFocus
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder="Enter your edit instructions..."
                className="w-full h-32 bg-black/40 border border-white/10 rounded-2xl p-6 text-sm focus:outline-none focus:border-brand/50 transition-all resize-none custom-scrollbar"
                disabled={isEditingLoading}
              />
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setIsEditingImage(null);
                    setEditPrompt('');
                  }}
                  disabled={isEditingLoading}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleEditImage}
                  disabled={!editPrompt.trim() || isEditingLoading}
                  className="flex-1 py-3 bg-brand text-black rounded-xl font-bold hover:bg-brand/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isEditingLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Editing...
                    </>
                  ) : (
                    'Apply Edit'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-white/5 text-center">
        <p className="text-white/20 text-xs font-medium tracking-widest uppercase">
          Powered by Gemini AI • Parallel Generation Engine v1.0
        </p>
      </footer>
    </div>
  );
}
