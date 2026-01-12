
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { InstallManager } from './components/InstallManager';
import { WeighingForm } from './components/WeighingForm';
import { GlobalWeighingChat } from './components/GlobalWeighingChat';
import { useWakeLock } from './hooks/useWakeLock';
import { getRecords, deleteRecord, clearAllRecords, getUserProfile, saveUserProfile, getTheme, saveTheme } from './services/storageService';
import { WeighingRecord, Language, UserProfile } from './types';
import { LanguageProvider, useTranslation } from './services/i18n';
import { ToastProvider, useToast } from './components/Toast';

// Tolerance limit 200g
const TOLERANCE_KG = 0.2;

// WhatsApp Contacts Configuration
const WHATSAPP_CONTACTS = [
    { name: 'Yo', number: '5541996820548', label: '(41) 99682-0548' },
    { name: 'Nicolly', number: '554191616725', label: '(41) 9161-6725' },
    { name: 'Day', number: '554184538696', label: '(41) 8453-8696' }
];

type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'year';

const MainLayout: React.FC = () => {
    const { t, language, setLanguage } = useTranslation();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'weigh' | 'history'>('weigh');
    
    // Enable wake lock to prevent screen sleep
    useWakeLock();
    
    // Theme State
    const [isDarkMode, setIsDarkMode] = useState(getTheme() === 'dark');

    // History Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    
    // UI State
    const [viewingEvidence, setViewingEvidence] = useState<string | null>(null);
    const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [globalChatOpen, setGlobalChatOpen] = useState(false);
    const [selectedRecordForWhatsapp, setSelectedRecordForWhatsapp] = useState<WeighingRecord | null>(null);
    
    const [records, setRecords] = useState<WeighingRecord[]>([]);
    const [userProfile, setUserProfile] = useState<UserProfile>(getUserProfile());
    
    // Profile Editing State
    const [tempProfile, setTempProfile] = useState<UserProfile>(getUserProfile());
    const profileImageInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Initial load
        setRecords(getRecords());
        setUserProfile(getUserProfile());

        // Apply theme on mount
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    const toggleTheme = () => {
        const newMode = !isDarkMode;
        setIsDarkMode(newMode);
        saveTheme(newMode ? 'dark' : 'light');
        if (newMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    useEffect(() => {
        // Refresh on tab change to history to ensure latest data
        if (activeTab === 'history') {
            setRecords(getRecords());
        }
    }, [activeTab]);

    // --- Filtering Logic ---
    const filteredRecords = useMemo(() => {
        let result = records;

        // 1. Search Filter
        if (searchTerm.trim()) {
            const lowerQuery = searchTerm.toLowerCase();
            result = result.filter(r => 
                r.supplier.toLowerCase().includes(lowerQuery) || 
                r.product.toLowerCase().includes(lowerQuery) ||
                (r.batch && r.batch.toLowerCase().includes(lowerQuery))
            );
        }

        // 2. Time Filter
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Start of today
        
        if (timeFilter !== 'all') {
            result = result.filter(r => {
                const recordDate = new Date(r.timestamp);
                recordDate.setHours(0, 0, 0, 0);

                if (timeFilter === 'today') {
                    return recordDate.getTime() === now.getTime();
                } else if (timeFilter === 'week') {
                    const sevenDaysAgo = new Date(now);
                    sevenDaysAgo.setDate(now.getDate() - 7);
                    return recordDate >= sevenDaysAgo;
                } else if (timeFilter === 'month') {
                    return recordDate.getMonth() === now.getMonth() && recordDate.getFullYear() === now.getFullYear();
                } else if (timeFilter === 'year') {
                    return recordDate.getFullYear() === now.getFullYear();
                }
                return true;
            });
        }

        return result;
    }, [records, searchTerm, timeFilter]);

    // --- Export Logic ---
    const handleExportCSV = () => {
        if (filteredRecords.length === 0) {
            showToast("No hay datos para exportar", "info");
            return;
        }

        // Headers
        const headers = ["Data", "Hora", "Fornecedor", "Produto", "Lote", "Validade", "Peso Nota (kg)", "Peso Bruto (kg)", "Tara (kg)", "Peso Liquido (kg)", "Diferenca (kg)", "Status", "Obs IA"];
        
        // Rows
        const rows = filteredRecords.map(r => {
            const date = new Date(r.timestamp);
            const diff = r.netWeight - r.noteWeight;
            
            // Handle commas in content by quoting strings
            const escape = (str?: string) => `"${(str || '').replace(/"/g, '""')}"`;
            
            return [
                date.toLocaleDateString(),
                date.toLocaleTimeString(),
                escape(r.supplier),
                escape(r.product),
                escape(r.batch),
                escape(r.expirationDate),
                r.noteWeight.toFixed(2),
                r.grossWeight.toFixed(2),
                r.taraTotal.toFixed(3),
                r.netWeight.toFixed(2),
                diff.toFixed(2),
                r.status,
                escape(r.aiAnalysis)
            ].join(",");
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n"); // Add BOM for Excel
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `conferente_export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleClearHistory = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.confirm(t('msg_confirm_delete_all'))) {
            clearAllRecords();
            setRecords([]);
            showToast(t('msg_history_cleared'), 'success');
        }
    };

    const openWhatsappModal = (record: WeighingRecord) => {
        setSelectedRecordForWhatsapp(record);
        setWhatsappModalOpen(true);
    };

    const sendToContact = (phone: string) => {
        if (!selectedRecordForWhatsapp) return;

        const record = selectedRecordForWhatsapp;
        const diff = record.netWeight - record.noteWeight;
        const message = `${t('rpt_title')}
📅 ${new Date(record.timestamp).toLocaleString()}
${t('rpt_supplier')} ${record.supplier}
${t('rpt_product')} ${record.product}
${record.batch ? `${t('rpt_batch')} ${record.batch}` : ''}
${t('rpt_note')} ${record.noteWeight}kg | ⚖️ ${t('rpt_net')} ${record.netWeight}kg
${t('rpt_tara')} ${record.taraTotal.toFixed(3)}kg (${record.boxes.qty} x ${record.boxes.unitTara*1000}g)
${t('rpt_diff')} ${diff > 0 ? '+' : ''}${diff.toFixed(2)} kg
${record.aiAnalysis ? `${t('rpt_ai_obs')} ${record.aiAnalysis}` : ''}
${record.evidence ? '📸 [FOTO]' : ''}`;
        
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        
        // Close modal after sending
        setWhatsappModalOpen(false);
        setSelectedRecordForWhatsapp(null);
    };

    const toggleLanguage = () => {
        const nextLang: Record<Language, Language> = {
            'pt': 'es',
            'es': 'en',
            'en': 'pt'
        };
        setLanguage(nextLang[language]);
    };

    const getFlag = (lang: Language) => {
        switch(lang) {
            case 'pt': return '🇧🇷';
            case 'es': return '🇪🇸';
            case 'en': return '🇺🇸';
        }
    };

    // --- Profile Logic ---
    const handleProfileImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 256; // Avatar size
                    let width = img.width;
                    let height = img.height;

                    // Square crop aspect ratio
                    const minDim = Math.min(width, height);
                    const sx = (width - minDim) / 2;
                    const sy = (height - minDim) / 2;

                    canvas.width = MAX_SIZE;
                    canvas.height = MAX_SIZE;

                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, sx, sy, minDim, minDim, 0, 0, MAX_SIZE, MAX_SIZE);
                    
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    setTempProfile(prev => ({ ...prev, photo: compressedDataUrl }));
                };
                img.src = event.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
    };

    const saveProfile = () => {
        saveUserProfile(tempProfile);
        setUserProfile(tempProfile);
        setProfileModalOpen(false);
        showToast(t('msg_profile_saved'), 'success');
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    return (
        <div className="min-h-screen bg-[#f0f4f8] dark:bg-[#0f1014] text-slate-800 dark:text-slate-200 font-sans selection:bg-primary-200 transition-colors duration-300">
            <InstallManager />

            {/* Evidence Modal */}
            {viewingEvidence && (
                <div 
                    className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setViewingEvidence(null)}
                >
                    <div className="relative max-w-lg w-full">
                        <img 
                            src={viewingEvidence} 
                            alt="Evidence" 
                            className="w-full h-auto rounded-[2rem] shadow-2xl" 
                            onClick={(e) => e.stopPropagation()} 
                        />
                        <button 
                            className="absolute top-4 right-4 bg-white/10 text-white p-3 rounded-full backdrop-blur-md hover:bg-white/20 transition-colors"
                            onClick={() => setViewingEvidence(null)}
                        >
                            <span className="material-icons-round pointer-events-none">close</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Profile Modal */}
            {profileModalOpen && (
                <div 
                    className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setProfileModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 w-full max-w-sm rounded-[3rem] p-8 shadow-2xl transform transition-all animate-slide-up relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                         <button 
                            className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-white p-2"
                            onClick={() => setProfileModalOpen(false)}
                        >
                            <span className="material-icons-round">close</span>
                        </button>

                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-8 text-center">{t('lbl_profile')}</h3>

                        <div className="flex flex-col items-center mb-8">
                            <div className="relative group cursor-pointer" onClick={() => profileImageInputRef.current?.click()}>
                                {tempProfile.photo ? (
                                    <img 
                                        src={tempProfile.photo} 
                                        alt="Profile" 
                                        className="w-28 h-28 rounded-full object-cover border-4 border-slate-100 dark:border-slate-700 shadow-xl"
                                    />
                                ) : (
                                    <div className="w-28 h-28 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center border-4 border-slate-50 dark:border-transparent text-slate-400 dark:text-slate-500 shadow-inner">
                                        <span className="material-icons-round text-5xl">person</span>
                                    </div>
                                )}
                                <div className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full shadow-lg border-2 border-white dark:border-slate-800 group-hover:scale-110 transition-transform">
                                    <span className="material-icons-round text-sm font-bold block">edit</span>
                                </div>
                            </div>
                            <input 
                                ref={profileImageInputRef}
                                type="file" 
                                accept="image/*" 
                                className="hidden"
                                onChange={handleProfileImageUpload}
                            />
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-2 tracking-wide">{t('lbl_name')}</label>
                                <input 
                                    type="text" 
                                    value={tempProfile.name}
                                    onChange={(e) => setTempProfile(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder={t('ph_name')}
                                    className="w-full bg-slate-100 dark:bg-black/20 border-none rounded-2xl px-5 py-4 font-bold text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-500/20 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-2 ml-2 tracking-wide">{t('lbl_role')}</label>
                                <input 
                                    type="text" 
                                    value={tempProfile.role}
                                    onChange={(e) => setTempProfile(prev => ({ ...prev, role: e.target.value }))}
                                    placeholder={t('ph_role')}
                                    className="w-full bg-slate-100 dark:bg-black/20 border-none rounded-2xl px-5 py-4 font-medium text-slate-700 dark:text-white outline-none focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-500/20 transition-all"
                                />
                            </div>
                            
                            <button 
                                onClick={saveProfile}
                                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-4 rounded-2xl font-bold shadow-xl hover:scale-[1.02] active:scale-95 transition-all mt-6"
                            >
                                {t('btn_save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WhatsApp Contact Selection Modal */}
            {whatsappModalOpen && (
                <div 
                    className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fade-in"
                    onClick={() => setWhatsappModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gradient-to-b dark:from-slate-800 dark:to-slate-900 w-full max-w-sm rounded-t-[3rem] sm:rounded-[3rem] p-8 shadow-2xl transform transition-all animate-slide-up"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
                                <span className="bg-[#25D366] text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md">
                                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.001.572 2.09.893 3.182.893h.004c3.178 0 5.767-2.587 5.767-5.766.001-3.185-2.585-5.776-5.767-5.776zm6.868 8.974c-1.686 2.811-4.721 4.397-7.989 4.397h-.006c-1.42 0-2.822-.376-4.079-1.107l-4.529 1.189 1.218-4.414c-.808-1.319-1.236-2.827-1.235-4.383.004-4.543 3.702-8.24 8.241-8.24 2.2 0 4.27 1.171 5.824 2.726 1.554 1.555 2.544 3.749 2.548 6.096.002 1.259-.288 2.457-.865 3.526l.872.21z"/></svg>
                                </span>
                                Enviar Reporte
                            </h3>
                            <button onClick={() => setWhatsappModalOpen(false)} className="bg-slate-100 dark:bg-white/10 p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors">
                                <span className="material-icons-round text-lg">close</span>
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {WHATSAPP_CONTACTS.map((contact, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => sendToContact(contact.number)}
                                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-transparent bg-slate-50 dark:bg-black/20 hover:bg-[#25D366]/10 hover:border-[#25D366] dark:hover:bg-[#25D366]/10 dark:hover:border-transparent hover:text-[#075E54] dark:hover:text-[#25D366] transition-all group active:scale-95"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-sm shadow-sm group-hover:bg-[#25D366] group-hover:text-white transition-colors">
                                            {contact.name[0]}
                                        </div>
                                        <div className="flex flex-col items-start">
                                            <span className="font-bold text-slate-700 dark:text-slate-200 group-hover:text-inherit text-base">{contact.name}</span>
                                            <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{contact.label}</span>
                                        </div>
                                    </div>
                                    <span className="material-icons-round text-slate-300 dark:text-slate-600 group-hover:text-inherit">arrow_forward_ios</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            <main className="max-w-md mx-auto min-h-screen relative">
                
                {/* Modern Header */}
                <header className="px-6 pt-12 pb-6 flex justify-between items-center sticky top-0 z-20 bg-[#f0f4f8]/90 dark:bg-[#0f1014]/80 backdrop-blur-xl transition-all">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center shadow-lg shadow-primary-500/30 text-white">
                            <span className="material-icons-round pointer-events-none">inventory</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-0.5">{t('app_name')}</h1>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold tracking-widest uppercase">{t('app_subtitle')}</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {/* Dark Mode Toggle */}
                        <button 
                            onClick={toggleTheme}
                            className="w-11 h-11 bg-white dark:bg-white/5 rounded-full flex items-center justify-center text-xl shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent hover:scale-110 active:scale-90 transition-all"
                        >
                            <span className="pointer-events-none material-icons-round text-slate-400 dark:text-yellow-400 text-xl">
                                {isDarkMode ? 'light_mode' : 'dark_mode'}
                            </span>
                        </button>

                        {/* Language Switcher */}
                        <button 
                            onClick={toggleLanguage}
                            className="w-11 h-11 bg-white dark:bg-white/5 rounded-full flex items-center justify-center text-xl shadow-sm dark:shadow-none border border-slate-200 dark:border-transparent hover:scale-110 active:scale-90 transition-all"
                        >
                            <span className="pointer-events-none">{getFlag(language)}</span>
                        </button>

                        {/* User Profile Trigger */}
                        <button 
                            onClick={() => { setTempProfile(userProfile); setProfileModalOpen(true); }}
                            className="w-11 h-11 rounded-full flex items-center justify-center border border-slate-200 dark:border-transparent shadow-sm dark:shadow-none hover:scale-110 active:scale-90 transition-all overflow-hidden bg-white dark:bg-white/5 p-0.5"
                        >
                            {userProfile.photo ? (
                                <img src={userProfile.photo} alt={userProfile.name} className="w-full h-full object-cover rounded-full" />
                            ) : (
                                <div className="text-slate-400 dark:text-slate-400 font-bold text-xs">
                                    {getInitials(userProfile.name)}
                                </div>
                            )}
                        </button>
                    </div>
                </header>

                <div className="px-5">
                    {activeTab === 'weigh' ? (
                        <WeighingForm />
                    ) : (
                        <div className="pb-32 space-y-6">
                            
                            {/* --- HISTORY FILTERS SECTION --- */}
                            <div className="sticky top-[100px] z-10 bg-[#f0f4f8]/95 dark:bg-[#0f1014]/90 backdrop-blur-md pb-4 pt-2 transition-colors duration-300">
                                
                                {/* 1. Search Bar */}
                                <div className="relative mb-3">
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder={t('ph_search')}
                                        className="w-full bg-white dark:bg-white/10 border-none rounded-full pl-12 pr-10 py-4 text-sm font-bold shadow-sm dark:shadow-none focus:ring-4 focus:ring-primary-100 dark:focus:ring-white/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-white"
                                    />
                                    <span className="material-icons-round absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">search</span>
                                    {searchTerm && (
                                        <button 
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                        >
                                            <span className="material-icons-round text-lg">close</span>
                                        </button>
                                    )}
                                </div>

                                {/* 2. Time Filters (Horizontal Scroll) */}
                                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                    {[
                                        { id: 'all', label: t('filter_all') },
                                        { id: 'today', label: t('filter_today') },
                                        { id: 'week', label: t('filter_week') },
                                        { id: 'month', label: t('filter_month') },
                                        { id: 'year', label: t('filter_year') }
                                    ].map(filter => (
                                        <button
                                            key={filter.id}
                                            onClick={() => setTimeFilter(filter.id as TimeFilter)}
                                            className={`px-5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                                                timeFilter === filter.id 
                                                ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-900 shadow-md transform scale-105' 
                                                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-transparent hover:bg-slate-100 dark:hover:bg-white/10'
                                            }`}
                                        >
                                            {filter.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-between items-center px-2">
                                <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    {t('hist_recent')} ({filteredRecords.length})
                                </h2>
                            </div>
                            
                            {/* Action Buttons: Export & Delete */}
                            {records.length > 0 && (
                                <div className="grid grid-cols-2 gap-3 mb-2">
                                    <button 
                                        onClick={handleExportCSV}
                                        className="bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-transparent py-4 rounded-3xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-sm dark:shadow-none"
                                        type="button"
                                    >
                                        <span className="material-icons-round">download</span>
                                        <span className="font-bold text-sm">{t('btn_export')}</span>
                                    </button>
                                    <button 
                                        onClick={handleClearHistory}
                                        className="bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-transparent py-4 rounded-3xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-sm dark:shadow-none"
                                        type="button"
                                    >
                                        <span className="material-icons-round">delete_forever</span>
                                        <span className="font-bold text-sm">{t('btn_delete_all_history')}</span>
                                    </button>
                                </div>
                            )}
                            
                            {filteredRecords.length === 0 ? (
                                <div className="text-center py-24 text-slate-300 dark:text-slate-700">
                                    <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-icons-round text-4xl opacity-50 pointer-events-none">history_toggle_off</span>
                                    </div>
                                    <p className="font-bold text-slate-400 dark:text-slate-600">{t('hist_empty')}</p>
                                    {searchTerm && <p className="text-xs mt-2 opacity-70">Intenta con otros términos.</p>}
                                </div>
                            ) : (
                                filteredRecords.map(record => {
                                    const diff = record.netWeight - record.noteWeight;
                                    const isDiff = Math.abs(diff) > TOLERANCE_KG;
                                    const diffColor = isDiff 
                                        ? (diff > 0 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400' : 'text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400') 
                                        : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400';
                                    const statusColor = isDiff ? 'bg-amber-500 shadow-amber-500/20' : 'bg-emerald-500 shadow-emerald-500/20';
                                    
                                    return (
                                        <div key={record.id} className="bg-white dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900 p-5 rounded-[2.5rem] shadow-sm dark:shadow-none border border-slate-100 dark:border-transparent relative overflow-hidden group transition-all hover:shadow-md">
                                            
                                            {/* Status Dot */}
                                            <div className={`absolute left-5 top-6 w-3 h-3 rounded-full shadow-lg ${statusColor}`}></div>

                                            <div className="pl-6">
                                                {/* Card Header */}
                                                <div className="flex justify-between items-start mb-3">
                                                    <div>
                                                        <div className="font-black text-slate-800 dark:text-white text-lg leading-tight tracking-tight">{record.supplier}</div>
                                                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2 mt-1">
                                                            {record.product}
                                                            {record.batch && (
                                                                <span className="bg-slate-100 dark:bg-white/10 px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-500 dark:text-slate-300">
                                                                    L: {record.batch}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs font-bold text-slate-800 dark:text-white">
                                                            {new Date(record.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                                            {new Date(record.timestamp).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Data Grid */}
                                                <div className="bg-slate-50 dark:bg-black/20 rounded-3xl p-4 mb-4 grid grid-cols-3 gap-2 text-center relative">
                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-bold mb-1 tracking-wider">Nota</span>
                                                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-lg">{record.noteWeight}<span className="text-xs text-slate-500 dark:text-slate-400 ml-0.5">kg</span></span>
                                                    </div>
                                                    
                                                    <div className="flex flex-col border-l border-r border-slate-200 dark:border-slate-700/50">
                                                        <span className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-bold mb-1 tracking-wider">Bruto</span>
                                                        <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-lg">{record.grossWeight}<span className="text-xs text-slate-500 dark:text-slate-400 ml-0.5">kg</span></span>
                                                    </div>

                                                    <div className="flex flex-col">
                                                        <span className="text-[9px] uppercase text-slate-400 dark:text-slate-500 font-bold mb-1 tracking-wider">Tara</span>
                                                        <div className="flex flex-col items-center justify-center gap-0.5">
                                                            {record.boxes && record.boxes.qty > 0 && (
                                                                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                                                    <span className="text-sm">📦</span>
                                                                    <span>{record.boxes.qty} × {record.boxes.unitTara}g</span>
                                                                </div>
                                                            )}
                                                            {record.taraEmbalaje && record.taraEmbalaje.qty > 0 && (
                                                                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                                                    <span className="text-sm">📋</span>
                                                                    <span>{record.taraEmbalaje.qty} × {record.taraEmbalaje.unitTara}g</span>
                                                                </div>
                                                            )}
                                                            <span className="font-mono font-bold text-slate-700 dark:text-slate-200 text-lg">{record.taraTotal.toFixed(1)}<span className="text-xs text-slate-500 dark:text-slate-400 ml-0.5">kg</span></span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Result Footer */}
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500 font-bold tracking-wider">{t('hist_liquid')}</span>
                                                        <div className="font-mono font-black text-2xl text-slate-800 dark:text-white tracking-tighter">
                                                            {record.netWeight.toFixed(2)} <span className="text-sm font-bold text-slate-400 dark:text-slate-500">kg</span>
                                                        </div>
                                                    </div>
                                                    
                                                    {/* Buttons Container */}
                                                    <div className="flex items-center gap-2">
                                                        <div className={`px-4 py-2 rounded-2xl flex items-center justify-center ${diffColor}`}>
                                                            <span className="font-mono font-bold text-base leading-none">
                                                                {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                                                            </span>
                                                        </div>

                                                        {record.evidence && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setViewingEvidence(record.evidence!); }}
                                                                className="w-10 h-10 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 rounded-full flex items-center justify-center transition-all cursor-pointer"
                                                                title="Ver Foto"
                                                                type="button"
                                                            >
                                                                <span className="material-icons-round text-lg pointer-events-none">image</span>
                                                            </button>
                                                        )}

                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); openWhatsappModal(record); }}
                                                            className="w-10 h-10 bg-slate-100 dark:bg-white/10 hover:bg-green-100 dark:hover:bg-green-900/30 text-slate-400 dark:text-slate-300 hover:text-green-600 dark:hover:text-green-400 rounded-full flex items-center justify-center transition-all cursor-pointer"
                                                            type="button"
                                                        >
                                                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="pointer-events-none"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.001.572 2.09.893 3.182.893h.004c3.178 0 5.767-2.587 5.767-5.766.001-3.185-2.585-5.776-5.767-5.776zm6.868 8.974c-1.686 2.811-4.721 4.397-7.989 4.397h-.006c-1.42 0-2.822-.376-4.079-1.107l-4.529 1.189 1.218-4.414c-.808-1.319-1.236-2.827-1.235-4.383.004-4.543 3.702-8.24 8.241-8.24 2.2 0 4.27 1.171 5.824 2.726 1.554 1.555 2.544 3.749 2.548 6.096.002 1.259-.288 2.457-.865 3.526l.872.21z"/></svg>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* AI Analysis Section */}
                                                {record.aiAnalysis && (
                                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 animate-fade-in">
                                                        <div className="flex gap-3 items-start text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-black/20 p-3 rounded-2xl">
                                                            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                                                                <span className="material-icons-round text-sm text-indigo-500 dark:text-indigo-400 pointer-events-none">smart_toy</span>
                                                            </div>
                                                            <div className="leading-relaxed opacity-90 pt-1">
                                                                {record.aiAnalysis}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Floating Bottom Nav */}
            <nav className="fixed bottom-6 left-6 right-6 h-20 bg-white/90 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/20 dark:border-transparent shadow-2xl shadow-slate-400/30 dark:shadow-black/60 rounded-full z-40 flex items-center justify-evenly px-2 transition-all duration-300">
                 <button 
                    onClick={() => setActiveTab('weigh')}
                    className={`flex items-center justify-center gap-3 px-8 py-4 rounded-full transition-all duration-300 ${activeTab === 'weigh' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg scale-105' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    type="button"
                >
                    <span className="material-icons-round text-2xl pointer-events-none">scale</span>
                    {activeTab === 'weigh' && <span className="text-sm font-bold pointer-events-none">{t('tab_weigh')}</span>}
                </button>
                
                <button 
                    onClick={() => setActiveTab('history')}
                    className={`flex items-center justify-center gap-3 px-8 py-4 rounded-full transition-all duration-300 ${activeTab === 'history' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg scale-105' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                    type="button"
                >
                    <span className="material-icons-round text-2xl pointer-events-none">receipt_long</span>
                    {activeTab === 'history' && <span className="text-sm font-bold pointer-events-none">{t('tab_history')}</span>}
                </button>
            </nav>

            {/* Global Weighting Chat (only visible in history tab) */}
            {activeTab === 'history' && (
                <GlobalWeighingChat 
                    isVisible={globalChatOpen}
                    onToggle={() => setGlobalChatOpen(!globalChatOpen)}
                    records={records}
                />
            )}
        </div>
    );
};

const App: React.FC = () => {
    return (
        <LanguageProvider>
            <ToastProvider>
                <MainLayout />
            </ToastProvider>
        </LanguageProvider>
    );
};

export default App;
